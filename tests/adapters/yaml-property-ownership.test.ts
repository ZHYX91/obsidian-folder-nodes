import { describe, expect, it, vi } from "vitest";

import { NodeService } from "../../src/adapters/node-service";
import { DEFAULT_SETTINGS } from "../../src/shared/settings";
import { FakeObsidian } from "../helpers/fake-obsidian";
import { expectFrontmatterPropertyChanges, parseFrontmatterDocument } from "../helpers/frontmatter-oracle";

async function hideNode(source: string): Promise<string> {
  const fake = new FakeObsidian();
  const folder = fake.addFolder("A");
  fake.addFile("A/A.md", source);
  const process = vi.spyOn(fake.app.vault, "process");

  await new NodeService(fake.app, () => structuredClone(DEFAULT_SETTINGS)).setNodeHidden(folder, true);

  expect(process).toHaveBeenCalledOnce();
  return fake.contents.get("A/A.md")!;
}

const SPACES = [
  ["NBSP", "\u00a0", "\n"],
  ["ideographic space", "\u3000", "\r\n"],
] as const;

describe("YAML property ownership during node writes", () => {
  it.each(SPACES.flatMap(([name, space, eol]) => [
    [`${name} after canonical name`, `folder-nodes${space}`, "[future=keep]", eol],
    [`${name} after legacy name`, `folderNodeHidden${space}`, "false", eol],
    [`${name} after a literal colon`, `folder-nodes:${space}custom`, "keep", eol],
  ]))("preserves the distinct plain key with %s", async (_name, key, value, eol) => {
    const source = `---${eol}${key}: ${value}${eol}title: Untouched${eol}---${eol}Body sentinel${eol}`;
    const before = parseFrontmatterDocument(source);
    expect(before.data).toHaveProperty(key!);

    const after = await hideNode(source);

    expectFrontmatterPropertyChanges(source, after, { "folder-nodes": ["hidden=true"] });
    expect(after).toContain(`${key}: ${value}${eol}`);
  });

  it.each(SPACES)("preserves a neighboring top-level key beginning with %s", async (_name, space, eol) => {
    const source = `---${eol}folderNodeHidden: false${eol}${space}custom: keep${eol}title: Untouched${eol}---${eol}Body sentinel${eol}`;
    const before = parseFrontmatterDocument(source);
    expect(before.data).toEqual({ folderNodeHidden: false, [`${space}custom`]: "keep", title: "Untouched" });

    const after = await hideNode(source);
    const parsed = parseFrontmatterDocument(after);

    expect(parsed.data).toEqual({ "folder-nodes": ["hidden=true"], [`${space}custom`]: "keep", title: "Untouched" });
    expect(parsed.tail).toBe(before.tail);
    expect(after).toContain(`${space}custom: keep${eol}`);
  });

  it.each(SPACES.flatMap(([name, space, eol]) => [
    [`quoted canonical ${name}`, JSON.stringify(`folder-nodes${space}`), eol],
    [`quoted neighboring ${name}`, JSON.stringify(`${space}custom`), eol],
  ]))("preserves %s as an unrelated key", async (_name, key, eol) => {
    const source = `---${eol}${key}: [keep]${eol}---${eol}Body sentinel${eol}`;
    const after = await hideNode(source);
    expectFrontmatterPropertyChanges(source, after, { "folder-nodes": ["hidden=true"] });
    expect(after).toContain(`${key}: [keep]${eol}`);
  });

  it.each([" ", "\t"])("still recognizes ASCII separation %j around an owned key", async (space) => {
    const source = `---\nfolder-nodes${space}:${space}[future=keep]\n---\nBody sentinel\n`;
    const after = await hideNode(source);
    expectFrontmatterPropertyChanges(source, after, { "folder-nodes": ["hidden=true", "future=keep"] });
  });

  it.each([
    "unrelated: [keep]",
    "metadata:\n  folder-nodes: [nested=keep]\n  \u00a0custom: keep",
  ])("preserves unrelated and nested properties: %s", async (properties) => {
    const source = `---\n${properties}\n---\nBody sentinel\n`;
    const after = await hideNode(source);
    expectFrontmatterPropertyChanges(source, after, { "folder-nodes": ["hidden=true"] });
    expect(after).toContain(properties);
  });
});
