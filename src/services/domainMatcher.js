/**
 * Extracts the lowercase hostname from a URL string, ignoring protocol,
 * path, query string and fragment.
 *
 * @param {string} url
 * @returns {string|null} The hostname, or null if the URL is invalid.
 */
export function extractHostname(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Checks whether a hostname matches a domain pattern. Supports exact
 * hostnames (`portal.example.com`) and single leading wildcard labels
 * (`*.example.com`, which also matches the bare `example.com`).
 *
 * @param {string} pattern
 * @param {string} hostname
 * @returns {boolean}
 */
export function matchesDomainPattern(pattern, hostname) {
  if (!pattern || !hostname) return false;
  const normalizedPattern = pattern.trim().toLowerCase();
  const normalizedHost = hostname.toLowerCase();

  if (normalizedPattern.startsWith('*.')) {
    const baseDomain = normalizedPattern.slice(2);
    return normalizedHost === baseDomain || normalizedHost.endsWith(`.${baseDomain}`);
  }

  return normalizedHost === normalizedPattern;
}
