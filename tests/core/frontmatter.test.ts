import { describe, expect, it } from "vitest";
import { createNodeDocument, patchFrontmatterScalar } from "../../src/core/frontmatter";

describe("source-preserving frontmatter patches", () => {
  it("changes one scalar without changing unrelated YAML or body", () => {
    const source = "---\n# keep\naliases: [A]\nfolderNodeOrder: 1\n---\nBody\n";
    expect(patchFrontmatterScalar(source, "folderNodeOrder", 1536)).toBe("---\n# keep\naliases: [A]\nfolderNodeOrder: 1536\n---\nBody\n");
    expect(patchFrontmatterScalar(source, "folderNodeSort", "manual")).toContain("aliases: [A]\nfolderNodeOrder: 1\nfolderNodeSort: \"manual\"");
  });
  it("creates exact aliases from selected text", () => {
    expect(createNodeDocument("Selected text", "Selected text")).toBe("---\naliases:\n  - \"Selected text\"\n---\nSelected text");
    expect(createNodeDocument(null, "Body")).toBe("Body");
  });
});
