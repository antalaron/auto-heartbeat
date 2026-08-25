# Release

This document describes how **Auto Heartbeat** is released for both browsers it supports:

- **Firefox**, as a Mozilla-signed, **unlisted (self-distributed)** extension (`.xpi`).
- **Chrome**, as a Manifest V3 extension package (`.zip`), automatically published to the
  **Chrome Web Store** on every tagged release, and also attached to the GitHub Release for
  local/manual installation — see [Chrome Release](#chrome-release) and
  [Chrome Web Store](#chrome-web-store) below.

**The release process is fully automated** by
[`.github/workflows/release.yaml`](.github/workflows/release.yaml) — see the README's
[Releases](README.md#releases) section for how to trigger it and what it does, and
[GitHub Actions](#github-actions) below for the job structure. This document covers the
terminology, prerequisites, and Mozilla-side concepts the workflow implements, for whoever
maintains this repository and needs to understand or change that pipeline, possibly months after
it was last touched. It intentionally does **not** cover local development/debugging — see the
[Development](README.md#development) section of the README for that.

## Terminology

Mozilla's current terminology (see the
[Signing and distributing your add-on](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/)
guide on Extension Workshop) distinguishes:

- **Listed on AMO** — the extension has a public listing page on
  [addons.mozilla.org](https://addons.mozilla.org/) (AMO), is searchable/installable there, and
  Firefox automatically updates it from AMO. This project does **not** use this option.
- **Unlisted / self-distributed** — the extension is still submitted to Mozilla and signed by
  them, but it has **no public AMO listing page** and cannot be found or installed by browsing
  AMO. The maintainer hosts and distributes the signed `.xpi` file themselves (e.g. from their own
  server or a GitHub Releases page). **This is the option Auto Heartbeat uses.**
- **Signed by Mozilla** — every extension, listed or unlisted, must be validated and
  cryptographically signed by Mozilla before Firefox (release/beta channels) will install it.
  Signing is a separate concept from listing: signing always happens via AMO; listing is optional.
- **Self-distributed** — refers to how the *signed* `.xpi` is delivered to users (your own web
  page, a file share, GitHub Releases, etc.), as opposed to users installing directly from an AMO
  listing page. Self-distribution requires the `.xpi` to already be signed by Mozilla — it does
  not mean unsigned or "temporary" installation.

Signing is mandatory even for unlisted extensions because Firefox (release and beta builds)
refuses to install unsigned `.xpi` files. There is no way around Mozilla review/signing for an
extension that regular users can install, short of using unbranded/Nightly/ESR builds with
signature enforcement disabled, which is not a real distribution mechanism for end users.

## Prerequisites

- A [Mozilla account](https://accounts.firefox.com/) used to sign in to
  [addons.mozilla.org](https://addons.mozilla.org/).
- An **AMO API key/secret** pair, generated at
  [addons.mozilla.org/developers/addon/api/key/](https://addons.mozilla.org/developers/addon/api/key/),
  stored as the `WEB_EXT_API_KEY` / `WEB_EXT_API_SECRET` GitHub Actions repository secrets (see
  README's [Mozilla Signing Credentials](README.md#mozilla-signing-credentials)). Treat these like
  a password: never commit them or print them in workflow logs.
- Read the [Add-on Policies](https://extensionworkshop.com/documentation/publish/add-on-policies/)
  and the
  [Firefox Add-on Distribution Agreement](https://extensionworkshop.com/documentation/publish/firefox-add-on-distribution-agreement/)
  — both apply to unlisted extensions too.

Both the [release workflow](.github/workflows/release.yaml) and the local `npm run lint`/`npm run
build` scripts (see README's [Local validation](README.md#local-validation)) use
[`web-ext`](https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/),
Mozilla's own recommended CLI for linting, packaging and signing WebExtensions, invoked with `npx`
(no need to add it as a project dependency). [`package.json`](package.json) in this repository only
declares those scripts; it has no dependencies and isn't part of the shipped extension.

## 1. Prepare the extension for submission (automated)

The release workflow runs this from the repository root before building:

```sh
npx web-ext lint --source-dir=. --self-hosted
```

`--self-hosted` tells the linter this extension is genuinely self-distributed (not hosted/updated
by AMO itself), which is what allows `manifest.json`'s `update_url` — required for
[automatic updates](#8-automatic-updates-for-a-self-distributed-extension) — without the linter
rejecting it as `MANIFEST_UPDATE_URL`.

This runs the same `addons-linter` checks AMO runs during validation, so issues surface before
you submit. As of this writing, the only expected output is one harmless warning:

```
BACKGROUND_SERVICE_WORKER_IGNORED  "/background/service_worker" is unsupported and ignored by
                                    Firefox — make sure "/background/scripts" or
                                    "/background/page" provide Firefox compatibility.
```

This is expected: [manifest.json](manifest.json) declares both `background.scripts` (used by
Firefox) and `background.service_worker` (ignored by Firefox, used by Chromium) for cross-browser
compatibility, so Firefox correctly falls back to `scripts`. There should be **no errors** — the
workflow fails the job if any appear, since AMO's validator would reject the submission otherwise.

Before tagging, bump `"version"` in [manifest.json](manifest.json) and commit it to `master` — see
[Versioning](#versioning) below. The workflow validates that the tag and this version match
(see [Version Source of Truth](README.md#releases) in the README) before building anything.

## 2. Build the release package (automated)

```sh
npx web-ext build --source-dir=. --overwrite-dest --ignore-files "package.json" "scripts/**" "updates.json"
```

This zips the extension (excluding `.git`, other dotfiles, and the release-tooling files listed in
`--ignore-files`) into `./web-ext-artifacts/auto_heartbeat-<version>.zip`, named from the
`name`/`version` fields in [manifest.json](manifest.json). This zip is the file submitted to AMO.

Since this extension is plain ES modules with no bundler/minifier, no separate human-readable
source code package is needed for review (that requirement only applies when the submitted code
is minified/obfuscated/compiled) — see
[Source code submission](https://extensionworkshop.com/documentation/publish/source-code-submission/).

## 3. Submit to AMO as unlisted (self-distributed) (automated)

```sh
npx web-ext sign \
  --source-dir=. \
  --channel=unlisted \
  --artifacts-dir=./web-ext-artifacts \
  --ignore-files "package.json" "scripts/**" "updates.json" \
  --api-key="$WEB_EXT_API_KEY" \
  --api-secret="$WEB_EXT_API_SECRET"
```

`--channel=unlisted` tells AMO this is a self-distributed submission, not a public listing.
`web-ext sign` is the officially documented, actively maintained CLI for the current AMO add-on
signing API (v5) — the workflow uses it directly rather than a third-party GitHub Action, keeping
the implementation transparent and easy to audit. On success, it downloads the signed `.xpi` into
`--artifacts-dir`; the workflow fails the job outright if signing is rejected or times out, so an
unsigned package is never published (see [How Mozilla's review/signing works](#4-how-mozillas-review-signing-works)
below).

`$WEB_EXT_API_KEY` / `$WEB_EXT_API_SECRET` come from the `WEB_EXT_API_KEY` / `WEB_EXT_API_SECRET`
GitHub Actions secrets (see the README's
[Mozilla Signing Credentials](README.md#mozilla-signing-credentials)) — the workflow never echoes
them.

## 4. How Mozilla's review/signing works

- All submissions — listed or unlisted — go through **automated validation** first
  (`addons-linter`), then are **signed**.
- Signing/automated approval is usually fast (minutes to ~24h), but **any** add-on, including
  unlisted ones, can be subject to **manual review** at any time, before or after signing.
- A manual review can reject or later block a version if it violates the
  [Add-on Policies](https://extensionworkshop.com/documentation/publish/add-on-policies/) (e.g.
  requesting more permissions than used, obfuscated code, etc.).
- Unlisted extensions never appear in AMO search/browse — this only affects discoverability, not
  the review requirements.

## 5. Obtain the signed `.xpi` (automated)

`web-ext sign` downloads the signed file automatically into `./web-ext-artifacts/` once signing
completes. The workflow then verifies it (valid ZIP, contains `META-INF/mozilla.rsa`, bundled
`manifest.json` version/id match) via
[`scripts/verify-signed-xpi.sh`](scripts/verify-signed-xpi.sh) and renames it — without touching a
single byte of the signed contents — to `auto_heartbeat-<version>.xpi`.

## 6. Publish the signed XPI (automated)

Self-distribution means hosting the *signed* `.xpi` yourself. This repository's
`homepage_url` and `author` already point at GitHub, so the workflow publishes it as a
**GitHub Release** asset for the pushed tag (creating the release with auto-generated notes, or
re-uploading the asset if the release already exists for that tag).

Two ways users can end up installing it, per Mozilla's
[self-distribution guide](https://extensionworkshop.com/documentation/publish/self-distribution/):

- **One-click web install**: a direct HTTPS link to the `.xpi` triggers installation *only if* the
  server serves it with `Content-Type: application/x-xpinstall`. GitHub Release asset downloads
  are served as `application/octet-stream`, so this does **not** work out of the box from GitHub
  — Firefox will just download the file instead of prompting to install it. If one-click install
  is desired, host the `.xpi` on a server you control that sets this header.
- **Install from file** (works anywhere, including GitHub Releases): the user downloads the
  `.xpi`, then in Firefox opens `about:addons` → gear icon → **Install Add-on From File...** and
  selects it. This is the method documented in the README and works regardless of the hosting
  `Content-Type`.

## 7. How users install the signed extension

See [README.md § Installation](README.md#installation): download the `.xpi` from Releases, then
**Install Add-on From File...** in `about:addons` (or open the `.xpi` URL directly if it's hosted
with the correct `Content-Type`, in which case Firefox prompts to install it directly).

## 8. Automatic updates for a self-distributed extension (configured)

Firefox updates a self-distributed add-on in one of two ways
([Extension Workshop](https://extensionworkshop.com/documentation/publish/self-distribution/)):

1. If `manifest.json` sets `browser_specific_settings.gecko.update_url`, Firefox periodically
   fetches that URL and installs any listed version with a higher version number.
2. Otherwise, Firefox checks whether AMO itself has a *listed* update — which never applies here,
   since this extension is unlisted — so without an `update_url`, users would have to manually
   download and reinstall each new `.xpi`.

`manifest.json` sets:

```jsonc
"browser_specific_settings": {
  "gecko": {
    "id": "auto-heartbeat@antalaron.hu",
    "strict_min_version": "140.0",
    "update_url": "https://raw.githubusercontent.com/antalaron/auto-heartbeat/master/updates.json",
    "data_collection_permissions": { "required": ["none"] }
  },
  "gecko_android": { "strict_min_version": "142.0" }
}
```

(Using `raw.githubusercontent.com` against a file checked into this repo is a convenient
"own server" for a GitHub-hosted project and needs no extra infrastructure or authentication;
see [Firefox Automatic Updates](README.md#firefox-automatic-updates) in the README.)

**Important:** once a signed version with a given `update_url` is installed by users, that URL is
what their existing installs will keep polling. Don't move/rename the update manifest without a
migration plan — see the caveats below.

## 9. The update manifest format

Firefox's update manifest is a plain JSON document
([spec](https://extensionworkshop.com/documentation/manage/updating-your-extension/)), keyed by
extension ID — for this project, `auto-heartbeat@antalaron.hu`:

```json
{
  "addons": {
    "auto-heartbeat@antalaron.hu": {
      "updates": [
        {
          "version": "1.0.0",
          "update_link": "https://github.com/antalaron/auto-heartbeat/releases/download/v1.0.0/auto_heartbeat-1.0.0.xpi"
        },
        {
          "version": "1.1.0",
          "update_link": "https://github.com/antalaron/auto-heartbeat/releases/download/v1.1.0/auto_heartbeat-1.1.0.xpi",
          "update_hash": "sha256:<sha256 of the 1.1.0 .xpi>",
          "applications": {
            "gecko": { "strict_min_version": "140.0" }
          }
        }
      ]
    }
  }
}
```

- `update_link` must be `https://`, or an `update_hash` (`sha256:...` / `sha512:...` of the `.xpi`
  file) must be supplied.
- `applications.gecko.strict_min_version` lets you keep compatibility metadata for a specific
  version in sync with `manifest.json`'s own `strict_min_version`.
- Keep **every previously published version** in the `updates` array — don't remove old entries,
  since a user who hasn't updated in a while still needs a path forward.
- This file must be served over HTTPS.

## 10. Releasing a new version (automated)

See the README's [Creating a Release](README.md#creating-a-release) section. In short:

1. Bump `"version"` in [manifest.json](manifest.json) (see [Versioning](#versioning)) and commit
   it to `master`.
2. `git tag vX.Y.Z && git push origin vX.Y.Z`.
3. The [release workflow](.github/workflows/release.yaml) validates the tag against the manifest
   version, builds and signs Firefox (steps 1–9 above), builds Chrome and publishes it to the
   Chrome Web Store (see [Chrome Release](#chrome-release) below), and — only once both browser
   jobs succeed — publishes the GitHub Release with both artifacts and regenerates `updates.json`.
   See [GitHub Actions](#github-actions) for the exact job structure.
4. Spot-check per [Verify the release](#verify-the-release) below once the workflow finishes.

## Chrome Release

Unlike Firefox, Chrome extensions do not require third-party signing to be installed locally —
Manifest V3 packages just need to be a valid, well-formed zip of the extension source. Pushing a
version tag automatically **builds, uploads and publishes** the Chrome package to the Chrome Web
Store; there is no separate manual publishing step to run.

1. **Building**: `npm run build:chrome` (wraps
   [`scripts/build-chrome.mjs`](scripts/build-chrome.mjs)) assembles an unpacked Chrome build at
   `dist/chrome/`, merging [`manifest.chrome.json`](manifest.chrome.json) (which never hard-codes a
   `"version"`) with the version from the root [`manifest.json`](manifest.json) — the same single
   source of truth Firefox uses, so the two browser builds and the Git tag can never disagree (see
   [Versioning](#versioning)). The script fails loudly if `manifest.chrome.json` doesn't declare
   `"manifest_version": 3`, doesn't declare `background.service_worker`, or declares the
   Manifest-V2-only `background.scripts`/`background.persistent` fields.
2. **Manifest V3**: `manifest.chrome.json` declares `"background": { "service_worker": "...",
   "type": "module" }` — a Chrome Manifest V3 service worker — instead of Firefox's
   `background.scripts` event page. See [Manifest differences](README.md#manifest-differences) in
   the README for the full field-by-field comparison, including why Chrome's permission list is
   deliberately smaller (no `cookies`/`contextualIdentities`, since Chrome has no Multi-Account
   Containers equivalent).
3. **Packaging**: the same script then zips `dist/chrome/` into
   `web-ext-artifacts/auto_heartbeat-<version>-chrome.zip` using the system `zip` CLI (already
   present on GitHub's `ubuntu-latest` runners and on macOS/Linux locally — no extra dependency).
4. **Publishing**: [`scripts/publish-chrome-webstore.sh`](scripts/publish-chrome-webstore.sh)
   uploads and publishes that zip to the Chrome Web Store — see
   [Chrome Web Store](#chrome-web-store) below for exactly how.
5. **Release artifact naming**: `auto_heartbeat-<version>-chrome.zip`, clearly distinct from
   Firefox's `auto_heartbeat-<version>.xpi` (see [GitHub Release](#github-actions) below). The same
   zip that's published to the Chrome Web Store is also attached to the GitHub Release, so both
   distribution channels always ship byte-identical packages for a given version.

### Chrome Web Store

The release workflow's `chrome` job authenticates to the official
[Chrome Web Store API](https://developer.chrome.com/docs/webstore/using_webstore_api/)
(`chromewebstore/v1.1`) using an OAuth2 refresh-token flow — the same mechanism Google documents
for unattended/CI publishing — then uploads the built zip as a new package version and publishes
it. Concretely, [`scripts/publish-chrome-webstore.sh`](scripts/publish-chrome-webstore.sh):

1. Exchanges `CHROME_CLIENT_ID` / `CHROME_CLIENT_SECRET` / `CHROME_REFRESH_TOKEN` for a short-lived
   access token via `POST https://oauth2.googleapis.com/token`.
2. Uploads the zip as a new draft package version via
   `PUT https://www.googleapis.com/upload/chromewebstore/v1.1/items/{CHROME_EXTENSION_ID}` and
   confirms the response reports `"uploadState": "SUCCESS"`.
3. Publishes that uploaded version via
   `POST https://www.googleapis.com/chromewebstore/v1.1/items/{CHROME_EXTENSION_ID}/publish` and
   confirms the response reports `"status": ["OK"]` or `["ITEM_PENDING_REVIEW"]` (a normal outcome
   for extensions that require Google's manual review before going live).

Any non-success response at any step (rejected credentials, upload validation error, publish
rejection, ...) makes the script — and therefore the `chrome` job and the whole release — fail;
the access token and full API responses are never echoed to the workflow log.

#### Obtaining Chrome Web Store credentials

1. Register as a [Chrome Web Store developer](https://chrome.google.com/webstore/devconsole/) if
   you haven't already (one-time, per-account fee) and create/claim the extension's listing to
   obtain its **item/extension ID** — this becomes the `CHROME_EXTENSION_ID` secret.
2. In the [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create an
   OAuth 2.0 **Desktop app** client for the same Google account that manages the Web Store listing.
   This gives you a **client ID** and **client secret** — `CHROME_CLIENT_ID` /
   `CHROME_CLIENT_SECRET`.
3. Enable the **Chrome Web Store API** for that Cloud project.
4. Generate a **refresh token** once, locally, using that client ID/secret via the standard OAuth2
   installed-app flow (authorize with scope `https://www.googleapis.com/auth/chromewebstore`,
   exchange the returned authorization code for tokens, keep only the `refresh_token`) — this
   becomes `CHROME_REFRESH_TOKEN`. This step is interactive and is only ever done once, outside of
   CI; the refresh token is what CI reuses indefinitely afterward.

#### Required GitHub secrets

| Secret                  | Purpose                                                                 |
|--------------------------|--------------------------------------------------------------------------|
| `CHROME_EXTENSION_ID`    | The Chrome Web Store item/extension ID being published to. Never hard-coded into the workflow or source. |
| `CHROME_CLIENT_ID`       | OAuth 2.0 client ID for the Chrome Web Store API.                        |
| `CHROME_CLIENT_SECRET`   | OAuth 2.0 client secret paired with the client ID above.                 |
| `CHROME_REFRESH_TOKEN`   | Long-lived OAuth 2.0 refresh token authorizing unattended publishing on behalf of the Web Store developer account. |

All four are configured under Settings → Secrets and variables → Actions and are only ever read
from `secrets.*` inside the `chrome` job (see [GitHub Actions Secrets](#github-actions-secrets)).

#### Chrome Web Store publication vs. the GitHub Release

These are two independent distribution channels that happen to be produced from the same build in
the same workflow run:

- The **Chrome Web Store listing** is what most users install/update from; Chrome updates it
  automatically, and Google may subject new versions to manual review (`ITEM_PENDING_REVIEW`)
  before they go live — this can take longer than the workflow run itself.
- The **GitHub Release** `auto_heartbeat-X.Y.Z-chrome.zip` asset is the same package, provided for
  local/unpacked installation (see the README's [Chrome installation](README.md#chrome) section)
  and for anyone who wants to inspect exactly what was published without waiting on a store review.

## GitHub Actions

Pushing a tag matching `vX.Y.Z` runs [`.github/workflows/release.yaml`](.github/workflows/release.yaml),
which has four jobs:

```text
validate ──┬──▶ firefox                              ──┐
           └──▶ chrome (build zip, then Web Store publish) ──▶ release
```

- **`validate`**: parses and validates the tag format, checks it matches `manifest.json`'s
  `"version"`, and validates the shape of both `manifest.json` and `manifest.chrome.json` (see
  [`scripts/validate-release.mjs`](scripts/validate-release.mjs)). Everything downstream depends on
  this job, so a bad tag or manifest never reaches Mozilla, the Chrome Web Store, or produces any
  artifact.
- **`firefox`**: lints, builds, and submits the extension to Mozilla for signing (steps 1–6 above),
  then verifies and renames the signed `.xpi`, uploading it as a short-lived workflow artifact.
  Entirely independent of the `chrome` job — nothing here can be affected by a Chrome-side problem.
- **`chrome`**: builds and zips the Chrome package, then uploads and publishes it to the Chrome Web
  Store (see [Chrome Release](#chrome-release) above), uploading the zip as a short-lived workflow
  artifact only after the Web Store publish step succeeds. Independent of the `firefox` job. A
  failed upload or publish fails this job outright — it never reports success while quietly having
  skipped publishing.
- **`release`**: only runs if **both** `firefox` and `chrome` succeed (a normal `needs:` dependency
  in GitHub Actions — if either upstream job fails, `release` is skipped entirely). It downloads
  both workflow artifacts, creates or updates the GitHub Release for the tag with both files
  attached, and regenerates/pushes the [Firefox update manifest](#8-automatic-updates-for-a-self-distributed-extension-configured).

This structure is what guarantees: a failed Mozilla signing can never produce a misleading
"successful" release (the `release` job simply never runs), and a failed Chrome Web Store
upload/publish can never produce a GitHub Release that's missing the Chrome asset (same reason, in
the other direction) — nor can it silently report the overall workflow as successful.

## GitHub Actions Secrets

| Secret                  | Used by       | Purpose                                                              |
|--------------------------|--------------|-------------------------------------------------------------------------|
| `WEB_EXT_API_KEY`        | `firefox` job | AMO API key (JWT issuer) identifying the Mozilla account allowed to sign this add-on. |
| `WEB_EXT_API_SECRET`     | `firefox` job | AMO API secret (JWT secret) paired with the key above.               |
| `CHROME_EXTENSION_ID`    | `chrome` job  | Chrome Web Store item/extension ID being published to.               |
| `CHROME_CLIENT_ID`       | `chrome` job  | OAuth 2.0 client ID for the Chrome Web Store API.                     |
| `CHROME_CLIENT_SECRET`   | `chrome` job  | OAuth 2.0 client secret paired with `CHROME_CLIENT_ID`.               |
| `CHROME_REFRESH_TOKEN`   | `chrome` job  | Long-lived OAuth 2.0 refresh token used to mint access tokens for unattended publishing. |

The Mozilla credentials are generated at
[addons.mozilla.org/developers/addon/api/key/](https://addons.mozilla.org/developers/addon/api/key/);
the Chrome Web Store credentials are obtained as described in
[Obtaining Chrome Web Store credentials](#obtaining-chrome-web-store-credentials) above. All six
secrets are configured under Settings → Secrets and variables → Actions and are only ever read from
`secrets.*` inside the workflow — none are printed, logged, or written to any committed file.

The workflow's `permissions:` block grants only `contents: write` (create releases, push
`updates.json`) — no `issues`, `packages`, or other scopes are requested. Calling the external
Chrome Web Store and Mozilla AMO APIs requires no additional GitHub-side permissions.

## Versioning

`manifest.json`'s `"version"` must follow the
[toolkit version format](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/version)
— up to four dot-separated integers, optionally with a single-letter pre-release suffix (e.g.
`1.2.0`, `1.2.0b1`). Each submitted version must be strictly greater than the previous one; AMO
rejects re-uploads of an existing version number. This project currently uses plain semantic-style
versions (`1.0.0`), which is fully compatible.

There is exactly **one** version for the whole project, and the Git tag is its single source of
truth end-to-end:

- `manifest.json`'s `"version"` is bumped by hand and committed before tagging.
- `manifest.chrome.json` never declares its own `"version"` at all — [`scripts/build-chrome.mjs`](scripts/build-chrome.mjs)
  always injects it from `manifest.json` at build time, so the Chrome build can never drift from
  the Firefox one.
- The pushed tag (`vX.Y.Z`) must match `manifest.json`'s `"version"` (`X.Y.Z`); the `validate` job
  fails the whole workflow otherwise.
- The resulting GitHub Release is named after that same tag, with both browser artifacts embedding
  that same version number in their filenames (`auto_heartbeat-X.Y.Z.xpi`,
  `auto_heartbeat-X.Y.Z-chrome.zip`).

## Restrictions and caveats for self-distributed extensions

- **Still reviewed**: unlisted add-ons are not exempt from Mozilla's
  [Add-on Policies](https://extensionworkshop.com/documentation/publish/add-on-policies/) and can
  be rejected or later blocked after manual review, exactly like listed ones.
- **Signature required to run in release/beta Firefox**: unsigned builds (e.g. the temporary
  `about:debugging` install used during development) only work in Developer Edition/Nightly/ESR
  with a special preference toggled, never as a normal end-user install.
- **`update_url` is a one-way commitment**: Firefox keeps using whatever `update_url` was baked
  into the currently installed version; if that URL later disappears, existing installs cannot
  discover a new one on their own (only an [Enterprise Policy](https://firefox-admin-docs.mozilla.org/reference/policies/extensionsettings/)
  override can redirect them).
- **Minimum Firefox versions**: Firefox versions predating the March 2025 root-certificate
  rotation cannot verify current signatures at all; AMO recommends `strict_min_version` no lower
  than 115 ESR / 128. This project's `strict_min_version` (140.0 desktop / 142.0 Android) already
  satisfies this.
- **200 MB submission size limit** on AMO (not a concern for this project).
- **No public discoverability**: being unlisted means the extension cannot be found by browsing or
  searching AMO — users can only get it from wherever you point them (this repo's Releases page).
- **`Content-Type` for one-click web installs**: only applies if you host the `.xpi` yourself with
  a server you control; GitHub Release assets don't set it, so the "Install Add-on From File"
  method is the reliable option for this project (see
  [§ 6](#6-publish-the-signed-xpi-automated)).
- **Firefox for Android**: the direct web-download install flow doesn't apply; users must download
  the file and use the on-device "install from file" flow.

## Verify the release

Once the release workflow finishes, before telling users about a new release:

1. Confirm the GitHub Release (Actions tab → workflow run, or the Releases page) has exactly two
   assets: `auto_heartbeat-<version>.xpi` and `auto_heartbeat-<version>-chrome.zip`.
2. Install the signed `.xpi` fresh via `about:addons` → **Install Add-on From File...** in a clean
   Firefox profile, and confirm:
   - It installs without a "corrupt" or "could not be verified" error (this indicates a signing
     problem).
   - `manifest.json`'s permissions/description shown at install time match expectations.
   - The extension's popup and Settings page open and basic rule scheduling works.
3. Unzip `auto_heartbeat-<version>-chrome.zip` and load it via `chrome://extensions/` → **Load
   unpacked** in a clean Chrome profile, and confirm:
   - It loads without a manifest error.
   - The unzipped `manifest.json`'s `"version"` matches the release.
   - The extension's popup and Settings page open, and the service worker is inspectable (see the
     README's [Chrome debugging](README.md#chrome) instructions).
4. Confirm the `chrome` job's "Publish to Chrome Web Store" step succeeded, and check the
   [Chrome Web Store developer dashboard](https://chrome.google.com/webstore/devconsole/) shows
   the new version as either live or `ITEM_PENDING_REVIEW` for the extension id in
   `CHROME_EXTENSION_ID`.
4. Confirm `updates.json` on `master` (and at its published
   `raw.githubusercontent.com` URL) contains an entry for the new version whose `update_link`
   matches the Firefox Release asset.
5. Confirm the GitHub Release links (README's Installation section) point at the correct asset
   URLs and version, for both browsers.

## Release checklist

The [release workflow](.github/workflows/release.yaml) performs all of these automatically; this is
for manually re-verifying a release afterward, or for reasoning about workflow changes:

- [ ] Version bumped in [manifest.json](manifest.json) and committed to `master`
- [ ] Tag `vX.Y.Z` pushed, matching `manifest.json`'s version
- [ ] `validate` job: tag/manifest versions agree; `manifest.chrome.json` shape is valid
- [ ] `firefox` job: `web-ext lint --self-hosted` passed with no errors
- [ ] `firefox` job: `web-ext build` produced the expected zip
- [ ] `firefox` job: submitted via `web-ext sign --channel=unlisted` and signing succeeded
- [ ] `firefox` job: signed `.xpi` verified (contains `META-INF/mozilla.rsa`, matches expected
      version/id) and renamed to `auto_heartbeat-<version>.xpi`
- [ ] `chrome` job: `npm run build:chrome` produced `auto_heartbeat-<version>-chrome.zip` with a
      Manifest V3 `background.service_worker` and no `background.scripts`/`persistent`
- [ ] `chrome` job: `scripts/publish-chrome-webstore.sh` uploaded and published the zip to the
      Chrome Web Store (`uploadState: SUCCESS`, `status: OK` or `ITEM_PENDING_REVIEW`)
- [ ] `release` job only ran after both `firefox` and `chrome` succeeded
- [ ] GitHub Release published with both `auto_heartbeat-<version>.xpi` and
      `auto_heartbeat-<version>-chrome.zip` attached
- [ ] `updates.json` updated with the new version's `update_link`/`update_hash`, referencing the
      published Firefox Release asset
- [ ] README's install link/instructions still accurate for both browsers

## References

- [Signing and distributing your add-on](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/) — Extension Workshop
- [Distributing an add-on yourself (self-distribution)](https://extensionworkshop.com/documentation/publish/self-distribution/) — Extension Workshop
- [Submitting an add-on](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/) — Extension Workshop
- [Package your extension](https://extensionworkshop.com/documentation/publish/package-your-extension/) — Extension Workshop
- [web-ext command reference](https://extensionworkshop.com/documentation/develop/web-ext-command-reference/) — Extension Workshop
- [Updating your extension](https://extensionworkshop.com/documentation/manage/updating-your-extension/) — Extension Workshop
- [Add-on Policies](https://extensionworkshop.com/documentation/publish/add-on-policies/) — Extension Workshop
- [Firefox Add-on Distribution Agreement](https://extensionworkshop.com/documentation/publish/firefox-add-on-distribution-agreement/) — Extension Workshop
- [`browser_specific_settings`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings) — MDN
- [`version` format](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/version) — MDN
- [Chrome Web Store API (`chromewebstore/v1.1`)](https://developer.chrome.com/docs/webstore/using_webstore_api/) — Chrome for Developers
- [Chrome Web Store Developer Program Policies](https://developer.chrome.com/docs/webstore/program-policies/) — Chrome for Developers
