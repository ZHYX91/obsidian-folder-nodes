// Measured in the October 2026 GitHub CI with Node 24.19.0/npm 11.17.0:
// production dist/main.js was 581958 bytes with the new multilingual catalogs.
// Replaces the 280147-byte August 2026 reference, which no longer describes
// this UI/graph feature set or bundled translation inventory.
export const BUNDLE_REFERENCE_BYTES = 581_958;

// Still a hard, reviewed cap: approximately 11.7% headroom above the measured
// candidate. Source maps, debug bundles, and unexpected dependency growth
// must continue failing instead of quietly expanding a release.
export const BUNDLE_MAXIMUM_BYTES = 650_000;

export function measureBundleBudget(actualBytes) {
  if (!Number.isSafeInteger(actualBytes) || actualBytes <= 0) {
    throw new Error(`Bundle size must be a positive safe integer: ${String(actualBytes)}`);
  }
  if (
    !Number.isSafeInteger(BUNDLE_REFERENCE_BYTES) ||
    BUNDLE_REFERENCE_BYTES <= 0 ||
    !Number.isSafeInteger(BUNDLE_MAXIMUM_BYTES) ||
    BUNDLE_MAXIMUM_BYTES < BUNDLE_REFERENCE_BYTES
  ) {
    throw new Error("Bundle reference and maximum budget are invalid");
  }
  if (actualBytes > BUNDLE_MAXIMUM_BYTES) {
    throw new Error(
      `dist/main.js exceeds the ${BUNDLE_MAXIMUM_BYTES}-byte budget: ${actualBytes}`,
    );
  }
  return {
    actualBytes,
    maximumBytes: BUNDLE_MAXIMUM_BYTES,
    referenceBytes: BUNDLE_REFERENCE_BYTES,
  };
}
