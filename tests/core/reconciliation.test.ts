import { describe, expect, it } from "vitest";

import { folderRenameReconciliation, shouldCreateReconciledNote } from "../../src/core/reconciliation";

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

describe("folder rename reconciliation", () => {
  it("renames an existing stale Node Note", () => {
    expect(folderRenameReconciliation(false, true)).toBe("rename-stale");
  });

  it("creates the canonical note when a temporary folder was renamed before its note existed", () => {
    expect(folderRenameReconciliation(false, false)).toBe("create-canonical");
  });

  it("does not overwrite an existing canonical note", () => {
    expect(folderRenameReconciliation(true, false)).toBe("none");
    expect(folderRenameReconciliation(true, true)).toBe("none");
  });
});
