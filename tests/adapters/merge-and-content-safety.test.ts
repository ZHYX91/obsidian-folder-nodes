import { describe, expect, it, vi } from "vitest";
import { NodeService } from "../../src/adapters/node-service";
import { DEFAULT_SETTINGS } from "../../src/shared/settings";
import { FakeObsidian } from "../helpers/fake-obsidian";

const service = (fake: FakeObsidian) => new NodeService(fake.app, () => structuredClone(DEFAULT_SETTINGS));

function node(fake: FakeObsidian, path: string, body = "", tokens: string[] = []) {
  const folder = fake.addFolder(path);
  fake.addFile(`${path}/${folder.name}.md`, tokens.length === 0 ? body : `---\nfolder-nodes: ${JSON.stringify(tokens)}\n---\n${body}`);
  return folder;
}

describe("Merge destination and transaction order safety", () => {
  it.each(["body", "text-property", "list-property", "child-body", "child-property"])(
    "rejects changed host targets before any effects in %s", async (location) => {
      const fake = new FakeObsidian();
      const link = "![[Reference#Heading|Alias]]";
      const content = location.endsWith("property") ? `---\nrelated: ${location === "list-property" ? JSON.stringify([link]) : JSON.stringify(link)}\n---\n` : link;
      const source = node(fake, "Source", location.startsWith("child") ? "source" : content);
      if (location.startsWith("child")) fake.addFile("Source/child.md", content);
      const target = node(fake, "Target", "target");
      fake.addFolder("Old");
      const oldReference = fake.addFile("Old/Reference.md", "original");
      const newReference = fake.addFile("Target/Reference.md", "different");
      fake.app.metadataCache.getFirstLinkpathDest = vi.fn((_path, from) => from.startsWith("Source/") ? oldReference : newReference);
      const snapshots = new Map(fake.contents);
      await expect(service(fake).mergeNode(source, target)).rejects.toThrow("change a WikiLink target");
      expect(fake.contents).toEqual(snapshots);
      expect(fake.renames).toEqual([]);
      expect(fake.trashed).toEqual([]);
    },
  );

  it.each(["unresolved", "moving-target", "new-competitor"])("fails closed before moving for %s", async (mode) => {
    const fake = new FakeObsidian();
    const source = node(fake, "Source", mode === "moving-target" ? "[[Source/Reference]]" : "[[Reference]]");
    const target = node(fake, "Target", "target");
    const moving = fake.addFile("Source/Reference.md", "moving");
    const fixed = fake.addFile("Reference.md", "fixed");
    fake.app.metadataCache.getFirstLinkpathDest = () => mode === "unresolved" ? null : mode === "moving-target" ? moving : fixed;
    const snapshots = new Map(fake.contents);
    await expect(service(fake).mergeNode(source, target)).rejects.toThrow("Cannot prove");
    expect(fake.contents).toEqual(snapshots);
    expect(fake.renames).toEqual([]);
    expect(fake.trashed).toEqual([]);
  });

  it("retains safe aliases and child self-subpaths without rewriting", async () => {
    const fake = new FakeObsidian();
    const source = node(fake, "Source", '---\nrelated: ["[[Reference#^block|Alias]]"]\n---\n![[Reference#Heading|Alias]]');
    fake.addFile("Source/child.md", "[[#Heading]] ![[#^block]]");
    const target = node(fake, "Target", "target");
    const reference = fake.addFile("Reference.md", "reference");
    fake.app.metadataCache.getFirstLinkpathDest = () => reference;
    await service(fake).mergeNode(source, target);
    expect(fake.contents.get("Target/Target.md")).toContain("![[Reference#Heading|Alias]]");
    expect(fake.frontmatters.get("Target/Target.md")?.related).toEqual(["[[Reference#^block|Alias]]"]);
    expect(fake.contents.get("Target/child.md")).toBe("[[#Heading]] ![[#^block]]");
  });

  it("compares final resolution to the saved original identity and rolls back", async () => {
    const fake = new FakeObsidian();
    const source = node(fake, "Source", "[[Reference]]");
    fake.addFile("Source/asset.bin", "asset");
    const target = node(fake, "Target", "target");
    const original = fake.addFile("Reference.md", "original");
    let replacement = original;
    fake.app.metadataCache.getFirstLinkpathDest = vi.fn(() => replacement);
    const process = fake.app.vault.process.bind(fake.app.vault);
    fake.app.vault.process = async (file, update) => {
      const result = await process(file, update);
      if (file.path === "Target/Target.md") {
        fake.remove(original.path);
        replacement = fake.addFile("Reference.md", "replacement");
      }
      return result;
    };
    await expect(service(fake).mergeNode(source, target)).rejects.toThrow("change a WikiLink target");
    expect(fake.requireFolder("Source")).toBe(source);
    expect(fake.contents.get("Target/Target.md")).toBe("target");
    expect(fake.requireFile("Source/asset.bin")).toBeDefined();
    expect(fake.trashed).toEqual([]);
  });

  it.each(["immediate", "deferred", "partial"])("persists source append order with %s metadata", async (mode) => {
    const fake = new FakeObsidian("Vault", { metadataUpdates: mode === "immediate" ? "immediate" : "deferred" });
    const source = node(fake, "Source", "source", ["order=manual"]);
    node(fake, "Source/First", "", ["rank=4096"]);
    node(fake, "Source/Second", "", ["rank=8192"]);
    const target = node(fake, "Target", "target", ["order=manual"]);
    node(fake, "Target/Existing", "", ["rank=1024"]);
    const process = fake.app.vault.process.bind(fake.app.vault);
    if (mode === "partial") fake.app.vault.process = async (file, update) => {
      const result = await process(file, update);
      if (file.path.endsWith("First/First.md")) fake.refreshMetadata(file);
      return result;
    };
    const nodes = service(fake);
    await nodes.mergeNode(source, target);
    fake.flushMetadata();
    expect(nodes.children("Target").map(({ childPath }) => childPath)).toEqual(["Target/Existing", "Target/First", "Target/Second"]);
    expect(fake.frontmatters.get("Target/First/First.md")?.["folder-nodes"]).toEqual(["rank=2048"]);
    expect(fake.frontmatters.get("Target/Second/Second.md")?.["folder-nodes"]).toEqual(["rank=3072"]);
  });

  it("restores original rank bytes and paths after a later merge failure with delayed caches", async () => {
    const fake = new FakeObsidian("Vault", { metadataUpdates: "deferred" });
    const source = node(fake, "Source", "source", ["order=manual"]);
    node(fake, "Source/First", "", ["rank=4096", "future=keep"]);
    node(fake, "Source/Second", "", ["rank=8192"]);
    const target = node(fake, "Target", "target", ["order=manual"]);
    node(fake, "Target/Existing", "", ["rank=1024"]);
    const snapshots = new Map(fake.contents);
    fake.failNext("trash");
    await expect(service(fake).mergeNode(source, target)).rejects.toThrow("trash failed");
    fake.flushMetadata();
    expect(fake.contents).toEqual(snapshots);
    expect(fake.requireFolder("Source")).toBe(source);
    expect(fake.trashed).toEqual([]);
  });
});

describe("Queued content move bindings", () => {
  it("retains a slash-path Root target while a file move is queued", async () => {
    const fake = new FakeObsidian();
    fake.root.path = "/";
    fake.addFolder("Source");
    const source = fake.addFile("Source/file.txt", "original");
    const first = fake.addFile("first.txt");
    const nodes = service(fake);
    let release!: () => void;
    let entered!: () => void;
    const ready = new Promise<void>((resolve) => { entered = resolve; });
    const blocker = new Promise<void>((resolve) => { release = resolve; });
    fake.app.vault.adapter.exists = async (path) => {
      if (path === "renamed.txt") { entered(); await blocker; }
      return fake.files.has(path);
    };
    const earlier = nodes.renameFile(first, "renamed.txt");
    await ready;
    const pending = nodes.moveFile(source, "");
    release();
    await earlier;
    await pending;
    expect(fake.requireFile("file.txt")).toBe(source);
    expect(fake.renames.at(-1)).toEqual({ from: "Source/file.txt", to: "file.txt" });
  });
  it.each(["source-rename", "source-replace", "target-replace"])("rejects %s while queued", async (change) => {
    const fake = new FakeObsidian();
    const source = fake.addFile("file.txt", "original");
    const target = fake.addFolder("Target");
    const first = fake.addFile("first.txt");
    const nodes = service(fake);
    let release!: () => void;
    let entered!: () => void;
    const ready = new Promise<void>((resolve) => { entered = resolve; });
    const blocker = new Promise<void>((resolve) => { release = resolve; });
    fake.app.vault.adapter.exists = async (path) => {
      if (path === "renamed.txt") { entered(); await blocker; }
      return fake.files.has(path);
    };
    const earlier = nodes.renameFile(first, "renamed.txt");
    await ready;
    const pending = nodes.moveFile(source, "Target");
    if (change === "source-rename") await fake.rename(source, "elsewhere.txt");
    if (change === "source-replace") { fake.remove("file.txt"); fake.addFile("file.txt", "replacement"); }
    if (change === "target-replace") { fake.remove("Target"); fake.addFolder("Target"); }
    const count = fake.renames.length;
    release();
    await earlier;
    await expect(pending).rejects.toThrow("identity changed");
    expect(fake.renames.slice(count)).toEqual([{ from: "first.txt", to: "renamed.txt" }]);
    expect(fake.files.has("Target/file.txt")).toBe(false);
    if (change === "target-replace") expect(fake.requireFolder("Target")).not.toBe(target);
  });
});
