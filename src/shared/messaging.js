/**
 * Lightweight runtime messaging helpers shared between the popup, options
 * page and background script.
 */

/** Message type identifiers exchanged via `browser.runtime.sendMessage`. */
export const MESSAGE_TYPES = Object.freeze({
  RUN_SCHEDULER_NOW: 'auto-heartbeat/run-scheduler-now',
});

/**
 * Asks the background script to re-evaluate active sessions immediately,
 * instead of waiting for the next scheduled alarm tick. Used after a rule
 * is added, edited, deleted or toggled so the UI feels responsive.
 *
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function requestSchedulerRun() {
  try {
    const response = await browser.runtime.sendMessage({ type: MESSAGE_TYPES.RUN_SCHEDULER_NOW });
    return response || { ok: true };
  } catch (error) {
    // The background script may be briefly unavailable during startup;
    // the next alarm tick will still pick up the change.
    console.warn('[AutoHeartbeat] Failed to notify background script.', error);
    return { ok: false, error: error && error.message ? error.message : String(error) };
  }
}
