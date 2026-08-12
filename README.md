# Auto Heartbeat

A Firefox browser extension that automatically keeps selected web sessions alive by sending
periodic, configurable HTTP "heartbeat" requests — but **only** while a matching browser tab is
actually open. If no matching tab exists, the extension does nothing at all.

Built for personal use with production-quality engineering: Manifest V3, ES modules, no
frameworks, no telemetry, and full support for Firefox Multi-Account Containers.

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
├── manifest.json         Manifest V3 definition (Firefox)
├── README.md
├── LICENSE
├── icons/                 Toolbar/app icons (SVG source + generated PNGs)
│
└── src/
    ├── background/        Service worker / event page: scheduler and its collaborators
    │   ├── background.js       Entry point: alarm registration, message routing
    │   ├── scheduler.js        Orchestrates a single scheduler tick
    │   ├── tabScanner.js       Enumerates open tabs into minimal, matchable info
    │   ├── sessionResolver.js  Groups matching tabs into (rule, container) sessions
    │   ├── containerService.js Resolves human-readable container names
    │   └── heartbeatExecutor.js Runs the fetch() inside the matching tab's context
    │
    ├── popup/              Toolbar popup (stats, active countdowns, recent activity)
    ├── options/             Settings page (rule list, add/edit dialog, activity log)
    │
    ├── storage/             browser.storage.local access, schema and migrations
    ├── models/              Plain data factories for configs and log entries
    ├── services/            Business logic shared across UI and background contexts
    ├── utils/               Small, dependency-free helpers (validation, formatting, IDs)
    └── shared/              Constants, cross-context messaging, and the shared theme
```

Each layer has a single responsibility: **models** define shape, **storage** persists it,
**services** implement CRUD/business rules on top of storage, and **background** wires everything
together into the actual scheduling behavior. The popup and options pages import the same
services directly — there is no duplicated business logic between UI surfaces.

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

| Permission            | Why it's needed                                                                 |
|-----------------------|----------------------------------------------------------------------------------|
| `storage`              | Persist rules, activity logs and scheduler state locally.                       |
| `alarms`               | Drive the once-a-minute scheduler tick without polling or busy loops.           |
| `tabs`                 | Enumerate open tabs and read their URLs to determine which rules are active.    |
| `cookies`              | Required by Firefox for reading container (`cookieStoreId`) information.        |
| `contextualIdentities` | Resolve human-readable Firefox container names for the popup and activity log.  |
| `scripting`            | Inject the heartbeat `fetch()` into a matching tab so it runs in that tab's own, container-scoped cookie jar. |
| `host_permissions: <all_urls>` | Heartbeat URLs are entirely user-defined and unknown ahead of time; this allows requests to and script injection into whatever site you configure, in any container. |

No permission is requested that isn't directly used by a feature described above.

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

## Development

This extension is not published on addons.mozilla.org and is meant for personal use. To load it
temporarily in Firefox:

1. Open `about:debugging`.
2. Choose **This Firefox**.
3. Click **Load Temporary Add-on**.
4. Select `manifest.json` from this project's root folder.

### Reloading after changes

Temporary add-ons are unloaded when Firefox restarts, and code changes are not picked up
automatically. After editing source files, return to `about:debugging` → **This Firefox** and
click **Reload** next to Auto Heartbeat.

### Inspecting the extension

- **Background script**: on the `about:debugging` page, click **Inspect** next to Auto Heartbeat
  to open its dedicated DevTools (console, network, etc.).
- **Popup**: right-click the toolbar icon while the popup is open and choose **Inspect**, or open
  the popup and press <kbd>F12</kbd>.
- **Options page**: open it normally (via the popup's "Open Settings" button or
  `about:addons`), then press <kbd>F12</kbd> like any regular page.
- **Storage**: from any of the DevTools consoles above, run
  `await browser.storage.local.get(null)` to inspect the full stored state (rules, logs, scheduler
  state).

## Future Improvements

- Import/export configuration as JSON.
- Aggregate statistics (success rate, average latency) per rule.
- Optional desktop notifications on repeated heartbeat failures.
- Configurable retry policy for transient network failures.
- Configurable scheduler precision (sub-minute) for advanced use cases.
- Rule grouping/tagging for users with many configured domains.
- Chromium/Chrome-compatible build (the codebase already avoids Firefox-only APIs wherever
  possible, aside from `contextualIdentities`, which has no Chromium equivalent).
