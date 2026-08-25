/**
 * Minimal cross-browser shim. Firefox injects a promise-based `browser`
 * global into every extension context; Chrome only injects `chrome`
 * (callback-based historically, but promise-based for most APIs since
 * Chrome 88 when no callback is passed). Aliasing `browser` to `chrome`
 * when it's missing lets every other module in this codebase keep using
 * the single `browser.*` namespace unchanged on both browsers.
 *
 * Must be the first import of every entry point (background, popup,
 * options) so `browser` exists before any other module touches it.
 */
if (typeof globalThis.browser === 'undefined' && typeof globalThis.chrome !== 'undefined') {
  globalThis.browser = globalThis.chrome;
}
