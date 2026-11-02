import { describe, expect, it } from "vitest";
import { basename, dirname, isCanonicalNodeNote, isDescendantPath, isSameVaultName, isSameVaultPath, nodeNotePath, normalizeVaultPath, sanitizeNewNodeName, sanitizeNodeName } from "../../src/core/paths";

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
  it("keeps complete graphemes within the byte budget of both node components", () => {
    expect(sanitizeNewNodeName("a".repeat(181))).toBe("a".repeat(180));
    expect(sanitizeNewNodeName("汉".repeat(84))).toBe("汉".repeat(84));
    expect(sanitizeNewNodeName("汉".repeat(85))).toBe("汉".repeat(84));
    expect(sanitizeNewNodeName("😀".repeat(90))).toBe("😀".repeat(63));
    const family = "👨‍👩‍👧‍👦";
    expect(sanitizeNewNodeName(family.repeat(30))).toBe(family.repeat(10));
    for (const name of ["前缀-" + "汉".repeat(100) + "-后缀", family.repeat(30), "e\u0301".repeat(180)]) {
      const result = sanitizeNewNodeName(name);
      expect(new TextEncoder().encode(result + ".md").length).toBeLessThanOrEqual(255);
      expect(result.length).toBeLessThanOrEqual(180);
      expect(sanitizeNewNodeName(result)).toBe(result);
    }
  });
  it("retains the legacy name interpretation when reading existing paths", () => {
    expect(sanitizeNodeName("汉".repeat(100))).toBe("汉".repeat(100));
  });
});
