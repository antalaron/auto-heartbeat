import { STORAGE_SCHEMA_VERSION } from '../shared/constants.js';
import { createDefaultStorageState } from './schema.js';

/**
 * Upgrades a persisted storage snapshot (of any prior shape) to the
 * current schema version, filling in missing fields with safe defaults.
 *
 * Add new `case` branches to the switch below when introducing breaking
 * storage changes in a future version, so existing installs migrate
 * forward without losing data.
 *
 * @param {object|undefined} rawState Whatever was previously read from `browser.storage.local`.
 * @returns {object} A fully-populated, current-version storage state.
 */
export function migrateStorageState(rawState) {
  const defaults = createDefaultStorageState();
  const state = rawState && typeof rawState === 'object' ? rawState : {};

  const merged = {
    meta: { ...defaults.meta, ...state.meta },
    configs: Array.isArray(state.configs) ? state.configs : defaults.configs,
    logs: Array.isArray(state.logs) ? state.logs : defaults.logs,
    runState: state.runState && typeof state.runState === 'object' ? state.runState : defaults.runState,
    activeState:
      state.activeState && typeof state.activeState === 'object' ? state.activeState : defaults.activeState,
  };

  let version = merged.meta.version || 0;

  // Sequential migrations run here as the schema evolves beyond version 1.
  switch (version) {
    case 0:
      version = 1;
      break;
    default:
      break;
  }

  merged.meta.version = STORAGE_SCHEMA_VERSION;
  return merged;
}
