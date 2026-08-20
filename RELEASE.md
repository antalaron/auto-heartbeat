# Release

This document describes how **Auto Heartbeat** is released as a Mozilla-signed, **unlisted
(self-distributed)** Firefox extension.

**The release process is fully automated** by
[`.github/workflows/release.yml`](.github/workflows/release.yml) — see the README's
[Releases](README.md#releases) section for how to trigger it and what it does. This document
covers the terminology, prerequisites, and Mozilla-side concepts the workflow implements, for
whoever maintains this repository and needs to understand or change that pipeline, possibly months
after it was last touched. It intentionally does **not** cover local development/debugging — see
the [Development](README.md#development) section of the README for that.

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

Both the [release workflow](.github/workflows/release.yml) and the local `npm run lint`/`npm run
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
3. The [release workflow](.github/workflows/release.yml) runs steps 1–9 above automatically:
   validates the tag against the manifest version, lints and builds, submits to Mozilla for
   signing, verifies and renames the signed `.xpi`, publishes the GitHub Release, and regenerates
   `updates.json` (only after the release asset exists).
4. Spot-check per [Verify the release](#verify-the-release) below once the workflow finishes.

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
  method is the reliable option for this project (see
  [§ 6](#6-publish-the-signed-xpi-automated)).
- **Firefox for Android**: the direct web-download install flow doesn't apply; users must download
  the file and use the on-device "install from file" flow.

## Verify the release

Once the release workflow finishes, before telling users about a new release:

1. Confirm the GitHub Release (Actions tab → workflow run, or the Releases page) has exactly one
   asset, named `auto_heartbeat-<version>.xpi`.
2. Install the signed `.xpi` fresh via `about:addons` → **Install Add-on From File...** in a clean
   Firefox profile, and confirm:
   - It installs without a "corrupt" or "could not be verified" error (this indicates a signing
     problem).
   - `manifest.json`'s permissions/description shown at install time match expectations.
   - The extension's popup and Settings page open and basic rule scheduling works.
3. Confirm `updates.json` on `master` (and at its published
   `raw.githubusercontent.com` URL) contains an entry for the new version whose `update_link`
   matches the Release asset.
4. Confirm the GitHub Release links (README's Installation section) point at the correct asset
   URLs and version.

## Release checklist

The [release workflow](.github/workflows/release.yml) performs all of these automatically; this is
for manually re-verifying a release afterward, or for reasoning about workflow changes:

- [ ] Version bumped in [manifest.json](manifest.json) and committed to `master`
- [ ] Tag `vX.Y.Z` pushed, matching `manifest.json`'s version
- [ ] `web-ext lint --self-hosted` passed with no errors
- [ ] `web-ext build` produced the expected zip
- [ ] Submitted via `web-ext sign --channel=unlisted` and signing succeeded
- [ ] Signed `.xpi` verified (contains `META-INF/mozilla.rsa`, matches expected version/id) and
      renamed to `auto_heartbeat-<version>.xpi`
- [ ] GitHub Release published with that `.xpi` attached
- [ ] `updates.json` updated with the new version's `update_link`/`update_hash`, referencing the
      published Release asset
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
