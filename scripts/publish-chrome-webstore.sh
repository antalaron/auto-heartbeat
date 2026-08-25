#!/usr/bin/env bash
# Uploads and publishes a Chrome extension package via the official Chrome Web Store API
# (chromewebstore/v1.1, the same API/console-generated OAuth credentials Google documents for CI
# publishing: https://developer.chrome.com/docs/webstore/using_webstore_api/). Intended to run in
# CI right after `npm run build:chrome`, but can also be run locally against a manually built zip.
#
# Usage:
#   CHROME_EXTENSION_ID=... CHROME_CLIENT_ID=... CHROME_CLIENT_SECRET=... CHROME_REFRESH_TOKEN=... \
#     scripts/publish-chrome-webstore.sh <path-to-chrome-zip>
set -euo pipefail

ZIP_PATH="${1:?path to the Chrome extension zip is required}"

: "${CHROME_EXTENSION_ID:?CHROME_EXTENSION_ID is required}"
: "${CHROME_CLIENT_ID:?CHROME_CLIENT_ID is required}"
: "${CHROME_CLIENT_SECRET:?CHROME_CLIENT_SECRET is required}"
: "${CHROME_REFRESH_TOKEN:?CHROME_REFRESH_TOKEN is required}"

if [[ ! -s "$ZIP_PATH" ]]; then
  echo "::error::Chrome zip '$ZIP_PATH' does not exist or is empty." >&2
  exit 1
fi

echo "Requesting a Chrome Web Store API access token..."
# The response body (and therefore the access token) is deliberately never echoed to the log.
TOKEN_RESPONSE="$(curl -sS -X POST https://oauth2.googleapis.com/token \
  -d "client_id=${CHROME_CLIENT_ID}" \
  -d "client_secret=${CHROME_CLIENT_SECRET}" \
  -d "refresh_token=${CHROME_REFRESH_TOKEN}" \
  -d "grant_type=refresh_token")"

ACCESS_TOKEN="$(jq -r '.access_token // empty' <<<"$TOKEN_RESPONSE")"
if [[ -z "$ACCESS_TOKEN" ]]; then
  echo "::error::Failed to obtain a Chrome Web Store access token (check CHROME_CLIENT_ID/CHROME_CLIENT_SECRET/CHROME_REFRESH_TOKEN)." >&2
  exit 1
fi

echo "Uploading $(basename "$ZIP_PATH") to Chrome Web Store item ${CHROME_EXTENSION_ID}..."
UPLOAD_RESPONSE="$(curl -sS -X PUT \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "x-goog-api-version: 2" \
  -T "$ZIP_PATH" \
  "https://www.googleapis.com/upload/chromewebstore/v1.1/items/${CHROME_EXTENSION_ID}")"

UPLOAD_STATE="$(jq -r '.uploadState // empty' <<<"$UPLOAD_RESPONSE")"
if [[ "$UPLOAD_STATE" != "SUCCESS" ]]; then
  echo "::error::Chrome Web Store upload failed (uploadState=${UPLOAD_STATE:-unknown}): $(jq -c '.itemError // .' <<<"$UPLOAD_RESPONSE")" >&2
  exit 1
fi
echo "Upload succeeded (uploadState=SUCCESS)."

echo "Publishing Chrome Web Store item ${CHROME_EXTENSION_ID}..."
PUBLISH_RESPONSE="$(curl -sS -X POST \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "x-goog-api-version: 2" \
  -H "Content-Length: 0" \
  "https://www.googleapis.com/chromewebstore/v1.1/items/${CHROME_EXTENSION_ID}/publish?publishTarget=default")"

PUBLISH_STATUS="$(jq -r '.status[0] // empty' <<<"$PUBLISH_RESPONSE")"
case "$PUBLISH_STATUS" in
  OK|ITEM_PENDING_REVIEW)
    echo "Chrome Web Store publish request accepted (status=${PUBLISH_STATUS})."
    ;;
  *)
    echo "::error::Chrome Web Store publish failed (status=${PUBLISH_STATUS:-unknown}): $(jq -c '.statusDetail // .' <<<"$PUBLISH_RESPONSE")" >&2
    exit 1
    ;;
esac
