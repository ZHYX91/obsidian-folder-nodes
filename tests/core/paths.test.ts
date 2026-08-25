import { describe, expect, it } from "vitest";
import { basename, dirname, isCanonicalNodeNote, isDescendantPath, isSameVaultName, isSameVaultPath, nodeNotePath, normalizeVaultPath, sanitizeNodeName } from "../../src/core/paths";

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
    expect(isCanonicalNodeNote("Folder/folder.md")).toBe(true);
    expect(isSameVaultName("Cafe\u0301", "Café")).toBe(true);
    expect(isSameVaultPath("Folder\\Note.md", "folder/note.md")).toBe(true);
  });
  it("sanitizes names and checks path relations", () => {
    expect(sanitizeNodeName("  Report:*?  ")).toBe("Report---");
    expect(sanitizeNodeName(". ")).toBe("Untitled");
    expect(sanitizeNodeName("CON")).toBe("_CON");
    expect(sanitizeNodeName("NUL.txt")).toBe("_NUL.txt");
    expect(sanitizeNodeName("A#B[1]^x")).toBe("A-B-1--x");
    expect(isDescendantPath("A/B/C", "A/B")).toBe(true);
    expect(isDescendantPath("A/B", "A/B")).toBe(false);
  });
});
