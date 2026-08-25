# Privacy Policy

**Auto Heartbeat** does not collect, store, or transmit any user data to the developer or to any
third party.

## Data collection

Auto Heartbeat collects **no data of any kind** about you or your browsing activity. There is no
analytics, no telemetry, no crash reporting, and no usage tracking built into the extension.

## Data storage

All configuration (heartbeat rules) and activity logs created by Auto Heartbeat are stored
**only** in your browser's local extension storage (`browser.storage.local` /
`chrome.storage.local`), on your own device. This data:

- Never leaves your device except as part of your browser's own optional sync features (e.g.
  Firefox Sync or Chrome Sync), which are controlled entirely by you and your browser, not by this
  extension.
- Is never transmitted to the developer, to any analytics service, or to any other third party.
- Is only ever readable by the extension itself and by you (via your browser's developer tools).

## Network requests

The **only** network requests Auto Heartbeat makes are the heartbeat requests **you explicitly
configure** (a domain, method, headers, and optional body, defined by you in the Settings page).
These requests:

- Are sent only to the URL(s) you configure — never to any address chosen by the developer or any
  third party.
- Are never inspected, parsed, or logged beyond basic metadata (timestamp, HTTP status, duration,
  success/failure, and error message, if any) needed to show you the activity log.
- Never include any data beyond what you configure (custom headers, request body).

Auto Heartbeat itself never makes any network request to the developer or any analytics/tracking
service.

## Third-party sharing

Auto Heartbeat does not share, sell, rent, or otherwise disclose any user data to third parties,
because it does not collect any user data to begin with.

## Permissions

The browser permissions Auto Heartbeat requests (`storage`, `alarms`, `tabs`, `scripting`,
`cookies`/`contextualIdentities` on Firefox, and `host_permissions`) are used exclusively to
implement the heartbeat-scheduling feature described in [README.md](README.md) — see that
document's [Permissions](README.md#permissions) section for exactly why each one is needed. None
of them are used to collect or transmit data about you.

## Changes to this policy

If this policy ever changes, the updated version will be committed to this file in the project's
source repository, and the version history will remain visible via the repository's commit log.

## Contact

This is an open-source project. For questions about this policy, please open an issue on the
project's [GitHub repository](https://github.com/antalaron/auto-heartbeat).
