# Development

This document is for **contributors and maintainers** working on Auto Heartbeat's source code,
running it locally, or maintaining its release pipeline. If you're just looking to install and use
the extension, see [README.md](README.md) instead. For the detailed Mozilla-signing/Chrome Web
Store release process and terminology, see [RELEASE.md](RELEASE.md).

## Architecture

```text
/
├── manifest.json          Manifest V3 definition (Firefox) - source of truth for the version
├── manifest.chrome.json   Manifest V3 template (Chrome) - version injected at build time
├── README.md
├── DEVELOPMENT.md
├── RELEASE.md
├── PRIVACY_POLICY.md
├── LICENSE
├── icons/                 Toolbar/app icons (SVG source + generated PNGs)
│
├── dist/chrome/           Generated, unpacked Chrome build (git-ignored; `npm run build:chrome`)
│
└── src/
    ├── background/        Service worker / event page: scheduler and its collaborators
    │   ├── background.js       Entry point: alarm registration, message routing
    │   ├── scheduler.js        Orchestrates a single scheduler tick
    │   ├── tabScanner.js       Enumerates open tabs into minimal, matchable info
    │   ├── sessionResolver.js  Groups matching tabs into (rule, container) sessions
    │   ├── containerService.js Resolves human-readable Firefox container names (no-op on Chrome)
    │   └── heartbeatExecutor.js Runs the fetch() inside the matching tab's context
    │
    ├── popup/              Toolbar popup (stats, active countdowns, recent activity)
    ├── options/             Settings page (rule list, add/edit dialog, activity log)
    │
    ├── storage/             browser.storage.local access, schema and migrations
    ├── models/              Plain data factories for configs and log entries
    ├── services/            Business logic shared across UI and background contexts
    ├── utils/               Small, dependency-free helpers (validation, formatting, IDs)
    └── shared/
        ├── browserPolyfill.js  Aliases `browser` to `chrome` when only `chrome` exists
        ├── constants.js        Shared constants (storage keys, alarm name, etc.)
        ├── messaging.js        Cross-context messaging helper
        └── theme.css           Shared popup/options styling
```

Each layer has a single responsibility: **models** define shape, **storage** persists it,
**services** implement CRUD/business rules on top of storage, and **background** wires everything
together into the actual scheduling behavior. The popup and options pages import the same
services directly — there is no duplicated business logic between UI surfaces.

### How the same code runs on both browsers

The entire `src/` tree — scheduler, storage, services, popup, options — is shared verbatim between
Firefox and Chrome. Only two things differ per browser:

1. **The manifest.** `manifest.json` (Firefox) declares `background.scripts` (an event page);
   `manifest.chrome.json` (Chrome) declares `background.service_worker` (a Manifest V3 service
   worker). Nothing else in the manifests meaningfully diverges — see
   [Manifest differences](#manifest-differences) below.
2. **The `browser` global.** Firefox injects a promise-based `browser` global automatically;
   Chrome only injects `chrome`. [`src/shared/browserPolyfill.js`](src/shared/browserPolyfill.js)
   aliases `browser` to `chrome` when `browser` is missing, so every other module can keep calling
   `browser.storage`, `browser.alarms`, `browser.tabs`, `browser.scripting`, etc. unchanged on
   both browsers. It's imported first by every entry point
   ([`background.js`](src/background/background.js), [`popup.js`](src/popup/popup.js),
   [`options.js`](src/options/options.js)).

Firefox-only APIs are isolated to a single module:
[`containerService.js`](src/background/containerService.js) resolves
`browser.contextualIdentities` container names and simply returns `null` when that API doesn't
exist (i.e. on Chrome) — nothing elsewhere in the codebase needs to know which browser it's
running on. The scheduler's session key is already browser-agnostic: it's built from
`(configId, cookieStoreId)`, and since Chrome tabs never report a `cookieStoreId`, every Chrome tab
falls back to the same constant, which is exactly what collapses multiple matching Chrome tabs
into one shared session (see [Chrome: single shared session per profile](README.md#chrome-single-shared-session-per-profile)
in the README).

### Manifest differences

| Field | Firefox (`manifest.json`) | Chrome (`manifest.chrome.json`) |
|-------|---------------------------|----------------------------------|
| `background` | `{ "scripts": [...], "type": "module" }` | `{ "service_worker": "...", "type": "module" }` |
| `browser_specific_settings.gecko` | Extension id, `update_url`, min versions | Not applicable to Chrome; omitted |
| `permissions` | Includes `cookies`, `contextualIdentities` | Omits both (Chrome has no container API to support) |
| `version` | Source of truth, bumped by hand | Never hard-coded; injected from `manifest.json` at build time (`npm run build:chrome`) |

Firefox and Chrome manifests are intentionally **not** byte-for-byte identical — each only
declares what its own browser actually supports.

## Scheduling implementation

A `browser.alarms` alarm fires once every minute and triggers a single scheduler "tick":

1. If there are no enabled rules, do nothing (skip tab enumeration entirely).
2. Enumerate all open browser tabs (`browser.tabs.query({})`), reducing each to its hostname and
   `cookieStoreId`, and discarding tabs with unsupported protocols (internal pages, `file://`,
   etc.).
3. For every enabled rule, find tabs whose hostname matches its domain pattern, and group them by
   `cookieStoreId`. Each unique `(rule, cookieStoreId)` pair is one **active session** — multiple
   matching tabs in the same container collapse into a single session.
4. For each active session, check how long it has been since the last heartbeat. If the
   configured interval has elapsed (or no heartbeat has ever been sent for that session), send one
   heartbeat request; otherwise, skip it until it's due.
5. Heartbeat requests are executed via `browser.scripting.executeScript` inside one representative
   tab for that session, using `fetch()` with `credentials: "include"` and `cache: "no-store"` so
   the request reuses the tab's own (container-scoped) cookies and never a stale cached response.
6. The outcome (success, HTTP status, duration, or error) is recorded to the activity log, and a
   lightweight "active sessions" summary is cached in storage for the popup to render instantly
   without re-scanning tabs itself.

If no tabs match any enabled rule, the scheduler clears its cached state and performs no further
work until a matching tab reappears.

Executing the request via `browser.scripting.executeScript` inside the matching tab (rather than
firing `fetch()` from the background context) is what guarantees correct container/cookie-jar
isolation — a request fired from the background script would otherwise always use the default
(non-container) cookie jar and could never authenticate as a specific Firefox container's session.
See [Firefox Containers](README.md#firefox-containers) in the README for the user-facing behavior
this produces.

## Development

The steps below are for running the extension **from source**, for development and debugging —
this is not how the extension is meant to be installed normally (see the README's
[Installation](README.md#installation) section).

### Firefox

1. Open `about:debugging`.
2. Choose **This Firefox**.
3. Click **Load Temporary Add-on**.
4. Select `manifest.json` from this project's root folder.

Temporary add-ons loaded this way are unsigned, are removed when Firefox restarts, and are only
intended for local testing — they are not a substitute for installing a released version.

Alternatively, [`web-ext`](https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/)
can load and auto-reload the extension for you: `npx web-ext run --source-dir=.`

#### Reloading after changes

Temporary add-ons are unloaded when Firefox restarts, and code changes are not picked up
automatically. After editing source files, return to `about:debugging` → **This Firefox** and
click **Reload** next to Auto Heartbeat.

#### Inspecting the extension

- **Background script**: on the `about:debugging` page, click **Inspect** next to Auto Heartbeat
  to open its dedicated DevTools (console, network, etc.).
- **Popup**: right-click the toolbar icon while the popup is open and choose **Inspect**, or open
  the popup and press <kbd>F12</kbd>.
- **Options page**: open it normally (via the popup's "Open Settings" button or
  `about:addons`), then press <kbd>F12</kbd> like any regular page.
- **Storage**: from any of the DevTools consoles above, run
  `await browser.storage.local.get(null)` to inspect the full stored state (rules, logs, scheduler
  state).

### Chrome

Chrome cannot load `manifest.json`/`manifest.chrome.json` from the repository root directly — it
needs an unpacked directory whose `manifest.json` already has a concrete `"version"` (Chrome's is a
build-time template, see [Manifest differences](#manifest-differences)). Build it first:

```bash
npm run build:chrome   # writes dist/chrome/ (unpacked) and web-ext-artifacts/*-chrome.zip
```

Then:

1. Open `chrome://extensions/`.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked**.
4. Select the generated `dist/chrome/` folder (it directly contains `manifest.json`).

No Chrome Web Store account is needed for this local/unpacked workflow — see the README's
[Chrome installation](README.md#chrome) section and [RELEASE.md](RELEASE.md#chrome-web-store) for
how the release workflow publishes to the store instead.

#### Reloading after changes

Chrome does not watch the filesystem. After editing source files:

```bash
npm run build:chrome
```

then click the **reload icon** on Auto Heartbeat's card in `chrome://extensions/` (or use
**Update** to reload every unpacked extension at once).

#### Inspecting the extension

- **Service worker**: on `chrome://extensions/`, find Auto Heartbeat and click the **service
  worker** link (shown as "service worker" when active, or "Inspect views" once Chrome has
  suspended it — click **service worker** to wake it and open its dedicated DevTools). This is the
  Manifest V3 equivalent of Firefox's background page inspector.
- **Popup**: right-click the toolbar icon while the popup is open and choose **Inspect**.
- **Options page**: open it via the popup's "Open Settings" button, then press
  <kbd>F12</kbd>/<kbd>Cmd+Option+I</kbd> like any regular page.
- **Storage**: from any DevTools console above, run `await chrome.storage.local.get(null)` (or
  `await browser.storage.local.get(null)`, thanks to the polyfill) to inspect the full stored
  state.
- **Alarms**: `chrome://extensions/` doesn't expose alarms directly; from the service worker's
  console run `await chrome.alarms.getAll()` to confirm the scheduler alarm is registered.

## Local validation

A minimal [`package.json`](package.json) (no dependencies; scripts only) provides the same checks
the release workflow runs, without submitting anything to Mozilla, the Chrome Web Store, or GitHub:

```bash
npm run validate                  # checks manifest.json + manifest.chrome.json are well-formed
npm run validate -- --tag v1.2.3  # also checks that tag would match manifest.json's version
npm run lint                      # runs `web-ext lint --self-hosted` against the Firefox build
npm run build:firefox             # runs `web-ext build`, producing ./web-ext-artifacts/*.zip
npm run build:chrome              # writes dist/chrome/ and ./web-ext-artifacts/*-chrome.zip
```

`npm run build` is an alias for `npm run build:firefox`, kept for backwards compatibility.

## Releases

Releases are fully automated by the [`.github/workflows/release.yaml`](.github/workflows/release.yaml)
GitHub Actions workflow, triggered by pushing a version tag. The workflow has four jobs so a
problem with one browser's build can never silently affect the other, or produce a half-published
release:

```text
validate
   │
   ├── firefox (build, sign with Mozilla)          ──┐
   │                                                  ├──▶ release (GitHub Release, both assets)
   └── chrome (build ZIP, publish to Chrome Web Store)┘
```

- **`validate`**: checks the tag matches `vX.Y.Z`, and that it matches `manifest.json`'s
  `"version"` (`v1.2.3` requires `"version": "1.2.3"`) — this is the single source of truth both
  browser builds and the Git tag must agree on. Also validates `manifest.chrome.json`'s shape (see
  [Manifest differences](#manifest-differences)).
- **`firefox`**: lints and builds the extension with `web-ext build`, then submits it to Mozilla's
  AMO signing API via `web-ext sign --channel=unlisted` (self-distributed, not a public AMO listing
  — see [RELEASE.md](RELEASE.md) for the terminology). The job fails if Mozilla rejects the
  submission or signing doesn't succeed, so an unsigned `.xpi` is never published. The signed
  `.xpi` is verified (valid ZIP, contains `META-INF/mozilla.rsa`, bundled `manifest.json` has the
  expected version/extension id) and, without modifying its bytes, renamed to
  `auto_heartbeat-X.Y.Z.xpi`.
- **`chrome`**: builds the Chrome Manifest V3 package (`npm run build:chrome`), producing
  `auto_heartbeat-X.Y.Z-chrome.zip`, then uploads and publishes it to the **Chrome Web Store** via
  the official Chrome Web Store API (see [RELEASE.md](RELEASE.md#chrome-web-store) for the
  credentials/flow). A failed upload or publish fails this job.
- **`release`**: only runs once **both** `firefox` and `chrome` succeed. It creates (or updates) the
  GitHub Release for the tag and attaches both `auto_heartbeat-X.Y.Z.xpi` and
  `auto_heartbeat-X.Y.Z-chrome.zip`, then regenerates the
  [Firefox update manifest](#firefox-automatic-updates) so existing Firefox installs can discover
  the new version. If Chrome's build fails, the release is never created — there is no way to end
  up with a GitHub Release missing the Chrome asset (or vice versa, missing the signed Firefox
  asset).

For the required GitHub Actions secrets (Mozilla signing and Chrome Web Store credentials), see
[RELEASE.md § GitHub Actions Secrets](RELEASE.md#github-actions-secrets).

### Creating a Release

1. Bump `"version"` in [manifest.json](manifest.json) and commit it to `master`.
2. Tag and push:

   ```bash
   git tag v1.2.3
   git push origin v1.2.3
   ```
3. The release workflow runs automatically: it validates the tag/version, builds and signs
   Firefox, builds Chrome, and — only if both succeed — publishes a GitHub Release with both
   `auto_heartbeat-X.Y.Z.xpi` and `auto_heartbeat-X.Y.Z-chrome.zip` attached, and updates the
   Firefox update manifest. Watch its progress under the repository's **Actions** tab.

### Firefox Automatic Updates

[manifest.json](manifest.json)'s `browser_specific_settings.gecko.update_url` points to a stable,
authentication-free URL:

```text
https://raw.githubusercontent.com/antalaron/auto-heartbeat/master/updates.json
```

Firefox periodically fetches that file — the
[Firefox update manifest](https://extensionworkshop.com/documentation/manage/updating-your-extension/)
— which lists every previously published version of Auto Heartbeat for the extension id
`auto-heartbeat@antalaron.hu`, each with an `update_link` pointing at that version's signed `.xpi`
GitHub Release asset and an `update_hash` (`sha256:...`) so Firefox can verify the download. If a
listed version is newer than the one installed, Firefox downloads and installs it automatically.

`updates.json` at the repository root is generated and committed to `master` by the release
workflow (via [`scripts/generate-update-manifest.mjs`](scripts/generate-update-manifest.mjs)) —
it is never hand-edited, and every past version's entry is preserved so users on an old version
always have an upgrade path. The update manifest is only published *after* the corresponding
GitHub Release asset already exists, so Firefox can never discover an update it can't download.

## Future Improvements

- Import/export configuration as JSON.
- Aggregate statistics (success rate, average latency) per rule.
- Optional desktop notifications on repeated heartbeat failures.
- Configurable retry policy for transient network failures.
- Configurable scheduler precision (sub-minute) for advanced use cases.
- Rule grouping/tagging for users with many configured domains.

## Further reading

See [RELEASE.md](RELEASE.md) for the full Mozilla signing/self-distribution model, terminology,
Chrome Web Store publishing credentials, and the maintainer release checklist.
