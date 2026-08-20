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
  });
});
