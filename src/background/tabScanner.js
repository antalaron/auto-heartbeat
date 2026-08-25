import { extractHostname } from '../services/domainMatcher.js';
import { DEFAULT_COOKIE_STORE_ID } from '../shared/constants.js';

/** Only http(s) tabs can meaningfully receive a credentialed heartbeat. */
const SUPPORTED_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * @typedef {object} OpenTabInfo
 * @property {number} tabId
 * @property {string} hostname
 * @property {string} cookieStoreId
 */

/**
 * Enumerates all currently open browser tabs and reduces them to the
 * minimal information the scheduler needs: tab ID, hostname and
 * container (cookie store). Tabs with unsupported protocols (internal
 * pages, `file://`, etc.) are skipped since heartbeats never apply to them.
 *
 * @returns {Promise<OpenTabInfo[]>}
 */
export async function getOpenTabsInfo() {
  let tabs;
  try {
    tabs = await browser.tabs.query({});
  } catch (error) {
    console.error('[AutoHeartbeat] Failed to enumerate open tabs.', error);
    return [];
  }

  const results = [];
  for (const tab of tabs) {
    if (!tab.url) continue;

    let protocol;
    try {
      protocol = new URL(tab.url).protocol;
    } catch {
      continue;
    }
    if (!SUPPORTED_PROTOCOLS.has(protocol)) continue;

    const hostname = extractHostname(tab.url);
    if (!hostname) continue;

    // Chrome tabs have no `cookieStoreId` (no Multi-Account Containers concept),
    // so they all fall back to the same constant here, which naturally groups
    // every matching Chrome tab into a single session per rule in sessionResolver.
    results.push({
      tabId: tab.id,
      hostname,
      cookieStoreId: tab.cookieStoreId || DEFAULT_COOKIE_STORE_ID,
    });
  }
  return results;
}
