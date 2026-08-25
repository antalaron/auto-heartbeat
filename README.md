# Auto Heartbeat

A **Firefox and Chrome** browser extension that automatically keeps selected web sessions alive
by sending periodic, configurable HTTP "heartbeat" requests — but **only** while a matching
browser tab is actually open. If no matching tab exists, the extension does nothing at all.

Built with production-quality engineering: Manifest V3, ES modules, no frameworks, no
telemetry, full support for Firefox Multi-Account Containers, and a Chrome Manifest V3 service
worker build that shares nearly all of its logic with the Firefox build.

> Contributing or building from source? See [DEVELOPMENT.md](DEVELOPMENT.md). For the release
> process, see [RELEASE.md](RELEASE.md). For the privacy policy, see
> [PRIVACY_POLICY.md](PRIVACY_POLICY.md).

## Supported Browsers

| Browser | Manifest | Background | Container/session model |
|---------|----------|-------------|--------------------------|
| Firefox | Manifest V3 (event-page style `background.scripts`) | Long-lived event page, restarted automatically by `browser.alarms` | Firefox Multi-Account Containers: each container is an independent `cookieStoreId` and gets its own heartbeat. |
| Chrome  | Manifest V3 (`background.service_worker`) | Ephemeral service worker, woken up by `chrome.alarms` | No container concept. All tabs in a Chrome profile share one cookie context, so matching tabs are deduplicated into a single heartbeat per rule. |

Both builds share essentially the same source code under [`src/`](src/) — see
[DEVELOPMENT.md](DEVELOPMENT.md#architecture) for exactly what's shared versus browser-specific.

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
by `(rule, cookieStoreId)` (see [DEVELOPMENT.md](DEVELOPMENT.md#scheduling-implementation)); since
Chrome tabs never report a `cookieStoreId`, every matching Chrome tab for a given rule falls into the same group automatically
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
- Each session gets its own timer and its own heartbeat request, sent using that tab's own
  container-scoped cookies — so it's always authenticated as the correct container's session (see
  [DEVELOPMENT.md](DEVELOPMENT.md#scheduling-implementation) for the implementation).
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

## Privacy & Security

Auto Heartbeat collects no data, has no telemetry, and only ever talks to the URLs you configure.
See [PRIVACY_POLICY.md](PRIVACY_POLICY.md) for the full privacy policy.

## Installation

### Firefox

Auto Heartbeat is distributed as a signed, unlisted (self-distributed) Firefox extension
through Mozilla's addons.mozilla.org (AMO) signing service, rather than as a public AMO
listing. Signed `.xpi` releases are published from this repository. There are three distinct
ways the extension ends up installed, and it's worth knowing which one you're using:

- **Temporary installation (development only)**: loading `manifest.json` via
  `about:debugging` (see [DEVELOPMENT.md](DEVELOPMENT.md#development) for details). Unsigned,
  removed on every Firefox restart, never updates itself. Only meant for working on the source
  code.
- **Installing the signed `.xpi`**: downloading a release's `.xpi` and using **Install Add-on
  From File...**, as described below. This is the normal way to install Auto Heartbeat as a user.
- **Automatic updates**: once installed from a signed `.xpi` that was built by this project's
  release workflow, Firefox periodically checks the update manifest referenced by `update_url` in
  `manifest.json` and offers newer signed versions automatically — see
  [DEVELOPMENT.md](DEVELOPMENT.md#firefox-automatic-updates) for how this works. Temporary
  installs never do this.

To install a release build:

1. Download the signed `.xpi` for the version you want from the project's
   [GitHub Releases](https://github.com/antalaron/auto-heartbeat/releases) page — the asset is
   named `auto_heartbeat-<version>.xpi`.
2. In Firefox, open `about:addons`, click the gear icon, and choose **Install Add-on From
   File...**, then select the downloaded `.xpi`. Alternatively, open the `.xpi` link directly in a
   tab and Firefox will prompt to install it.
3. Approve the permission prompt.

See [RELEASE.md](RELEASE.md) for background on Mozilla signing/self-distribution, and
[DEVELOPMENT.md](DEVELOPMENT.md#releases) for how this repository automates building, signing and
publishing.

### Chrome

Every tagged release is automatically built, uploaded and published to the **Chrome Web Store**
by the release workflow (see [DEVELOPMENT.md](DEVELOPMENT.md#releases) and [RELEASE.md](RELEASE.md)).
There are two ways to install Auto Heartbeat on Chrome:

- **Chrome Web Store (recommended)**: install/update from the Chrome Web Store listing for this
  extension like any other Chrome extension — Chrome then keeps it up to date automatically,
  exactly like Firefox's `update_url` mechanism. Once the store review for the very first
  submission clears, the listing appears on the Chrome Web Store for the extension id configured
  in the `CHROME_EXTENSION_ID` GitHub Actions secret (see [RELEASE.md](RELEASE.md#chrome-web-store)).
- **Unpacked (local/manual install)**: download `auto_heartbeat-<version>-chrome.zip` from the
  project's [GitHub Releases](https://github.com/antalaron/auto-heartbeat/releases) page (the same
  zip that's uploaded to the Chrome Web Store) and unzip it somewhere permanent, or build it
  yourself — see [DEVELOPMENT.md](DEVELOPMENT.md#development) for details. Then:

  1. Open `chrome://extensions/` in Chrome.
  2. Enable **Developer mode** (top-right toggle).
  3. Click **Load unpacked**.
  4. Select the directory that directly contains `manifest.json` (e.g. the unzipped folder, or
     `dist/chrome/` if you built it locally).
  5. Auto Heartbeat appears in the toolbar; open it or its Settings page like any other extension.

  This unpacked install does **not** auto-update; reinstall (steps 1–5) for a new version, or use
  **Update** in `chrome://extensions/` after replacing the directory's contents. Use this method
  for local development/testing (no Chrome Web Store account needed), or if you prefer not to
  install from the store.

## Development & Contributing

Auto Heartbeat is open source. If you want to run it from source, understand its architecture, or
work on its release pipeline, see [DEVELOPMENT.md](DEVELOPMENT.md) (and [RELEASE.md](RELEASE.md)
for the Mozilla signing / Chrome Web Store publishing process).

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
