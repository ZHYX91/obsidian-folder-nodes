import MarkdownIt from "markdown-it";
import { describe, expect, it } from "vitest";
import { NodeService } from "../../src/adapters/node-service";
import { DEFAULT_SETTINGS } from "../../src/shared/settings";
import { FakeObsidian } from "../helpers/fake-obsidian";

const targetNote = "Deep/Target/Target.md";
const fencedExample = "```\n[go](../local.md)\n```";

function fixture(targetText: string, sourceText = fencedExample, sourceName = "Source") {
  const vault = new FakeObsidian();
  vault.addFile("Vault.md");
  const source = vault.addFolder(sourceName);
  vault.addFile(`${sourceName}/${sourceName}.md`, sourceText);
  vault.addFile(`${sourceName}/child.md`, "child");
  vault.addFolder("Deep");
  const target = vault.addFolder("Deep/Target");
  vault.addFile(targetNote, targetText);
  const nodes = new NodeService(vault.app, () => structuredClone(DEFAULT_SETTINGS));
  return { vault, merge: () => nodes.mergeNode(source, target) };
}

describe("appending a Node Note body", () => {
  it.each([
    ["d: !!timestamp 2024-01-01", "d: !!timestamp 2024-01-02", false],
    ["d: !!timestamp 2024-01-01", "d: !!timestamp 2024-01-01", true],
    ["v: !!set {alma, beta}", "v: !!set {alma, gamma}", false],
    ["v: !!set {alma, beta}", "v: !!set {beta, alma}", true],
    ["v: {é: 1, e\u0301: 2}", "v: {e\u0301: 2, é: 1}", true],
  ])("compares YAML mappings and tagged property values before moving notes: %s", async (a, b, safe) => {
    const target = `---\n${a}\n---\ntarget`;
    const source = `---\n${b}\n---\nsource`;
    const { vault, merge } = fixture(target, source);
    if (safe) {
      await merge();
      expect(vault.contents.get(targetNote)).toBe(`${target}\n\n## Merged from Source\n\nsource`);
    } else {
      const before = new Map(vault.contents);
      await expect(merge()).rejects.toThrow("property conflict");
      expect(vault.contents).toEqual(before);
      expect(vault.trashed).toEqual([]);
    }
  });
  it("refuses a property whose type cannot survive host YAML serialization into an unannotated target", async () => {
    const { vault, merge } = fixture("target", "---\nd: !!timestamp 2024-01-01\n---\nsource");
    const before = new Map(vault.contents);
    await expect(merge()).rejects.toThrow(/serialize merge properties/u);
    expect(vault.contents).toEqual(before);
    expect(vault.trashed).toEqual([]);
  });
  it("normalizes a bare CR only in the YAML parser input", async () => {
    const target = "first\rsecond";
    const { vault, merge } = fixture(target, "---\nimported: yes\n---\nsource");
    await merge();
    expect(vault.contents.get(targetNote)).toBe("---\rimported: yes\r---\rfirst\rsecond\r\r## Merged from Source\r\rsource");
  });
  it.each(["none", "block", "flow"])("preserves authored body endings when transferring properties (target frontmatter: %s)", async (frontmatter) => {
    const targetBody = "target one\r\ntarget two\ntarget end";
    const target = (frontmatter === "none" ? "" : `---\r\n${frontmatter === "flow" ? "{tags: [target]}" : "tags: [target]"}\r\n---\r\n`) + targetBody;
    const sourceBody = "line one\r\nline two\nlast\r\n";
    const source = "\uFEFF---\r\nimported: yes\r\n---\r\n" + sourceBody;
    const { vault, merge } = fixture(target, source);
    await merge();
    const merged = vault.contents.get(targetNote)!;
    expect(merged).toContain(targetBody);
    expect(merged).toContain("imported:");
    expect(merged).toContain("\r\n\r\n## Merged from Source\r\n\r\n");
    expect(merged.endsWith(sourceBody)).toBe(true);
    expect(vault.trashed).toEqual(["Source"]);
  });
  it.each(["```", "<!-- open", "<pre>example", "%% open"])(
    "refuses a target ending in %j before moving children or changing notes", async (targetText) => {
      const { vault, merge } = fixture(targetText);
      const original = new Map(vault.contents);
      await expect(merge()).rejects.toThrow(/Cannot append/u);
      expect(vault.contents).toEqual(original);
      expect(vault.renames).toEqual([]);
      expect(vault.trashed).toEqual([]);
    },
  );

  it.each(["ordinary paragraph", "```\nexample\n```", "    indented code", "<pre>code</pre>", "%% closed %%"])(
    "preserves the appended fenced example after %j", async (targetText) => {
      const { vault, merge } = fixture(targetText);
      await merge();
      expect(vault.contents.get(targetNote)).toBe(`${targetText}\n\n## Merged from Source\n\n${fencedExample}`);
      expect(vault.contents.get("Deep/Target/child.md")).toBe("child");
      expect(vault.trashed).toEqual(["Source"]);
    },
  );

  it("accepts a closed inline code span in the actual source folder name", async () => {
    const name = "Docs `v2`";
    const { vault, merge } = fixture("target", fencedExample, name);
    await merge();
    expect(vault.contents.get(targetNote)).toBe(`target\n\n## Merged from ${name}\n\n${fencedExample}`);
    expect(vault.trashed).toEqual([name]);
  });

  it("refuses a source folder name that opens a comment around the appended body", async () => {
    const { vault, merge } = fixture("target", fencedExample, "Source %%");
    await expect(merge()).rejects.toThrow(/Cannot append/u);
    expect(vault.contents.get(targetNote)).toBe("target");
    expect(vault.renames).toEqual([]);
    expect(vault.trashed).toEqual([]);
  });

  it("moves children without appending a heading when the source body is empty", async () => {
    const { vault, merge } = fixture("```", "\n \n");
    await merge();
    expect(vault.contents.get(targetNote)).toBe("```");
    expect(vault.contents.get("Deep/Target/child.md")).toBe("child");
  });
});

describe("active links inside raw HTML when a Node moves", () => {
  const markdown = new MarkdownIt("commonmark", { html: true });
  it.each([
    ["<code>[go](../local.md)</code>", "local.md", '<a href="../local.md">'],
    ['<pre><a href="../local.md">go</a></pre>', "local.md", '<a href="../local.md">'],
    ['<pre><img src="../local.png"></pre>', "local.png", '<img src="../local.png">'],
  ])("refuses the active destination in %s", async (body, file, element) => {
    expect(markdown.render(body)).toContain(element);
    const { vault, merge } = fixture("target", body);
    const oldTarget = vault.addFile(file, "old");
    const newTarget = vault.addFile(`Deep/${file}`, "new");
    vault.app.metadataCache.getFirstLinkpathDest = (_path, from) => from.startsWith("Source/") ? oldTarget : newTarget;
    const original = new Map(vault.contents);
    await expect(merge()).rejects.toThrow(/link/iu);
    expect(vault.contents).toEqual(original);
    expect(vault.renames).toEqual([]);
    expect(vault.trashed).toEqual([]);
  });

  it.each([
    ['Use href="local.md" as an example.', true],
    [`<span title='href="local.md"'>text</span>`, true],
    ['<a href=\n "https://example.com">go</a>', true],
    ['<a href=\n "local.md">go</a>', false],
    ['<div><img src=local.png /badsyntax></div>', false],
  ])("checks actual HTML attributes and retains raw HTML ambiguity: %s", async (body, safe) => {
    const { vault, merge } = fixture("target", body);
    if (safe) {
      await merge();
      expect(vault.contents.get(targetNote)).toContain(body);
    } else {
      const before = new Map(vault.contents);
      await expect(merge()).rejects.toThrow("relative HTML link");
      expect(vault.contents).toEqual(before);
      expect(vault.trashed).toEqual([]);
    }
  });
  it("keeps Markdown image syntax as literal text in a pre block", async () => {
    const body = "<pre>![photo](../local.png)</pre>";
    expect(markdown.render(body)).not.toContain("<img");
    const { vault, merge } = fixture("target", body);
    await merge();
    expect(vault.contents.get(targetNote)).toBe(`target\n\n## Merged from Source\n\n${body}`);
    expect(vault.trashed).toEqual(["Source"]);
  });
});

describe.each(["source", "target"] as const)("reference uses in the %s body", (side) => {
  const markdown = new MarkdownIt("commonmark", { html: true });
  const url = "https://docs.example.test/guide";
  const definition = `[UnKnOwN]: ${url}`;

  function bodies(using: string, defining = definition) {
    return side === "source" ? { target: defining, source: using } : { target: using, source: defining };
  }

  it.each([
    ["[go][unknown]", "href"], ["[unknown][]", "href"], ["[unknown]", "href"],
    ["![photo][unknown]", "src"], ["![unknown][]", "src"], ["![unknown]", "src"],
  ])("refuses a definition in the other note that would activate %s", async (using, attribute) => {
    const { source, target } = bodies(using);
    const renderedAttribute = `${attribute}="${url}"`;
    expect(markdown.render(source)).not.toContain(renderedAttribute);
    expect(markdown.render(target)).not.toContain(renderedAttribute);
    expect(markdown.render(`${target}\n\n## Merged from Source\n\n${source}`)).toContain(renderedAttribute);
    const { vault, merge } = fixture(target, source);
    const original = new Map(vault.contents);
    await expect(merge()).rejects.toThrow(/reference|link|image/iu);
    expect(vault.contents).toEqual(original);
    expect(vault.renames).toEqual([]);
    expect(vault.trashed).toEqual([]);
  });

  it("keeps reference-shaped text literal in inline and fenced code", async () => {
    const { source, target } = bodies("`[go][unknown]`\n\n```\n![unknown]\n```");
    const { vault, merge } = fixture(target, source);
    await merge();
    const merged = vault.contents.get(targetNote)!;
    expect(merged).toBe(`${target}\n\n## Merged from Source\n\n${source}`);
    expect(markdown.render(merged)).not.toMatch(/(?:href|src)=/u);
    expect(vault.trashed).toEqual(["Source"]);
  });

  it("preserves an active reference with an equivalent definition in both notes", async () => {
    const { source, target } = bodies(`[go][unknown]\n\n[UNKNOWN]: <${url}>`);
    const { vault, merge } = fixture(target, source);
    await merge();
    const merged = vault.contents.get(targetNote)!;
    expect(merged).toBe(`${target}\n\n## Merged from Source\n\n${source}`);
    expect(markdown.render(merged)).toContain(`<a href="${url}">go</a>`);
    expect(vault.trashed).toEqual(["Source"]);
  });
  it("keeps comments, unrelated labels, and explicit destinations independent", async () => {
    const { source, target } = bodies("%% [unknown] %%\n\n<!-- ![unknown] -->\n\n[unrelated] [unknown](https://other.example)");
    const { vault, merge } = fixture(target, source);
    await merge();
    expect(vault.contents.get(targetNote)).toBe(`${target}\n\n## Merged from Source\n\n${source}`);
  });
});
