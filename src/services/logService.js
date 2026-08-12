import * as storageManager from '../storage/storageManager.js';
import { createLogEntry } from '../models/logEntry.js';

/**
 * Records the outcome of a heartbeat request attempt.
 *
 * @param {Partial<import('../models/logEntry.js').LogEntry>} details
 * @returns {Promise<import('../models/logEntry.js').LogEntry>}
 */
export async function recordHeartbeatResult(details) {
  const entry = createLogEntry(details);
  await storageManager.appendLog(entry);
  return entry;
}

/**
 * Returns the most recent log entries, newest first.
 *
 * @param {number} [limit]
 * @returns {Promise<import('../models/logEntry.js').LogEntry[]>}
 */
export async function getRecentLogs(limit) {
  const logs = await storageManager.getLogs();
  return typeof limit === 'number' ? logs.slice(0, limit) : logs;
}
