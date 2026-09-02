import { describe, expect, it } from "vitest";

import {
  analyzeFolderNodesSource,
  createNodeDocument,
  patchFolderNodesFrontmatter,
  patchFrontmatterScalar,
} from "../../src/core/frontmatter";

describe("source-preserving frontmatter patches", () => {
  it("changes one generic scalar without changing unrelated YAML or body", () => {
    const source = "---\n# keep\naliases: [A]\ncustom: 1\n---\nBody\n";
    expect(patchFrontmatterScalar(source, "custom", 1536)).toBe("---\n# keep\naliases: [A]\ncustom: 1536\n---\nBody\n");
  });

  it("writes the canonical list and omits defaults or an empty property", () => {
    const hidden = patchFolderNodesFrontmatter("Body", { hidden: true });
    expect(hidden).toBe("---\nfolder-nodes:\n  - hidden=true\n---\nBody");
    const ranked = patchFolderNodesFrontmatter(hidden, { order: "manual", rank: 1024 });
    expect(ranked).toBe("---\nfolder-nodes:\n  - order=manual\n  - rank=1024\n  - hidden=true\n---\nBody");
    expect(patchFolderNodesFrontmatter(ranked, { order: null, rank: null, hidden: false })).toBe("---\n---\nBody");
  });

  it("migrates legacy values, preserves unrelated text and future tokens, and keeps BOM/CRLF", () => {
    const source = "\uFEFF---\r\n# keep\r\naliases: [A]\r\nfolder-nodes: [future=yes]\r\nfolderNodeChildrenSort: manual\r\nfolderNodeSiblingRank: 1024\r\nfolderNodeHidden: true\r\n---\r\nBody\r\n";
    expect(patchFolderNodesFrontmatter(source, { migrateLegacy: true })).toBe(
      "\uFEFF---\r\n# keep\r\naliases: [A]\r\nfolder-nodes:\r\n  - order=manual\r\n  - rank=1024\r\n  - hidden=true\r\n  - future=yes\r\n---\r\nBody\r\n",
    );
  });

  it("fails closed on conflicts, duplicate keys, quoted keys, and unterminated frontmatter", () => {
    expect(() => patchFolderNodesFrontmatter(
      "---\nfolder-nodes: [hidden=true]\nfolderNodeHidden: false\n---\n",
      { migrateLegacy: true },
    )).toThrow("Conflicting hidden");
    for (const source of [
      "---\nfolder-nodes: []\nfolder-nodes: []\n---\n",
      "---\n'folder-nodes': []\n---\n",
      "---\nicon: x\nbody",
    ]) expect(() => patchFolderNodesFrontmatter(source, { hidden: true })).toThrow();
    expect(() => patchFolderNodesFrontmatter(
      "---\nfolder-nodes: [rank=invalid]\n---\n",
      { hidden: true },
    )).toThrow("Invalid folder-nodes item");
    expect(analyzeFolderNodesSource("---\nfolder-nodes: []\nfolder-nodes: []\n---\n").issues[0]?.code).toBe("source-ambiguous");
  });

  it("creates exact aliases from selected text", () => {
    expect(createNodeDocument("Selected text", "Selected text")).toBe("---\naliases:\n  - \"Selected text\"\n---\nSelected text");
    expect(createNodeDocument(null, "Body")).toBe("Body");
    expect(createNodeDocument(null, "\n    indented\n")).toBe("\n    indented\n");
  });
});
