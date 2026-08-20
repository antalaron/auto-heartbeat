#!/usr/bin/env node
// Generates/updates the Firefox update manifest (updates.json) that manifest.json's
// browser_specific_settings.gecko.update_url points to. Safe to re-run: an entry for a version
// that already exists is replaced in place rather than duplicated, and every other previously
// published version is preserved (Firefox update manifests should keep version history).
//
// Usage:
//   node scripts/generate-update-manifest.mjs \
//     --version 1.2.3 \
//     --update-link https://github.com/<owner>/<repo>/releases/download/v1.2.3/auto_heartbeat-1.2.3.xpi \
//     --update-hash sha256:<64 hex chars> \
//     [--file updates.json]

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const manifestPath = path.join(rootDir, 'manifest.json');
const defaultUpdatesPath = path.join(rootDir, 'updates.json');

function fail(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { file: defaultUpdatesPath };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--version') args.version = argv[(i += 1)];
    else if (arg === '--update-link') args.updateLink = argv[(i += 1)];
    else if (arg === '--update-hash') args.updateHash = argv[(i += 1)];
    else if (arg === '--file') args.file = path.resolve(argv[(i += 1)]);
    else fail(`Unknown argument: ${arg}`);
  }
  return args;
}

// Compares two dot-separated integer version strings (Firefox's toolkit version format).
function compareVersions(a, b) {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);
  const length = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

const args = parseArgs(process.argv.slice(2));

if (!args.version || !args.updateLink || !args.updateHash) {
  fail(
    'Usage: generate-update-manifest.mjs --version <x.y.z> --update-link <https url> --update-hash <sha256:...>',
  );
}

if (!/^\d+(\.\d+){1,3}$/.test(args.version)) {
  fail(`"${args.version}" is not a valid extension version.`);
}

if (!args.updateLink.startsWith('https://')) {
  fail(`--update-link must be an https:// URL, got "${args.updateLink}".`);
}

if (!/^sha256:[0-9a-f]{64}$/.test(args.updateHash)) {
  fail(`--update-hash must be formatted as "sha256:<64 hex chars>", got "${args.updateHash}".`);
}

if (!existsSync(manifestPath)) {
  fail(`manifest.json not found at ${manifestPath}`);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const gecko = manifest.browser_specific_settings?.gecko;
const extensionId = gecko?.id;
if (!extensionId) {
  fail('manifest.json is missing "browser_specific_settings.gecko.id".');
}

let updateManifest = { addons: {} };
if (existsSync(args.file)) {
  updateManifest = JSON.parse(readFileSync(args.file, 'utf8'));
  updateManifest.addons ??= {};
}
updateManifest.addons[extensionId] ??= { updates: [] };
updateManifest.addons[extensionId].updates ??= [];

const addon = updateManifest.addons[extensionId];
const entry = {
  version: args.version,
  update_link: args.updateLink,
  update_hash: args.updateHash,
};
if (gecko.strict_min_version) {
  entry.applications = { gecko: { strict_min_version: gecko.strict_min_version } };
}

const existingIndex = addon.updates.findIndex((update) => update.version === args.version);
if (existingIndex >= 0) {
  console.log(`Replacing existing update manifest entry for version ${args.version}.`);
  addon.updates[existingIndex] = entry;
} else {
  addon.updates.push(entry);
}

addon.updates.sort((a, b) => compareVersions(a.version, b.version));

writeFileSync(args.file, `${JSON.stringify(updateManifest, null, 2)}\n`);
console.log(`Wrote ${args.file} with ${addon.updates.length} version(s) for "${extensionId}".`);
