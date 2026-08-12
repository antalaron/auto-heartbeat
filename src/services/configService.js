import * as storageManager from '../storage/storageManager.js';
import { createHeartbeatConfig } from '../models/heartbeatConfig.js';
import { validateHeartbeatConfig } from '../utils/validation.js';

/**
 * Lists all configured heartbeat rules.
 *
 * @returns {Promise<import('../models/heartbeatConfig.js').HeartbeatConfig[]>}
 */
export async function listConfigs() {
  return storageManager.getConfigs();
}

/**
 * @param {string} id
 * @returns {Promise<import('../models/heartbeatConfig.js').HeartbeatConfig|null>}
 */
export async function getConfig(id) {
  const configs = await storageManager.getConfigs();
  return configs.find((config) => config.id === id) || null;
}

/**
 * Validates and persists a heartbeat configuration. Creates a new rule
 * when `input.id` is absent or unknown, otherwise updates the existing
 * rule in place (preserving its original `createdAt`).
 *
 * @param {Partial<import('../models/heartbeatConfig.js').HeartbeatConfig>} input
 * @returns {Promise<{ok: true, config: import('../models/heartbeatConfig.js').HeartbeatConfig} | {ok: false, errors: Record<string,string>}>}
 */
export async function saveConfig(input) {
  const candidate = createHeartbeatConfig(input);
  const validation = validateHeartbeatConfig(candidate);
  if (!validation.valid) {
    return { ok: false, errors: validation.errors };
  }

  const configs = await storageManager.getConfigs();
  const existingIndex = configs.findIndex((config) => config.id === candidate.id);

  if (existingIndex >= 0) {
    candidate.createdAt = configs[existingIndex].createdAt;
    configs[existingIndex] = candidate;
  } else {
    configs.push(candidate);
  }

  await storageManager.saveConfigs(configs);
  return { ok: true, config: candidate };
}

/**
 * @param {string} id
 * @returns {Promise<import('../models/heartbeatConfig.js').HeartbeatConfig[]>} The remaining configs.
 */
export async function deleteConfig(id) {
  const configs = await storageManager.getConfigs();
  const filtered = configs.filter((config) => config.id !== id);
  await storageManager.saveConfigs(filtered);
  return filtered;
}

/**
 * @param {string} id
 * @param {boolean} enabled
 * @returns {Promise<import('../models/heartbeatConfig.js').HeartbeatConfig|null>} The updated config, or null if not found.
 */
export async function setConfigEnabled(id, enabled) {
  const configs = await storageManager.getConfigs();
  const index = configs.findIndex((config) => config.id === id);
  if (index === -1) return null;

  configs[index] = { ...configs[index], enabled: Boolean(enabled), updatedAt: Date.now() };
  await storageManager.saveConfigs(configs);
  return configs[index];
}
