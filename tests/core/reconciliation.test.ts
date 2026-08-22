import { describe, expect, it } from "vitest";

import { shouldCreateReconciledNote } from "../../src/core/reconciliation";

describe("automatic reconciliation readiness", () => {
  it("does not recreate a note that is already cached", () => {
    expect(shouldCreateReconciledNote(true, true)).toBe(false);
    expect(shouldCreateReconciledNote(true, false)).toBe(false);
  });

  it("treats a disk-only note during startup indexing as already present", () => {
    expect(shouldCreateReconciledNote(false, true)).toBe(false);
  });

  it("creates only when both cache and disk confirm absence", () => {
    expect(shouldCreateReconciledNote(false, false)).toBe(true);
  });
});
