/**
 * reportUUID.js
 *
 * Provides UUID v4 generation for report audit trail entries.
 * Uses the browser-native crypto.randomUUID() where available,
 * with a Math.random()-based fallback for older browsers.
 *
 * Satisfies: Requirements 16.1
 */

/**
 * Generates a version-4 UUID string.
 *
 * Primary: crypto.randomUUID() — available in all modern browsers
 * (Chrome 92+, Firefox 95+, Safari 15.4+, Edge 92+).
 *
 * Fallback: constructs a compliant v4 UUID from Math.random() bytes
 * for environments where crypto.randomUUID is unavailable.
 *
 * @returns {string} A v4 UUID in the format xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
 */
export function generateReportUUID() {
  // Primary: use native crypto.randomUUID() when available
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }

  // Fallback: build a v4-compliant UUID using Math.random()
  // Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  // where y is one of 8, 9, a, or b (per RFC 4122 §4.4)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const randomNibble = (Math.random() * 16) | 0;
    // For 'y': set the two most-significant bits to 10 (i.e. 8, 9, a, or b)
    const value = char === 'x' ? randomNibble : (randomNibble & 0x3) | 0x8;
    return value.toString(16);
  });
}
