/**
 * Generates a random unique identifier for heartbeat configs and log
 * entries using the standard Web Crypto API available in all extension
 * contexts (background, popup, options).
 *
 * @returns {string} A RFC 4122 v4 UUID.
 */
export function generateId() {
  return crypto.randomUUID();
}
