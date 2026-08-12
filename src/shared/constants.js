/**
 * Centralized constants for Auto Heartbeat.
 * Keeping these in one place avoids magic numbers/strings scattered
 * throughout the codebase and makes future tuning trivial.
 */

/** Keys used in `browser.storage.local`. */
export const STORAGE_KEYS = Object.freeze({
  META: 'meta',
  CONFIGS: 'configs',
  LOGS: 'logs',
  RUN_STATE: 'runState',
  ACTIVE_STATE: 'activeState',
});

/** Current storage schema version. Bump when the stored shape changes. */
export const STORAGE_SCHEMA_VERSION = 1;

/** Name of the recurring alarm that drives the heartbeat scheduler. */
export const ALARM_NAME = 'auto-heartbeat-scheduler-tick';

/** How often the scheduler evaluates active sessions, in minutes. */
export const SCHEDULER_PERIOD_MINUTES = 1;

/** Maximum number of log entries retained in storage. */
export const MAX_LOG_ENTRIES = 500;

/** Supported HTTP methods for heartbeat requests. */
export const HTTP_METHODS = Object.freeze(['GET', 'POST']);

/** Default interval (minutes) suggested to the user for a new rule. */
export const DEFAULT_INTERVAL_MINUTES = 15;

/** Smallest interval (minutes) a user may configure. */
export const MIN_INTERVAL_MINUTES = 1;

/** Largest interval (minutes) a user may configure. */
export const MAX_INTERVAL_MINUTES = 1440;

/** Cookie store ID Firefox uses for ordinary (non-container) tabs. */
export const DEFAULT_COOKIE_STORE_ID = 'firefox-default';

/** Cookie store ID Firefox uses for private browsing tabs. */
export const PRIVATE_COOKIE_STORE_ID = 'firefox-private';
