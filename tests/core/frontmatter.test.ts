import { describe, expect, it } from "vitest";
import { parseDocument } from "yaml";
import { expectFrontmatterPropertyChanges, parseFrontmatterDocument } from "../helpers/frontmatter-oracle";

import {
  analyzeFolderNodesSource,
  createNodeDocument,
  patchFolderNodesFrontmatter,
  patchFrontmatterScalar,
} from "../../src/core/frontmatter";

describe("source-preserving frontmatter patches", () => {
  it.each([
    ["plain apostrophe and comment", "\n  - future=Bob's # a comment", ["future=Bob's"]],
    ["plain double quote and comment", '\n  - future=inch"wide # a comment', ['future=inch"wide']],
    ["single-quoted apostrophe", "\n  - 'future=Bob''s' # a comment", ["future=Bob's"]],
    ["quoted literal hash", '\n  - "future=Bob\'s # literal" # a comment', ["future=Bob's # literal"]],
    ["flow plain apostrophe", " [future=Bob's, other=yes] # a comment", ["future=Bob's", "other=yes"]],
    ["flow quoted comma and hash", " ['future=Bob''s, # literal', other=yes] # a comment", ["future=Bob's, # literal", "other=yes"]],
  ])("preserves the YAML meaning of unknown tokens: %s", (_name, value, entries) => {
    const source = `---\n# retain\naliases: [Example]\nfolder-nodes:${value}\n---\nBody\n`;
    expect(parseFrontmatterDocument(source).data).toMatchObject({ "folder-nodes": entries });
    const updated = patchFolderNodesFrontmatter(source, { hidden: true });
    expectFrontmatterPropertyChanges(source, updated, { "folder-nodes": ["hidden=true", ...entries] });
    expect(updated).toContain("# retain\naliases: [Example]\n");
  });

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

  it.each([
    "  { title: Example, tags: [one, two] }",
    "  [one, two]",
    "  - one\n  - two",
    "  title: Example\n  folder-nodes: [hidden=true]",
  ])("rejects an indented root before either patcher writes: %s", (root) => {
    const source = `---\n# retain\n${root}\n---\nBody`;
    expect(() => patchFolderNodesFrontmatter(source, { hidden: true })).toThrow("Unsupported top-level frontmatter");
    expect(() => patchFrontmatterScalar(source, "custom", "value")).toThrow("Unsupported top-level frontmatter");
  });

  it.each(["hello [world", "hello ] world", "hello {world", "hello } world"])(
    "preserves collection punctuation in a plain scalar: %s", (title) => {
      const source = `---\ntitle: ${title}\n---\nBody`;
      expect(patchFolderNodesFrontmatter(source, { hidden: true })).toBe(
        `---\ntitle: ${title}\nfolder-nodes:\n  - hidden=true\n---\nBody`,
      );
      expect(patchFrontmatterScalar(source, "custom", "value")).toBe(
        `---\ntitle: ${title}\ncustom: "value"\n---\nBody`,
      );
    },
  );

  it.each([
    'metadata: {\n  title: "A\n    ] B"\n}',
    'metadata: {\n  title: "A\n    [ B"\n}',
    "metadata: {\n  title: 'A\n    } B'\n}",
    'metadata: &entry {\n  title: "A\\"\n    ] B"\n}',
  ])("preserves multiline quoted flow values: %s", (metadata) => {
    const source = `---\n${metadata}\n---\nBody`;
    expect(patchFolderNodesFrontmatter(source, { hidden: true })).toBe(
      `---\n${metadata}\nfolder-nodes:\n  - hidden=true\n---\nBody`,
    );
    expect(patchFrontmatterScalar(source, "custom", "value")).toBe(
      `---\n${metadata}\ncustom: "value"\n---\nBody`,
    );
  });

  it("does not read or replace column-zero keys nested in a multiline flow value", () => {
    const metadata = "metadata: {\nfolder-nodes: [nested=true],\ncustom: nested\n}";
    const source = `---\n${metadata}\nfolder-nodes: [hidden=true]\ncustom: top\n---\nBody`;
    expect(patchFolderNodesFrontmatter(source, { hidden: false })).toBe(
      `---\n${metadata}\ncustom: top\n---\nBody`,
    );
    expect(patchFrontmatterScalar(source, "custom", "value")).toBe(
      `---\n${metadata}\nfolder-nodes: [hidden=true]\ncustom: "value"\n---\nBody`,
    );
  });

  it.each(["owner's-name: Joe", 'quote"mark: a', "metadata: { owner: John's note }"])(
    "preserves quotes inside plain YAML keys and values: %s", (property) => {
      const source = `---\n${property}\n---\nBody`;
      expect(patchFolderNodesFrontmatter(source, { hidden: true })).toBe(
        `---\n${property}\nfolder-nodes:\n  - hidden=true\n---\nBody`,
      );
      expect(patchFrontmatterScalar(source, "custom", "value")).toContain(`${property}\ncustom: "value"`);
    },
  );

  it.each(["&meta", "!!map", "!!map &meta"])("preserves %s multiline flow prefixes", (prefix) => {
    const property = `metadata: ${prefix} {\n  title: Example\n}`;
    const source = `---\n${property}\n---\nBody`;
    expect(patchFolderNodesFrontmatter(source, { hidden: true })).toContain(`${property}\nfolder-nodes:`);
    expect(patchFrontmatterScalar(source, "custom", "value")).toContain(`${property}\ncustom: "value"`);
  });

  it.each([
    "metadata: { url: http:'quote }",
    'metadata: { url: http:"quote }',
    "metadata: { http:'quote: value }",
    "metadata: { url: http:'quote, other: \"value\" }",
    'metadata: {"a":"b"}',
    "metadata: {\"a\":http:'quote}",
  ])("distinguishes plain flow colons from mapping separators: %s", (property) => {
    const source = `---\n${property}\n---\nBody`;
    expect(parseDocument(property).errors).toEqual([]);
    const structural = patchFolderNodesFrontmatter(source, { hidden: true });
    const scalar = patchFrontmatterScalar(source, "custom", "value");
    expect(structural).toBe(`---\n${property}\nfolder-nodes:\n  - hidden=true\n---\nBody`);
    expect(scalar).toBe(`---\n${property}\ncustom: "value"\n---\nBody`);
    for (const document of [structural, scalar]) {
      expect(parseDocument(document.slice(4, document.indexOf("\n---", 4))).errors).toEqual([]);
    }
  });

  it("replaces an entire generic multiline value without leaving its continuation", () => {
    for (const value of ['{\n  title: Example\n}', '"A\n  ] B"', "|\n  First\n  Second", "First\n  Second"]) {
      const source = `---\ncustom: ${value}\nother: retain\n---\nBody`;
      expect(patchFrontmatterScalar(source, "custom", "value")).toBe(
        '---\ncustom: "value"\nother: retain\n---\nBody',
      );
    }
  });

  it.each([
    "title: hello [world", "title: hello } world", "owner's-name: Joe", 'quote"mark: a',
    "metadata: { owner: John's note }",
    'metadata: &entry {\n  title: "A\\"\n    ] B"\n}',
    "metadata: !!map &meta {\n  title: Example\n}",
    'custom: "A\n  ] B"', "custom: |\n  First\n  Second", "custom: First\n  Second",
  ])("keeps independently parsed YAML valid when patching %s", (property) => {
    const source = `---\n${property}\n---\nBody`;
    const structural = patchFolderNodesFrontmatter(source, { hidden: true });
    const scalar = patchFrontmatterScalar(source, "custom", "value");
    for (const document of [source, structural, scalar]) {
      const yaml = document.slice(4, document.indexOf("\n---", 4));
      expect(parseDocument(yaml).errors).toEqual([]);
    }
  });
});
