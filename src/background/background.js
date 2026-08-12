import { ALARM_NAME, SCHEDULER_PERIOD_MINUTES } from '../shared/constants.js';
import { MESSAGE_TYPES } from '../shared/messaging.js';
import * as storageManager from '../storage/storageManager.js';
import { runSchedulerTick } from './scheduler.js';

/**
 * Creates the recurring scheduler alarm if it does not already exist.
 * Alarms persist across event-page suspensions, so this is only ever
 * needed on install, browser startup, or as a defensive no-op elsewhere.
 *
 * @returns {Promise<void>}
 */
async function ensureAlarmRegistered() {
  const existing = await browser.alarms.get(ALARM_NAME);
  if (!existing) {
    browser.alarms.create(ALARM_NAME, { periodInMinutes: SCHEDULER_PERIOD_MINUTES });
  }
}

browser.runtime.onInstalled.addListener(() => {
  storageManager
    .ensureInitialized()
    .then(ensureAlarmRegistered)
    .catch((error) => console.error('[AutoHeartbeat] Initialization failed.', error));
});

browser.runtime.onStartup.addListener(() => {
  ensureAlarmRegistered().catch((error) =>
    console.error('[AutoHeartbeat] Failed to register alarm on startup.', error)
  );
});

browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  runSchedulerTick().catch((error) => {
    console.error('[AutoHeartbeat] Scheduler tick failed.', error);
  });
});

browser.runtime.onMessage.addListener((message) => {
  if (!message || message.type !== MESSAGE_TYPES.RUN_SCHEDULER_NOW) return undefined;

  return runSchedulerTick()
    .then(() => ({ ok: true }))
    .catch((error) => ({ ok: false, error: error && error.message ? error.message : String(error) }));
});

// Defensive re-registration: covers event-page reloads during development
// (e.g. "Reload" in about:debugging) that occur without a full browser
// restart or a runtime.onInstalled event.
ensureAlarmRegistered().catch((error) =>
  console.error('[AutoHeartbeat] Failed to register alarm on script load.', error)
);
