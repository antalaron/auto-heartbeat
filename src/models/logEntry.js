import { generateId } from '../utils/id.js';

/**
 * @typedef {object} LogEntry
 * @property {string} id Unique identifier.
 * @property {number} timestamp When the request was attempted (epoch ms).
 * @property {string} configId ID of the rule that triggered the request.
 * @property {string} configName Display name of the rule at the time of the request.
 * @property {string} domain Domain pattern that matched.
 * @property {string} cookieStoreId Cookie store (container) the request ran in.
 * @property {string|null} containerName Human-readable container name, if available.
 * @property {'GET'|'POST'} method HTTP method used.
 * @property {string} url Target URL requested.
 * @property {number|null} status HTTP status code, or null on network failure.
 * @property {number|null} durationMs Request duration in milliseconds.
 * @property {boolean} success Whether the request completed with a 2xx/3xx-ok response.
 * @property {string|null} error Error message, if any.
 */

/**
 * Builds a normalized {@link LogEntry} from raw heartbeat result data.
 *
 * @param {Partial<LogEntry>} data
 * @returns {LogEntry}
 */
export function createLogEntry(data) {
  return {
    id: data.id || generateId(),
    timestamp: Number.isFinite(data.timestamp) ? data.timestamp : Date.now(),
    configId: data.configId || null,
    configName: data.configName || 'Unknown rule',
    domain: data.domain || '',
    cookieStoreId: data.cookieStoreId || 'firefox-default',
    containerName: data.containerName || null,
    method: data.method || 'GET',
    url: data.url || '',
    status: data.status ?? null,
    durationMs: data.durationMs ?? null,
    success: Boolean(data.success),
    error: data.error || null,
  };
}
