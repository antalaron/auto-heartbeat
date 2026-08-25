#!/usr/bin/env node
// Validates manifest.json (and, optionally, a git tag against it) before a release is built.
// Usage:
//   node scripts/validate-release.mjs               # validate manifest.json only
//   node scripts/validate-release.mjs --tag v1.2.3  # also validate the tag matches the manifest

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const manifestPath = path.join(rootDir, 'manifest.json');

function fail(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--tag') {
      args.tag = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

if (!existsSync(manifestPath)) {
  fail(`manifest.json not found at ${manifestPath}`);
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch (error) {
  fail(`manifest.json is not valid JSON: ${error.message}`);
}

const version = manifest.version;
if (typeof version !== 'string' || !/^\d+(\.\d+){1,3}$/.test(version)) {
  fail(`manifest.json "version" ("${version}") is not a valid extension version.`);
}

const geckoId = manifest.browser_specific_settings?.gecko?.id;
if (typeof geckoId !== 'string' || geckoId.length === 0) {
  fail('manifest.json is missing "browser_specific_settings.gecko.id".');
}

console.log(`manifest.json OK: id="${geckoId}", version="${version}"`);

const chromeManifestPath = path.join(rootDir, 'manifest.chrome.json');
if (!existsSync(chromeManifestPath)) {
  fail(`manifest.chrome.json not found at ${chromeManifestPath}`);
}

let chromeManifest;
try {
  chromeManifest = JSON.parse(readFileSync(chromeManifestPath, 'utf8'));
} catch (error) {
  fail(`manifest.chrome.json is not valid JSON: ${error.message}`);
}

if (chromeManifest.manifest_version !== 3) {
  fail('manifest.chrome.json must declare "manifest_version": 3.');
}
if (chromeManifest.background?.scripts) {
  fail('manifest.chrome.json must not declare "background.scripts" (Manifest V2 only).');
}
if (chromeManifest.background?.persistent) {
  fail('manifest.chrome.json must not declare "background.persistent" (Manifest V2 only).');
}
if (!chromeManifest.background?.service_worker) {
  fail('manifest.chrome.json must declare "background.service_worker".');
}
if ('version' in chromeManifest) {
  fail('manifest.chrome.json must not hard-code "version" - it is injected from manifest.json at build time.');
}

console.log('manifest.chrome.json OK: Manifest V3 service worker background, no hard-coded version.');

const { tag } = parseArgs(process.argv.slice(2));
if (tag) {
  const tagMatch = /^v(\d+\.\d+\.\d+)$/.exec(tag);
  if (!tagMatch) {
    fail(`Tag "${tag}" does not match the required "vX.Y.Z" format.`);
  }
  const tagVersion = tagMatch[1];
  if (tagVersion !== version) {
    fail(
      `Tag version "${tagVersion}" (from "${tag}") does not match manifest.json version "${version}". ` +
        'Update manifest.json\'s "version" so it matches the tag before releasing.',
    );
  }
  console.log(`Tag "${tag}" matches manifest.json version "${version}".`);
}
