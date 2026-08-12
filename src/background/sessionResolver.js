import { matchesDomainPattern } from '../services/domainMatcher.js';

/**
 * Builds the unique key identifying an active session: a specific rule
 * running inside a specific container. This is the granularity at which
 * heartbeats are deduplicated and scheduled.
 *
 * @param {string} configId
 * @param {string} cookieStoreId
 * @returns {string}
 */
export function buildSessionKey(configId, cookieStoreId) {
  return `${configId}::${cookieStoreId}`;
}

/**
 * @typedef {object} ActiveSession
 * @property {string} key
 * @property {import('../models/heartbeatConfig.js').HeartbeatConfig} config
 * @property {string} cookieStoreId
 * @property {number} tabId Representative tab used to run the heartbeat request.
 * @property {string} hostname
 */

/**
 * Determines which (rule, container) pairs currently have at least one
 * matching open tab. Multiple tabs matching the same rule in the same
 * container collapse into a single session; the same rule matching tabs
 * in different containers yields one independent session per container.
 *
 * @param {import('../models/heartbeatConfig.js').HeartbeatConfig[]} configs Enabled, valid configs only.
 * @param {import('./tabScanner.js').OpenTabInfo[]} tabsInfo
 * @returns {Map<string, ActiveSession>}
 */
export function resolveActiveSessions(configs, tabsInfo) {
  const sessions = new Map();

  for (const config of configs) {
    for (const tab of tabsInfo) {
      if (!matchesDomainPattern(config.domain, tab.hostname)) continue;

      const key = buildSessionKey(config.id, tab.cookieStoreId);
      if (sessions.has(key)) continue;

      sessions.set(key, {
        key,
        config,
        cookieStoreId: tab.cookieStoreId,
        tabId: tab.tabId,
        hostname: tab.hostname,
      });
    }
  }

  return sessions;
}
