import { DEFAULT_COOKIE_STORE_ID, PRIVATE_COOKIE_STORE_ID } from '../shared/constants.js';

/** Caches resolved container names for the lifetime of the background context. */
const containerNameCache = new Map();

/**
 * Resolves the human-readable Firefox container ("contextual identity")
 * name for a given cookie store ID, if any. Returns null for the default
 * store (no container) and a fixed label for private browsing, since
 * neither has a `contextualIdentities` entry.
 *
 * @param {string} cookieStoreId
 * @returns {Promise<string|null>}
 */
export async function resolveContainerName(cookieStoreId) {
  if (!cookieStoreId || cookieStoreId === DEFAULT_COOKIE_STORE_ID) return null;
  if (cookieStoreId === PRIVATE_COOKIE_STORE_ID) return 'Private Browsing';

  if (containerNameCache.has(cookieStoreId)) {
    return containerNameCache.get(cookieStoreId);
  }

  if (!browser.contextualIdentities) return null;

  try {
    const identity = await browser.contextualIdentities.get(cookieStoreId);
    const name = identity ? identity.name : null;
    containerNameCache.set(cookieStoreId, name);
    return name;
  } catch (error) {
    console.warn('[AutoHeartbeat] Unable to resolve container name for', cookieStoreId, error);
    return null;
  }
}
