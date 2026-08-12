import { STORAGE_KEYS, MAX_LOG_ENTRIES } from '../shared/constants.js';
import { createDefaultStorageState } from './schema.js';
import { migrateStorageState } from './migrations.js';

/** Ensures {@link ensureInitialized} only runs its setup logic once per context. */
let initPromise = null;

/**
 * Reads and migrates the full storage state, then persists the migrated
 * shape back to `browser.storage.local`. Safe to call multiple times;
 * subsequent calls resolve to the same in-flight promise.
 *
 * @returns {Promise<void>}
 */
export async function ensureInitialized() {
  if (!initPromise) {
    initPromise = (async () => {
      try {
        const raw = await browser.storage.local.get([
          STORAGE_KEYS.META,
          STORAGE_KEYS.CONFIGS,
          STORAGE_KEYS.LOGS,
          STORAGE_KEYS.RUN_STATE,
          STORAGE_KEYS.ACTIVE_STATE,
        ]);
        const migrated = migrateStorageState({
          meta: raw[STORAGE_KEYS.META],
          configs: raw[STORAGE_KEYS.CONFIGS],
          logs: raw[STORAGE_KEYS.LOGS],
          runState: raw[STORAGE_KEYS.RUN_STATE],
          activeState: raw[STORAGE_KEYS.ACTIVE_STATE],
        });
        await browser.storage.local.set({
          [STORAGE_KEYS.META]: migrated.meta,
          [STORAGE_KEYS.CONFIGS]: migrated.configs,
          [STORAGE_KEYS.LOGS]: migrated.logs,
          [STORAGE_KEYS.RUN_STATE]: migrated.runState,
          [STORAGE_KEYS.ACTIVE_STATE]: migrated.activeState,
        });
      } catch (error) {
        console.error('[AutoHeartbeat] Failed to initialize storage, falling back to defaults.', error);
        const defaults = createDefaultStorageState();
        try {
          await browser.storage.local.set({
            [STORAGE_KEYS.META]: defaults.meta,
            [STORAGE_KEYS.CONFIGS]: defaults.configs,
            [STORAGE_KEYS.LOGS]: defaults.logs,
            [STORAGE_KEYS.RUN_STATE]: defaults.runState,
            [STORAGE_KEYS.ACTIVE_STATE]: defaults.activeState,
          });
        } catch (writeError) {
          console.error('[AutoHeartbeat] Storage is unavailable.', writeError);
        }
      }
    })();
  }
  return initPromise;
}

/**
 * @returns {Promise<import('../models/heartbeatConfig.js').HeartbeatConfig[]>}
 */
export async function getConfigs() {
  await ensureInitialized();
  try {
    const { [STORAGE_KEYS.CONFIGS]: configs } = await browser.storage.local.get(STORAGE_KEYS.CONFIGS);
    return Array.isArray(configs) ? configs : [];
  } catch (error) {
    console.error('[AutoHeartbeat] Failed to read configs from storage.', error);
    return [];
  }
}

/**
 * @param {import('../models/heartbeatConfig.js').HeartbeatConfig[]} configs
 * @returns {Promise<void>}
 */
export async function saveConfigs(configs) {
  try {
    await browser.storage.local.set({ [STORAGE_KEYS.CONFIGS]: configs });
  } catch (error) {
    console.error('[AutoHeartbeat] Failed to save configs to storage.', error);
  }
}

/**
 * @returns {Promise<import('../models/logEntry.js').LogEntry[]>}
 */
export async function getLogs() {
  await ensureInitialized();
  try {
    const { [STORAGE_KEYS.LOGS]: logs } = await browser.storage.local.get(STORAGE_KEYS.LOGS);
    return Array.isArray(logs) ? logs : [];
  } catch (error) {
    console.error('[AutoHeartbeat] Failed to read logs from storage.', error);
    return [];
  }
}

/**
 * Prepends a log entry and trims the log list to {@link MAX_LOG_ENTRIES}.
 *
 * @param {import('../models/logEntry.js').LogEntry} entry
 * @returns {Promise<import('../models/logEntry.js').LogEntry[]>} The trimmed log list.
 */
export async function appendLog(entry) {
  const logs = await getLogs();
  logs.unshift(entry);
  const trimmed = logs.slice(0, MAX_LOG_ENTRIES);
  try {
    await browser.storage.local.set({ [STORAGE_KEYS.LOGS]: trimmed });
  } catch (error) {
    console.error('[AutoHeartbeat] Failed to persist log entry.', error);
  }
  return trimmed;
}

/**
 * @returns {Promise<Record<string, number>>} Map of `${configId}::${cookieStoreId}` to last-run epoch ms.
 */
export async function getRunState() {
  await ensureInitialized();
  try {
    const { [STORAGE_KEYS.RUN_STATE]: runState } = await browser.storage.local.get(STORAGE_KEYS.RUN_STATE);
    return runState && typeof runState === 'object' ? runState : {};
  } catch (error) {
    console.error('[AutoHeartbeat] Failed to read run state from storage.', error);
    return {};
  }
}

/**
 * @param {Record<string, number>} runState
 * @returns {Promise<void>}
 */
export async function saveRunState(runState) {
  try {
    await browser.storage.local.set({ [STORAGE_KEYS.RUN_STATE]: runState });
  } catch (error) {
    console.error('[AutoHeartbeat] Failed to save run state to storage.', error);
  }
}

/**
 * @returns {Promise<{sessions: object[], updatedAt: number}>}
 */
export async function getActiveState() {
  await ensureInitialized();
  try {
    const { [STORAGE_KEYS.ACTIVE_STATE]: activeState } = await browser.storage.local.get(
      STORAGE_KEYS.ACTIVE_STATE
    );
    return activeState && typeof activeState === 'object' ? activeState : { sessions: [], updatedAt: 0 };
  } catch (error) {
    console.error('[AutoHeartbeat] Failed to read active state from storage.', error);
    return { sessions: [], updatedAt: 0 };
  }
}

/**
 * @param {{sessions: object[], updatedAt: number}} activeState
 * @returns {Promise<void>}
 */
export async function saveActiveState(activeState) {
  try {
    await browser.storage.local.set({ [STORAGE_KEYS.ACTIVE_STATE]: activeState });
  } catch (error) {
    console.error('[AutoHeartbeat] Failed to save active state to storage.', error);
  }
}
