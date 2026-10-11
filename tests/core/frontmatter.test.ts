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

  it.each([
    ["flow mapping", "---\n{ title: Example, tags: [one, two] }\n---\nBody\n"],
    ["flow sequence", "---\n[one, two]\n---\nBody\n"],
    ["block sequence", "---\n- one\n- two\n---\nBody\n"],
    ["complex mapping key", "---\n? [one, two]\n: value\n---\nBody\n"],
    ["root scalar", "---\nplain scalar\n---\nBody\n"],
  ])("rejects %s roots before structural or scalar writes", (_shape, source) => {
    const original = source;
    expect(() => patchFolderNodesFrontmatter(source, { hidden: true })).toThrow("Unsupported top-level frontmatter");
    expect(() => patchFrontmatterScalar(source, "custom", "value")).toThrow("Unsupported top-level frontmatter");
    expect(source).toBe(original);
  });

  it("accepts flow values inside ordinary block mappings without rewriting other bytes", () => {
    const source = "\uFEFF---\r\n# retain\r\nmetadata: { name: Example, nested: [one, two] }\r\naliases: [\"A\", \"B\"]\r\n---\r\nBody\r\n";
    const updated = patchFolderNodesFrontmatter(source, { hidden: true });
    expect(updated).toBe("\uFEFF---\r\n# retain\r\nmetadata: { name: Example, nested: [one, two] }\r\naliases: [\"A\", \"B\"]\r\nfolder-nodes:\r\n  - hidden=true\r\n---\r\nBody\r\n");
    expect(patchFrontmatterScalar(source, "custom", "safe")).toContain(
      "metadata: { name: Example, nested: [one, two] }\r\naliases: [\"A\", \"B\"]\r\ncustom: \"safe\"",
    );
  });

  it("accepts multiline flow values under an ordinary block mapping", () => {
    const source = "---\nmetadata: {\n  title: \"A: B\",\n  tags: [one, two]\n}\npriority: 4\n---\nBody";
    expect(patchFolderNodesFrontmatter(source, { hidden: true })).toBe(
      "---\nmetadata: {\n  title: \"A: B\",\n  tags: [one, two]\n}\npriority: 4\nfolder-nodes:\n  - hidden=true\n---\nBody",
    );
    expect(patchFrontmatterScalar(source, "priority", 8)).toContain(
      "metadata: {\n  title: \"A: B\",\n  tags: [one, two]\n}\npriority: 8\n---",
    );
  });

  it("creates exact aliases from selected text", () => {
    expect(createNodeDocument("Selected text", "Selected text")).toBe("---\naliases:\n  - \"Selected text\"\n---\nSelected text");
    expect(createNodeDocument(null, "Body")).toBe("Body");
    expect(createNodeDocument(null, "\n    indented\n")).toBe("\n    indented\n");
  });
});
