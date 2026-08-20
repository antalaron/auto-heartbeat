# Release

This document describes how **Auto Heartbeat** is released as a Mozilla-signed, **unlisted
(self-distributed)** Firefox extension, and how to publish subsequent versions.

It is written for whoever maintains this repository and needs to cut a release, possibly months
after the last one. It intentionally does **not** cover local development/debugging — see the
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
  [addons.mozilla.org/developers/addon/api/key/](https://addons.mozilla.org/developers/addon/api/key/).
  Treat these like a password: keep them out of git and CI logs (e.g. export them as
  `WEB_EXT_API_KEY` / `WEB_EXT_API_SECRET` environment variables, never commit them).
- Node.js (for running `web-ext` via `npx`; no other project dependencies are required — this
  repository has no `package.json`/build step, it ships plain ES modules directly from `src/`).
- Read the [Add-on Policies](https://extensionworkshop.com/documentation/publish/add-on-policies/)
  and the
  [Firefox Add-on Distribution Agreement](https://extensionworkshop.com/documentation/publish/firefox-add-on-distribution-agreement/)
  — both apply to unlisted extensions too.

This project has no existing build tooling or CI release scripts, so the steps below use
[`web-ext`](https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/),
Mozilla's own recommended CLI for linting, packaging and signing WebExtensions, invoked with
`npx` (no need to add it as a project dependency).

## 1. Prepare the extension for submission

From the repository root:

```sh
npx web-ext lint --source-dir=.
```

This runs the same `addons-linter` checks AMO runs during validation, so issues surface before
you submit. As of this writing, the only expected output is one harmless warning:

```
BACKGROUND_SERVICE_WORKER_IGNORED  "/background/service_worker" is unsupported and ignored by
                                    Firefox — make sure "/background/scripts" or
                                    "/background/page" provide Firefox compatibility.
```

This is expected: [manifest.json](manifest.json) declares both `background.scripts` (used by
Firefox) and `background.service_worker` (ignored by Firefox, used by Chromium) for cross-browser
compatibility, so Firefox correctly falls back to `scripts`. There should be **no errors** — fix
any that appear before continuing, since AMO's validator will reject the submission otherwise.

Also bump the version in [manifest.json](manifest.json) (`"version"`) before building — see
[Versioning](#versioning) below.

## 2. Build the release package

```sh
npx web-ext build --source-dir=. --overwrite-dest
```

This zips the extension (excluding `.git` and other unwanted files) into
`./web-ext-artifacts/auto_heartbeat-<version>.zip`, named from the `name`/`version` fields in
[manifest.json](manifest.json). This zip is the file you submit to AMO — it does not need to be
renamed to `.xpi` before upload.

Since this extension is plain ES modules with no bundler/minifier, no separate human-readable
source code package is needed for review (that requirement only applies when the submitted code
is minified/obfuscated/compiled) — see
[Source code submission](https://extensionworkshop.com/documentation/publish/source-code-submission/).

## 3. Submit to AMO as unlisted (self-distributed)

Either through the web UI or the CLI:

### Option A — `web-ext sign` (CLI)

```sh
npx web-ext sign \
  --source-dir=. \
  --channel=unlisted \
  --api-key="$WEB_EXT_API_KEY" \
  --api-secret="$WEB_EXT_API_SECRET"
```

`--channel=unlisted` tells AMO this is a self-distributed submission, not a public listing. On
success, `web-ext sign` downloads the signed `.xpi` into `./web-ext-artifacts/`.

### Option B — AMO Developer Hub (web UI)

1. Go to the [Add-ons Developer Hub](https://addons.mozilla.org/developers/) →
   **Submit a New Add-on** (or, for later versions, open the existing listing and **Upload New
   Version**).
2. Choose **On your own** (self-distribution), not "On this site".
3. Upload the zip produced in step 2.
4. Answer the source-code-submission question (No, for this project — see above).
5. Submit. You'll land on a "Version Signature Pending" page.

Both options are equivalent; the CLI is easier to script/repeat for later releases.

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

## 5. Obtain the signed `.xpi`

- Via `web-ext sign`: the signed file is downloaded automatically to
  `./web-ext-artifacts/auto_heartbeat-<version>.xpi` once signing completes.
- Via the web UI: you'll get an email when signing finishes; open the version from **My Add-ons**
  → the version's page → right-click the file link → **Save Link As...**.

## 6. Publish the signed XPI

Self-distribution means hosting the *signed* `.xpi` yourself. This repository's
`homepage_url` and `author` already point at GitHub, so the simplest option that requires no new
infrastructure is a **GitHub Release**:

1. Tag the release, e.g. `git tag v1.1.0 && git push origin v1.1.0`.
2. Create a GitHub Release for that tag and attach `auto_heartbeat-<version>.xpi` as a release
   asset.
3. Link to it from the README's [Installation](README.md#installation) section (already pointing
   at `https://github.com/antalaron/auto-heartbeat/releases`).

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

## 8. Automatic updates for a self-distributed extension

Firefox updates a self-distributed add-on in one of two ways
([Extension Workshop](https://extensionworkshop.com/documentation/publish/self-distribution/)):

1. If `manifest.json` sets `browser_specific_settings.gecko.update_url`, Firefox periodically
   fetches that URL and installs any listed version with a higher version number.
2. Otherwise, Firefox checks whether AMO itself has a *listed* update — which never applies here,
   since this extension is unlisted — so **without an `update_url`, users must manually download
   and reinstall each new `.xpi`.**

`manifest.json` currently has **no `update_url` set**, so updates are manual today. To enable
automatic updates:

1. Host an update manifest JSON file at a stable **HTTPS** URL (see format below).
2. Add it to [manifest.json](manifest.json):

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
   "own server" for a GitHub-hosted project and needs no extra infrastructure; any other HTTPS
   host serving the same JSON works too.)
3. Rebuild and re-sign — the `update_url` is part of the manifest, so it's included in every
   subsequent signed `.xpi`.

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

## 10. Releasing a new version and updating the update manifest

For each new release:

1. Bump `"version"` in [manifest.json](manifest.json) (see [Versioning](#versioning)).
2. Run `npx web-ext lint --source-dir=.` and fix any errors.
3. `npx web-ext build --source-dir=. --overwrite-dest`.
4. `npx web-ext sign --source-dir=. --channel=unlisted --api-key=... --api-secret=...` (or the web
   UI) to get the newly signed `.xpi`.
5. Tag the repository (`vX.Y.Z`) and create a GitHub Release with the signed `.xpi` attached.
6. If using `update_url` (step 8 above), append a new entry for this version to the update
   manifest JSON (`update_link` pointing at the new release asset, plus `update_hash` if not
   served over HTTPS) and publish the updated manifest at its stable URL.
7. Verify per [Verify the release](#verify-the-release) below.

## Versioning

`manifest.json`'s `"version"` must follow the
[toolkit version format](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/version)
— up to four dot-separated integers, optionally with a single-letter pre-release suffix (e.g.
`1.2.0`, `1.2.0b1`). Each submitted version must be strictly greater than the previous one; AMO
rejects re-uploads of an existing version number. This project currently uses plain semantic-style
versions (`1.0.0`), which is fully compatible.

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
  method is the reliable option for this project (see [§ 6](#6-publish-the-signed-xpi)).
- **Firefox for Android**: the direct web-download install flow doesn't apply; users must download
  the file and use the on-device "install from file" flow.

## Verify the release

Before telling users about a new release:

1. Confirm the downloaded file is actually signed: unzip it and check for a
   `META-INF/mozilla.rsa` file (only present in Mozilla-signed packages).
2. Install the signed `.xpi` fresh via `about:addons` → **Install Add-on From File...** in a clean
   Firefox profile, and confirm:
   - It installs without a "corrupt" or "could not be verified" error (this indicates a signing
     problem).
   - `manifest.json`'s permissions/description shown at install time match expectations.
   - The extension's popup and Settings page open and basic rule scheduling works.
3. If `update_url` is configured, confirm the update manifest is valid JSON, reachable over HTTPS,
   and contains an entry for the new version.
4. Confirm the GitHub Release links (README's Installation section) point at the correct asset
   URLs and version.

## Release checklist

- [ ] Version bumped in [manifest.json](manifest.json)
- [ ] `npx web-ext lint --source-dir=.` passes with no errors
- [ ] `npx web-ext build --source-dir=.` produces the expected zip
- [ ] Submitted via `web-ext sign --channel=unlisted` (or AMO web UI, "On your own")
- [ ] Signed `.xpi` downloaded/retrieved
- [ ] Signed `.xpi` verified (contains `META-INF/mozilla.rsa`, installs cleanly)
- [ ] Git tag created for the release
- [ ] GitHub Release published with the signed `.xpi` attached
- [ ] Update manifest updated with the new version's `update_link` (if `update_url` is configured)
- [ ] README's install link/instructions still accurate

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
