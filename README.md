# Auto Heartbeat

A **Firefox and Chrome** browser extension that automatically keeps selected web sessions alive
by sending periodic, configurable HTTP "heartbeat" requests — but **only** while a matching
browser tab is actually open. If no matching tab exists, the extension does nothing at all.

Built with production-quality engineering: Manifest V3, ES modules, no frameworks, no
telemetry, full support for Firefox Multi-Account Containers, and a Chrome Manifest V3 service
worker build that shares nearly all of its logic with the Firefox build.

## Supported Browsers

| Browser | Manifest | Background | Container/session model |
|---------|----------|-------------|--------------------------|
| Firefox | Manifest V3 (event-page style `background.scripts`) | Long-lived event page, restarted automatically by `browser.alarms` | Firefox Multi-Account Containers: each container is an independent `cookieStoreId` and gets its own heartbeat. |
| Chrome  | Manifest V3 (`background.service_worker`) | Ephemeral service worker, woken up by `chrome.alarms` | No container concept. All tabs in a Chrome profile share one cookie context, so matching tabs are deduplicated into a single heartbeat per rule. |

Both builds share essentially the same source code under [`src/`](src/) — see
[Architecture](#architecture) below for exactly what's shared versus browser-specific.

### Firefox: Multi-Account Containers

See [Firefox Containers](#firefox-containers) below — this behavior is unchanged from prior
versions.

### Chrome: single shared session per profile

Chrome has no equivalent to Firefox's `cookieStoreId`/Multi-Account Containers. Within one Chrome
profile, every tab shares the same cookie jar, so:

```text
Chrome
├── Tab 1 → portal.example.com
├── Tab 2 → portal.example.com
└── Tab 3 → portal.example.com
```

is one authenticated session, not three. Auto Heartbeat's scheduler already groups matching tabs
by `(rule, cookieStoreId)` (see [Scheduling](#scheduling)); since Chrome tabs never report a
`cookieStoreId`, every matching Chrome tab for a given rule falls into the same group automatically
— so exactly **one** heartbeat is sent per rule, no matter how many matching tabs are open, and it
stops the moment the last matching tab closes. Auto Heartbeat does **not** attempt to fake or
emulate Firefox container names/behavior on Chrome.

## Overview

Many web applications log users out after a period of inactivity (commonly 15–30 minutes). Auto
Heartbeat solves this by periodically sending a lightweight request (e.g. `GET
https://portal.example.com/api/me`) to keep the server-side session from expiring, but **only**
for as long as you actually have a relevant tab open. Close the tab, and the heartbeats for that
session stop immediately — nothing runs in the background for sites you're not using.

## Firefox Containers

[Firefox Multi-Account Containers](https://addons.mozilla.org/firefox/addon/multi-account-containers/)
let you open tabs in isolated "identities", each with its own cookie jar. This means you can be
logged into the same website as two different users simultaneously — for example a "Personal"
container and a "Work" container both signed into `portal.example.com`, without either session
interfering with the other.

Auto Heartbeat is fully container-aware. Internally, every heartbeat is scheduled per **(domain,
cookieStoreId)** pair rather than per domain alone. That means:

- `portal.example.com` open in the **Personal** container and the **Work** container are treated
  as two completely independent sessions.
- Each session gets its own timer and its own heartbeat request.
- Each request is executed **inside the matching tab itself** (via
  `browser.scripting.executeScript`), so it automatically reuses that tab's cookie store. This is
  the most robust way to guarantee a request is authenticated as the correct container — a
  request fired from the background script would otherwise always use the default (non-container)
  cookie jar and could never authenticate as a specific container's session.
- If you close every tab for a given container, that session's heartbeat stops; the other
  container's heartbeat, if still open, keeps running unaffected.

This allows multiple independent authenticated sessions on the *same* website to remain alive at
the same time, with zero cross-contamination between containers.

## Features

- Manage multiple independent heartbeat rules (add / edit / delete / enable / disable).
- Exact hostname matching (`portal.example.com`) and wildcard subdomain matching
  (`*.example.com`).
- Per-rule HTTP method (`GET`/`POST`), custom headers (JSON), and optional request body.
- Requests are only sent while a matching tab is open — checked once per minute.
- Full Firefox container support: independent scheduling and requests per `(domain,
  cookieStoreId)` pair, executed with the correct cookie jar.
- Duplicate tabs (same rule, same container) never produce duplicate heartbeats.
- Persistent activity log (last ~500 entries) with timestamp, rule, domain, method, URL, HTTP
  status, duration, success/failure, error message, cookie store ID and container name.
- Toolbar popup showing rule counts, live countdowns to the next heartbeat per active session, and
  recent activity — with a shortcut to open Settings.
- Clean, responsive, accessible Settings page with light/dark mode support.
- Never crashes on bad input: malformed URLs, invalid JSON headers, invalid intervals, network
  failures, and storage errors are all caught and logged instead of throwing.
- No analytics, no telemetry, no third-party network calls of any kind.

## Architecture

```text
/
├── manifest.json          Manifest V3 definition (Firefox) - source of truth for the version
├── manifest.chrome.json   Manifest V3 template (Chrome) - version injected at build time
├── README.md
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
into one shared session (see [Chrome: single shared session per profile](#chrome-single-shared-session-per-profile)).

### Manifest differences

| Field | Firefox (`manifest.json`) | Chrome (`manifest.chrome.json`) |
|-------|---------------------------|----------------------------------|
| `background` | `{ "scripts": [...], "type": "module" }` | `{ "service_worker": "...", "type": "module" }` |
| `browser_specific_settings.gecko` | Extension id, `update_url`, min versions | Not applicable to Chrome; omitted |
| `permissions` | Includes `cookies`, `contextualIdentities` | Omits both (Chrome has no container API to support) |
| `version` | Source of truth, bumped by hand | Never hard-coded; injected from `manifest.json` at build time (`npm run build:chrome`) |

Firefox and Chrome manifests are intentionally **not** byte-for-byte identical — each only
declares what its own browser actually supports.

## Configuration

Each heartbeat rule has the following fields:

| Field     | Type              | Description                                                        |
|-----------|-------------------|----------------------------------------------------------------------|
| `enabled` | boolean           | Whether the rule is active.                                        |
| `domain`  | string            | Exact hostname or `*.`-wildcard pattern to match against open tabs. |
| `interval`| number (minutes)  | Minimum time between heartbeats for this rule, 1–1440 minutes.      |
| `method`  | `GET` \| `POST`   | HTTP method used for the request.                                  |
| `url`     | string            | Absolute `http://` or `https://` URL to request.                   |
| `headers` | object            | Optional custom HTTP headers (JSON object of string values).       |
| `body`    | string            | Optional request body (only sent with `POST`).                     |

Example:

```json
{
  "enabled": true,
  "domain": "*.example.com",
  "interval": 15,
  "method": "GET",
  "url": "https://portal.example.com/api/me",
  "headers": {
    "X-CSRF-Token": "..."
  },
  "body": ""
}
```

Rules are managed entirely through the Settings page — there is no need to edit storage directly.

## Matching

Domain matching considers **hostname only**; protocol, path, query string and fragment are always
ignored.

- **Exact match**: `portal.example.com` matches only tabs whose hostname is exactly
  `portal.example.com`.
- **Wildcard match**: `*.example.com` matches `portal.example.com`, `sub.portal.example.com`, and
  the bare `example.com` itself (i.e. the wildcard also matches its own base domain).

## Scheduling

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

## Logging

Up to **500** of the most recent log entries are kept in `browser.storage.local`; once the limit
is reached, the oldest entries are dropped automatically. Each entry records:

- Timestamp
- Rule name/identifier and matched domain
- HTTP method and target URL
- HTTP status code (or none, on network failure)
- Request duration
- Success/failure
- Error message, if any
- Cookie store ID and container name (when available)

Logs are visible in the **Activity Log** tab of the Settings page and, for the most recent
entries, in the toolbar popup.

## Permissions

Firefox and Chrome are reviewed for **minimum required permissions independently** — Chrome does
not receive Firefox-only permissions it has no use for.

### Firefox (`manifest.json`)

| Permission            | Why it's needed                                                                 |
|-----------------------|----------------------------------------------------------------------------------|
| `storage`              | Persist rules, activity logs and scheduler state locally.                       |
| `alarms`               | Drive the once-a-minute scheduler tick without polling or busy loops.           |
| `tabs`                 | Enumerate open tabs and read their URLs to determine which rules are active.    |
| `cookies`              | Required by Firefox for reading container (`cookieStoreId`) information.        |
| `contextualIdentities` | Resolve human-readable Firefox container names for the popup and activity log.  |
| `scripting`            | Inject the heartbeat `fetch()` into a matching tab so it runs in that tab's own, container-scoped cookie jar. |
| `host_permissions: <all_urls>` | Heartbeat URLs are entirely user-defined and unknown ahead of time; this allows requests to and script injection into whatever site you configure, in any container. |

### Chrome (`manifest.chrome.json`)

| Permission            | Why it's needed                                                                 |
|-----------------------|----------------------------------------------------------------------------------|
| `storage`              | Persist rules, activity logs and scheduler state locally.                       |
| `alarms`               | Drive the once-a-minute scheduler tick from the service worker, including waking it back up after Chrome terminates it. |
| `tabs`                 | Enumerate open tabs and read their URLs to determine which rules are active.    |
| `scripting`            | Inject the heartbeat `fetch()` into a matching tab so it runs with that tab's own cookies. |
| `host_permissions: <all_urls>` | Heartbeat URLs are entirely user-defined and unknown ahead of time; this allows requests to and script injection into whatever site you configure. |

Chrome **omits** `cookies` and `contextualIdentities`: Chrome has no Multi-Account Containers
equivalent, so there is no container information to read and no permission requested for it.

No permission is requested on either browser that isn't directly used by a feature described above.

## Privacy

- No analytics or telemetry of any kind are collected by this extension.
- All configuration, logs and scheduler state stay in your local browser storage
  (`browser.storage.local`) and are never transmitted anywhere by the extension itself.
- Heartbeat requests are sent **only** to URLs you explicitly configure — never to any address
  chosen by the extension's author or any third party.

## Security

- Heartbeat requests always use `credentials: "include"`, so they carry the same cookies as the
  matching tab (including its container's session cookie), exactly like a normal request made by
  the page itself.
- Requests are executed inside the actual matching tab via `browser.scripting.executeScript`
  rather than from the background context, which is what guarantees correct container/cookie-jar
  isolation — see [Firefox Containers](#firefox-containers) above.
- Custom headers (e.g. CSRF tokens) you configure are stored locally and only ever sent to the URL
  you specify for that rule.
- The extension never parses, inspects, or stores response bodies — only metadata about the
  outcome (status, duration, success/failure) is logged.
- `host_permissions` are broad (`<all_urls>`) by necessity, since heartbeat targets are entirely
  user-defined; review your configured rules periodically if you have security concerns.

## Installation

### Firefox

Auto Heartbeat is distributed as a signed, unlisted (self-distributed) Firefox extension
through Mozilla's addons.mozilla.org (AMO) signing service, rather than as a public AMO
listing. Signed `.xpi` releases are published from this repository. There are three distinct
ways the extension ends up installed, and it's worth knowing which one you're using:

- **Temporary installation (development only)**: loading `manifest.json` via
  `about:debugging` (see [Development](#development) below). Unsigned, removed on every Firefox
  restart, never updates itself. Only meant for working on the source code.
- **Installing the signed `.xpi`**: downloading a release's `.xpi` and using **Install Add-on
  From File...**, as described below. This is the normal way to install Auto Heartbeat as a user.
- **Automatic updates**: once installed from a signed `.xpi` that was built by this project's
  release workflow, Firefox periodically checks the update manifest referenced by `update_url` in
  `manifest.json` and offers newer signed versions automatically — see
  [Firefox Automatic Updates](#firefox-automatic-updates) below. Temporary installs never do this.

To install a release build:

1. Download the signed `.xpi` for the version you want from the project's
   [GitHub Releases](https://github.com/antalaron/auto-heartbeat/releases) page — the asset is
   named `auto_heartbeat-<version>.xpi`.
2. In Firefox, open `about:addons`, click the gear icon, and choose **Install Add-on From
   File...**, then select the downloaded `.xpi`. Alternatively, open the `.xpi` link directly in a
   tab and Firefox will prompt to install it.
3. Approve the permission prompt.

See [RELEASE.md](RELEASE.md) for background on Mozilla signing/self-distribution, and
[Releases](#releases) below for how this repository automates building, signing and publishing.

### Chrome

Auto Heartbeat is **not currently published on the Chrome Web Store** — it is installed locally as
an unpacked Manifest V3 extension. No Chrome Web Store account or publication is required.

1. Download `auto_heartbeat-<version>-chrome.zip` from the project's
   [GitHub Releases](https://github.com/antalaron/auto-heartbeat/releases) page and unzip it
   somewhere permanent (Chrome loads unpacked extensions from a directory on disk, not a zip) —
   or build it yourself, see [Development](#development) below.
2. Open `chrome://extensions/` in Chrome.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked**.
5. Select the directory that directly contains `manifest.json` (e.g. the unzipped folder, or
   `dist/chrome/` if you built it locally).
6. Auto Heartbeat appears in the toolbar; open it or its Settings page like any other extension.

This unpacked install does **not** auto-update; reinstall (steps 1–5) for a new version, or use
**Update** in `chrome://extensions/` after replacing the directory's contents. If this project is
published to the Chrome Web Store in the future, this section will be updated with the listing URL
and a one-click install path; see [Chrome Web Store](#chrome-web-store) in [RELEASE.md](RELEASE.md)
for what that would require.

## Development

The steps below are for running the extension **from source**, for development and debugging —
this is not how the extension is meant to be installed normally (see [Installation](#installation)
above).

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

No Chrome Web Store account or publication is required for this — see
[Chrome](#chrome-1) under Installation above and [RELEASE.md](RELEASE.md) for more detail.

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

### Local validation

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

## Future Improvements

- Import/export configuration as JSON.
- Aggregate statistics (success rate, average latency) per rule.
- Optional desktop notifications on repeated heartbeat failures.
- Configurable retry policy for transient network failures.
- Configurable scheduler precision (sub-minute) for advanced use cases.
- Rule grouping/tagging for users with many configured domains.
- Chrome Web Store publication (currently Chrome is local-install/unpacked only — see
  [RELEASE.md](RELEASE.md#chrome-web-store)).

## Releases

Releases are fully automated by the [`.github/workflows/release.yaml`](.github/workflows/release.yaml)
GitHub Actions workflow, triggered by pushing a version tag. The workflow has four jobs so a
problem with one browser's build can never silently affect the other, or produce a half-published
release:

```text
validate ──┬─▶ firefox ──┐
           └─▶ chrome  ──┴─▶ release
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
- **`chrome`**: builds the Chrome Manifest V3 package (`npm run build:chrome`) and produces
  `auto_heartbeat-X.Y.Z-chrome.zip`. No Chrome Web Store submission is involved.
- **`release`**: only runs once **both** `firefox` and `chrome` succeed. It creates (or updates) the
  GitHub Release for the tag and attaches both `auto_heartbeat-X.Y.Z.xpi` and
  `auto_heartbeat-X.Y.Z-chrome.zip`, then regenerates the
  [Firefox update manifest](#firefox-automatic-updates) so existing Firefox installs can discover
  the new version. If Chrome's build fails, the release is never created — there is no way to end
  up with a GitHub Release missing the Chrome asset (or vice versa, missing the signed Firefox
  asset).

### Mozilla Signing Credentials

The workflow authenticates to Mozilla's AMO signing API using two repository secrets (Settings →
Secrets and variables → Actions):

| Secret               | Purpose                                                              |
|----------------------|-----------------------------------------------------------------------|
| `WEB_EXT_API_KEY`    | AMO API key (JWT issuer) identifying the Mozilla account allowed to sign this add-on. |
| `WEB_EXT_API_SECRET` | AMO API secret (JWT secret) paired with the key above.               |

Both are generated at
[addons.mozilla.org/developers/addon/api/key/](https://addons.mozilla.org/developers/addon/api/key/)
and are only ever read from `secrets.*` inside the workflow — they are never printed, logged, or
written to any committed file.

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

## Releasing

See [RELEASE.md](RELEASE.md) for background on Mozilla's signing/self-distribution model and
terminology; see [Releases](#releases) above for how this repository automates it end-to-end.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
