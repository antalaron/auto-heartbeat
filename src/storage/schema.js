import { STORAGE_SCHEMA_VERSION } from '../shared/constants.js';

/**
 * Returns a fresh, empty storage state matching the current schema
 * version. Used on first install and as a fallback if stored data is
 * ever unreadable.
 *
 * @returns {object}
 */
export function createDefaultStorageState() {
  return {
    meta: { version: STORAGE_SCHEMA_VERSION },
    configs: [],
    logs: [],
    runState: {},
    activeState: { sessions: [], updatedAt: 0 },
  };
}
