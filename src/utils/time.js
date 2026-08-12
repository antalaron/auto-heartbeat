/**
 * Formatting helpers for timestamps and durations used across the popup
 * and options UI.
 */

/**
 * Formats an epoch timestamp as a locale-aware date/time string.
 *
 * @param {number|null|undefined} epochMs
 * @returns {string}
 */
export function formatTimestamp(epochMs) {
  if (!epochMs) return '—';
  return new Date(epochMs).toLocaleString();
}

/**
 * Formats a duration in milliseconds as a short human-readable string.
 *
 * @param {number|null|undefined} durationMs
 * @returns {string}
 */
export function formatDuration(durationMs) {
  if (durationMs === null || durationMs === undefined) return '—';
  if (durationMs < 1000) return `${durationMs} ms`;
  return `${(durationMs / 1000).toFixed(2)} s`;
}

/**
 * Formats the time remaining until `targetEpochMs` as `Xm SSs` (or `SSs`
 * once under a minute). Used for the popup's live countdown display.
 *
 * @param {number} targetEpochMs
 * @param {number} [nowEpochMs]
 * @returns {string}
 */
export function formatCountdown(targetEpochMs, nowEpochMs = Date.now()) {
  const remainingMs = Math.max(0, targetEpochMs - nowEpochMs);
  const totalSeconds = Math.round(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
}
