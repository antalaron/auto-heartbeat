/**
 * Validation helpers for heartbeat configuration input. Kept dependency
 * free so they can be used from the options UI, the background scheduler
 * and unit tests alike.
 */

import { HTTP_METHODS, MIN_INTERVAL_MINUTES, MAX_INTERVAL_MINUTES } from '../shared/constants.js';

const DOMAIN_LABEL_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i;

/**
 * @param {unknown} value
 * @returns {value is string}
 */
export function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Validates a domain pattern: either an exact hostname (`portal.example.com`)
 * or a single leading wildcard label (`*.example.com`).
 *
 * @param {unknown} pattern
 * @returns {boolean}
 */
export function isValidDomainPattern(pattern) {
  if (!isNonEmptyString(pattern)) return false;
  const trimmed = pattern.trim().toLowerCase();
  if (trimmed.includes(' ') || trimmed.includes('..') || trimmed.startsWith('.') || trimmed.endsWith('.')) {
    return false;
  }
  const labels = trimmed.split('.');
  return labels.every((label, index) => {
    if (index === 0 && label === '*' && labels.length > 1) return true;
    return DOMAIN_LABEL_PATTERN.test(label);
  });
}

/**
 * Validates that a value is an absolute http(s) URL.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isValidUrl(value) {
  if (!isNonEmptyString(value)) return false;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isValidInterval(value) {
  return Number.isInteger(value) && value >= MIN_INTERVAL_MINUTES && value <= MAX_INTERVAL_MINUTES;
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isValidMethod(value) {
  return HTTP_METHODS.includes(value);
}

/**
 * Parses and validates the JSON text entered in the headers editor.
 * An empty string is treated as "no headers".
 *
 * @param {string} text
 * @returns {{ok: true, value: Record<string,string>} | {ok: false, error: string}}
 */
export function parseHeadersInput(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) return { ok: true, value: {} };

  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: 'Headers must be valid JSON.' };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: 'Headers must be a flat JSON object, e.g. {"X-Token": "abc"}.' };
  }

  const entries = Object.entries(parsed);
  for (const [key, value] of entries) {
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
      return { ok: false, error: `Header "${key}" must have a string value.` };
    }
  }

  const normalized = {};
  for (const [key, value] of entries) {
    normalized[key] = String(value);
  }
  return { ok: true, value: normalized };
}

/**
 * Validates a fully-built heartbeat configuration object, assuming
 * `headers` has already been parsed into a plain object.
 *
 * @param {import('../models/heartbeatConfig.js').HeartbeatConfig} config
 * @returns {{valid: boolean, errors: Record<string,string>}}
 */
export function validateHeartbeatConfig(config) {
  const errors = {};

  if (!isValidDomainPattern(config.domain)) {
    errors.domain = 'Enter a valid hostname, e.g. portal.example.com or *.example.com.';
  }
  if (!isValidUrl(config.url)) {
    errors.url = 'Enter a valid http:// or https:// URL.';
  }
  if (!isValidInterval(config.interval)) {
    errors.interval = `Interval must be a whole number between ${MIN_INTERVAL_MINUTES} and ${MAX_INTERVAL_MINUTES} minutes.`;
  }
  if (!isValidMethod(config.method)) {
    errors.method = 'Method must be GET or POST.';
  }
  if (!config.headers || typeof config.headers !== 'object' || Array.isArray(config.headers)) {
    errors.headers = 'Headers must be a JSON object.';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}
