import * as storageManager from '../storage/storageManager.js';
import * as configService from '../services/configService.js';
import * as logService from '../services/logService.js';
import { getOpenTabsInfo } from './tabScanner.js';
import { resolveActiveSessions } from './sessionResolver.js';
import { resolveContainerName } from './containerService.js';
import { executeHeartbeat } from './heartbeatExecutor.js';
import { validateHeartbeatConfig } from '../utils/validation.js';
import { getDisplayName } from '../models/heartbeatConfig.js';

const MILLISECONDS_PER_MINUTE = 60_000;

/** Prevents overlapping ticks if a previous run is still in-flight. */
let tickInFlight = null;

/**
 * Runs a single scheduler evaluation: enumerates open tabs, determines
 * which (rule, container) sessions are currently active, sends heartbeat
 * requests for any session whose interval has elapsed, and updates the
 * cached state consumed by the popup UI.
 *
 * Safe to call concurrently; overlapping calls share the same in-flight
 * promise so tabs are never scanned twice at once.
 *
 * @returns {Promise<void>}
 */
export async function runSchedulerTick() {
  if (!tickInFlight) {
    tickInFlight = executeTick().finally(() => {
      tickInFlight = null;
    });
  }
  return tickInFlight;
}

async function executeTick() {
  const configs = await configService.listConfigs();
  const enabledConfigs = configs.filter(
    (config) => config.enabled && validateHeartbeatConfig(config).valid
  );

  if (enabledConfigs.length === 0) {
    await clearActiveState();
    return;
  }

  const tabsInfo = await getOpenTabsInfo();
  if (tabsInfo.length === 0) {
    await clearActiveState();
    return;
  }

  const sessions = resolveActiveSessions(enabledConfigs, tabsInfo);
  if (sessions.size === 0) {
    await clearActiveState();
    return;
  }

  const previousRunState = await storageManager.getRunState();
  const now = Date.now();
  const nextRunState = {};
  const activeSessionSummaries = [];

  for (const session of sessions.values()) {
    const { key, config, cookieStoreId, tabId } = session;
    const intervalMs = config.interval * MILLISECONDS_PER_MINUTE;
    const lastRunAt = previousRunState[key] || null;
    const isDue = !lastRunAt || now - lastRunAt >= intervalMs;
    const containerName = await resolveContainerName(cookieStoreId);

    let effectiveLastRunAt = lastRunAt;

    if (isDue) {
      const result = await executeHeartbeat(tabId, config);
      effectiveLastRunAt = now;
      await logService.recordHeartbeatResult({
        configId: config.id,
        configName: getDisplayName(config),
        domain: config.domain,
        cookieStoreId,
        containerName,
        method: config.method,
        url: config.url,
        status: result.status,
        durationMs: result.durationMs,
        success: result.success,
        error: result.error,
      });
    }

    nextRunState[key] = effectiveLastRunAt;
    activeSessionSummaries.push({
      configId: config.id,
      configName: getDisplayName(config),
      domain: config.domain,
      cookieStoreId,
      containerName,
      intervalMinutes: config.interval,
      lastRunAt: effectiveLastRunAt,
      nextRunAt: effectiveLastRunAt ? effectiveLastRunAt + intervalMs : now,
    });
  }

  // Rebuilding run state from scratch (rather than merging) automatically
  // prunes entries for sessions that are no longer active.
  await storageManager.saveRunState(nextRunState);
  await storageManager.saveActiveState({ sessions: activeSessionSummaries, updatedAt: now });
}

async function clearActiveState() {
  await storageManager.saveActiveState({ sessions: [], updatedAt: Date.now() });
}
