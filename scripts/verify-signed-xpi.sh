#!/usr/bin/env bash
# Verifies a Mozilla-signed .xpi produced by `web-ext sign` and renames it (bytes untouched) to
# the human-readable release filename. Intended to run right after `web-ext sign` in CI, but can
# also be run locally against a manually downloaded signed .xpi for testing.
#
# Usage: scripts/verify-signed-xpi.sh <version> <artifacts-dir> <expected-extension-id>
set -euo pipefail

VERSION="${1:?version required, e.g. 1.2.3}"
ARTIFACTS_DIR="${2:?artifacts directory required, e.g. ./web-ext-artifacts}"
EXPECTED_ID="${3:?expected extension id required}"

shopt -s nullglob
xpis=("$ARTIFACTS_DIR"/*.xpi)
shopt -u nullglob

if [[ ${#xpis[@]} -ne 1 ]]; then
  echo "::error::Expected exactly one .xpi in '$ARTIFACTS_DIR', found ${#xpis[@]}." >&2
  exit 1
fi
SIGNED_XPI="${xpis[0]}"

if [[ ! -s "$SIGNED_XPI" ]]; then
  echo "::error::Signed XPI '$SIGNED_XPI' is empty." >&2
  exit 1
fi

if ! unzip -t "$SIGNED_XPI" >/dev/null; then
  echo "::error::Signed XPI '$SIGNED_XPI' is not a valid ZIP/XPI archive." >&2
  exit 1
fi

if ! unzip -l "$SIGNED_XPI" | grep -q 'META-INF/mozilla.rsa'; then
  echo "::error::Signed XPI '$SIGNED_XPI' has no META-INF/mozilla.rsa - it was not signed by Mozilla." >&2
  exit 1
fi

MANIFEST_JSON=$(unzip -p "$SIGNED_XPI" manifest.json)
MANIFEST_VERSION=$(node -e "console.log(JSON.parse(process.argv[1]).version)" "$MANIFEST_JSON")
MANIFEST_ID=$(node -e "console.log(JSON.parse(process.argv[1]).browser_specific_settings.gecko.id)" "$MANIFEST_JSON")

if [[ "$MANIFEST_VERSION" != "$VERSION" ]]; then
  echo "::error::Signed XPI manifest version '$MANIFEST_VERSION' does not match expected version '$VERSION'." >&2
  exit 1
fi

if [[ "$MANIFEST_ID" != "$EXPECTED_ID" ]]; then
  echo "::error::Signed XPI extension id '$MANIFEST_ID' does not match expected id '$EXPECTED_ID'." >&2
  exit 1
fi

FINAL_NAME="auto_heartbeat-${VERSION}.xpi"
FINAL_PATH="$ARTIFACTS_DIR/$FINAL_NAME"
mv "$SIGNED_XPI" "$FINAL_PATH"

SHA256="$(sha256sum "$FINAL_PATH" | awk '{print $1}')"

echo "Verified signed XPI: id=$MANIFEST_ID version=$MANIFEST_VERSION -> $FINAL_PATH (sha256=$SHA256)"

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  {
    echo "path=$FINAL_PATH"
    echo "filename=$FINAL_NAME"
    echo "sha256=$SHA256"
  } >>"$GITHUB_OUTPUT"
fi
