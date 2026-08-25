#!/usr/bin/env node
// Builds the Chrome (Manifest V3) version of Auto Heartbeat as an unpacked directory ready for
// "Load unpacked" in chrome://extensions/, and packages it into a release zip.
//
// The Chrome manifest (manifest.chrome.json) intentionally has no "version" field of its own -
// this script always injects the version from the root manifest.json (the single source of
// truth also used by the Firefox build/release), so the two browser builds can never drift apart.
//
// Usage:
//   node scripts/build-chrome.mjs               # writes dist/chrome/ and the release zip
//   node scripts/build-chrome.mjs --no-zip       # only writes dist/chrome/ (for local testing)

import { readFileSync, writeFileSync, rmSync, mkdirSync, cpSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const distDir = path.join(rootDir, 'dist', 'chrome');
const artifactsDir = path.join(rootDir, 'web-ext-artifacts');

function fail(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}

const skipZip = process.argv.includes('--no-zip');

const firefoxManifestPath = path.join(rootDir, 'manifest.json');
const chromeManifestTemplatePath = path.join(rootDir, 'manifest.chrome.json');

if (!existsSync(firefoxManifestPath)) fail(`manifest.json not found at ${firefoxManifestPath}`);
if (!existsSync(chromeManifestTemplatePath)) {
  fail(`manifest.chrome.json not found at ${chromeManifestTemplatePath}`);
}

const { version } = JSON.parse(readFileSync(firefoxManifestPath, 'utf8'));
if (typeof version !== 'string' || !/^\d+(\.\d+){1,3}$/.test(version)) {
  fail(`manifest.json "version" ("${version}") is not a valid extension version.`);
}

const chromeManifestTemplate = JSON.parse(readFileSync(chromeManifestTemplatePath, 'utf8'));
if (chromeManifestTemplate.manifest_version !== 3) {
  fail('manifest.chrome.json must declare "manifest_version": 3.');
}
if (chromeManifestTemplate.background?.scripts) {
  fail('manifest.chrome.json must not declare "background.scripts" (Manifest V2 only).');
}
if (chromeManifestTemplate.background?.persistent) {
  fail('manifest.chrome.json must not declare "background.persistent" (Manifest V2 only).');
}
if (!chromeManifestTemplate.background?.service_worker) {
  fail('manifest.chrome.json must declare "background.service_worker".');
}
if ('version' in chromeManifestTemplate) {
  fail('manifest.chrome.json must not hard-code "version" - it is injected from manifest.json.');
}

const chromeManifest = { ...chromeManifestTemplate, version };

// Start from a clean directory so stale files from a previous build never leak into the package.
rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

cpSync(path.join(rootDir, 'src'), path.join(distDir, 'src'), { recursive: true });
cpSync(path.join(rootDir, 'icons'), path.join(distDir, 'icons'), { recursive: true });
writeFileSync(path.join(distDir, 'manifest.json'), `${JSON.stringify(chromeManifest, null, 2)}\n`);

console.log(`Wrote unpacked Chrome extension to ${path.relative(rootDir, distDir)} (version ${version}).`);
console.log('Load it locally via chrome://extensions/ -> Developer mode -> Load unpacked.');

if (skipZip) process.exit(0);

mkdirSync(artifactsDir, { recursive: true });
const zipName = `auto_heartbeat-${version}-chrome.zip`;
const zipPath = path.join(artifactsDir, zipName);
rmSync(zipPath, { force: true });

try {
  execFileSync('zip', ['-r', '-X', zipPath, '.'], { cwd: distDir, stdio: 'inherit' });
} catch (error) {
  fail(`Failed to create ${zipName} (is the "zip" CLI installed?): ${error.message}`);
}

console.log(`Wrote ${path.relative(rootDir, zipPath)}.`);
