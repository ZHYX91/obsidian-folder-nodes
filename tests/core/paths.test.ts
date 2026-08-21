import { describe, expect, it } from "vitest";
import { basename, dirname, isCanonicalNodeNote, isDescendantPath, nodeNotePath, normalizeVaultPath, sanitizeNodeName } from "../../src/core/paths";

describe("folder node paths", () => {
  it("normalizes and derives canonical paths", () => {
    expect(normalizeVaultPath("/A\\B//")).toBe("A/B");
    expect(normalizeVaultPath("/")).toBe("");
    expect(basename("A/B")).toBe("B");
    expect(dirname("A/B.md")).toBe("A");
    expect(nodeNotePath("A/B")).toBe("A/B/B.md");
  });
  it("recognizes only same-named notes inside folders", () => {
    expect(isCanonicalNodeNote("A/A.md")).toBe(true);
    expect(isCanonicalNodeNote("A/B.md")).toBe(false);
    expect(isCanonicalNodeNote("A.md")).toBe(false);
  });
  it("sanitizes names and checks path relations", () => {
    expect(sanitizeNodeName("  Report:*?  ")).toBe("Report---");
    expect(sanitizeNodeName(". ")).toBe("Untitled");
    expect(isDescendantPath("A/B/C", "A/B")).toBe(true);
    expect(isDescendantPath("A/B", "A/B")).toBe(false);
  });
});
