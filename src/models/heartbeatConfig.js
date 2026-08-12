import { generateId } from '../utils/id.js';
import { DEFAULT_INTERVAL_MINUTES } from '../shared/constants.js';

/**
 * @typedef {object} HeartbeatConfig
 * @property {string} id Unique identifier.
 * @property {string} name Optional user-facing label.
 * @property {boolean} enabled Whether the rule is active.
 * @property {string} domain Exact hostname or `*.`-wildcard pattern to match.
 * @property {number} interval Minutes between heartbeats.
 * @property {'GET'|'POST'} method HTTP method used for the request.
 * @property {string} url Target URL for the heartbeat request.
 * @property {Record<string,string>} headers Optional custom headers.
 * @property {string} body Optional request body (POST only).
 * @property {number} createdAt Creation timestamp (epoch ms).
 * @property {number} updatedAt Last modification timestamp (epoch ms).
 */

/**
 * Builds a normalized {@link HeartbeatConfig} from partial user input,
 * filling in sensible defaults for any missing field.
 *
 * @param {Partial<HeartbeatConfig>} [input]
 * @returns {HeartbeatConfig}
 */
export function createHeartbeatConfig(input = {}) {
  const now = Date.now();
  return {
    id: input.id || generateId(),
    name: typeof input.name === 'string' ? input.name.trim() : '',
    enabled: input.enabled !== undefined ? Boolean(input.enabled) : true,
    domain: typeof input.domain === 'string' ? input.domain.trim() : '',
    interval: Number.isFinite(input.interval) ? input.interval : DEFAULT_INTERVAL_MINUTES,
    method: input.method === 'POST' ? 'POST' : 'GET',
    url: typeof input.url === 'string' ? input.url.trim() : '',
    headers: input.headers && typeof input.headers === 'object' ? { ...input.headers } : {},
    body: typeof input.body === 'string' ? input.body : '',
    createdAt: Number.isFinite(input.createdAt) ? input.createdAt : now,
    updatedAt: now,
  };
}

/**
 * Returns the best available human-readable label for a configuration.
 *
 * @param {HeartbeatConfig} config
 * @returns {string}
 */
export function getDisplayName(config) {
  return config.name || config.domain || config.url || config.id;
}
