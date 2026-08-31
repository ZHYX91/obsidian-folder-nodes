import { describe, expect, it } from "vitest";
import { createNodeDocument, patchFrontmatterScalar } from "../../src/core/frontmatter";

describe("source-preserving frontmatter patches", () => {
  it("changes one scalar without changing unrelated YAML or body", () => {
    const source = "---\n# keep\naliases: [A]\nfolderNodeSiblingRank: 1\n---\nBody\n";
    expect(patchFrontmatterScalar(source, "folderNodeSiblingRank", 1536)).toBe("---\n# keep\naliases: [A]\nfolderNodeSiblingRank: 1536\n---\nBody\n");
    expect(patchFrontmatterScalar(source, "folderNodeChildrenSort", "manual")).toContain("aliases: [A]\nfolderNodeSiblingRank: 1\nfolderNodeChildrenSort: \"manual\"");
  });
  it("creates exact aliases from selected text", () => {
    expect(createNodeDocument("Selected text", "Selected text")).toBe("---\naliases:\n  - \"Selected text\"\n---\nSelected text");
    expect(createNodeDocument(null, "Body")).toBe("Body");
    expect(createNodeDocument(null, "\n    indented\n")).toBe("\n    indented\n");
  });
  it("fails closed on unterminated frontmatter", () => {
    expect(() => patchFrontmatterScalar("---\nicon: x\nbody", "folderNodeSiblingRank", 1)).toThrow("malformed frontmatter");
  });
  it("writes exact boolean hidden markers and deletes them on unhide", () => {
    const hidden = patchFrontmatterScalar("Body", "folderNodeHidden", true);
    expect(hidden).toBe("---\nfolderNodeHidden: true\n---\nBody");
    expect(patchFrontmatterScalar(hidden, "folderNodeHidden", null)).toBe("---\n---\nBody");
  });
});
