// Measured by the production-bundle gate with all 12 interface catalogs
// containing 378 messages each: dist/main.js was 875964 bytes.
// The previous 581958-byte reference described eight incomplete catalogs.
export const BUNDLE_REFERENCE_BYTES = 875_964;

// Reviewed upper bound: about 10% headroom for small changes, while still
// rejecting source maps, debug builds, and unexpected dependency growth.
// Any future increase requires another measured production build and review.
export const BUNDLE_MAXIMUM_BYTES = 960_000;

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
