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
  it("writes the intended incoming rank when an equal cached rank hides different source bytes", async () => {
    const fake = new FakeObsidian("Vault", { metadataUpdates: "deferred" });
    const source = node(fake, "Source", "source", ["order=manual"]);
    node(fake, "Source/First", "", ["rank=4096"]);
    node(fake, "Source/Second", "", ["rank=8192"]);
    fake.frontmatters.set("Source/First/First.md", { "folder-nodes": ["rank=2048"] });
    const target = node(fake, "Target", "target", ["order=manual"]);
    node(fake, "Target/Existing", "", ["rank=1024"]);
    const nodes = service(fake);
    await nodes.mergeNode(source, target);
    fake.flushMetadata();
    expect(nodes.children("Target").map(({ childPath }) => childPath)).toEqual(["Target/Existing", "Target/First", "Target/Second"]);
    expect(fake.frontmatters.get("Target/First/First.md")?.["folder-nodes"]).toEqual(["rank=2048"]);
  });

  it("uses the completed source reorder rather than its still-old cache in the next queued merge", async () => {
    const fake = new FakeObsidian("Vault", { metadataUpdates: "deferred" });
    fake.addFile("Vault.md");
    const source = node(fake, "Source", "source", ["order=manual"]);
    const first = node(fake, "Source/First", "", ["rank=2048"]);
    node(fake, "Source/Second", "", ["rank=3072"]);
    const target = node(fake, "Target", "target", ["order=manual"]);
    node(fake, "Target/Existing", "", ["rank=1024"]);
    const nodes = service(fake);
    const previous = nodes.reorder(first, 1);
    const merged = nodes.mergeNode(source, target);
    await previous;
    await merged;
    fake.flushMetadata();
    expect(nodes.children("Target").map(({ childPath }) => childPath)).toEqual(["Target/Existing", "Target/Second", "Target/First"]);
    expect(fake.frontmatters.get("Target/First/First.md")?.["folder-nodes"]).toEqual(["rank=3072"]);
  });

  it("appends after a previous queued placement whose target rank has not reached Metadata Cache", async () => {
    const fake = new FakeObsidian("Vault", { metadataUpdates: "deferred" });
    fake.addFile("Vault.md");
    const prior = node(fake, "Prior", "", ["rank=1"]);
    const source = node(fake, "Source", "source", ["order=manual"]);
    node(fake, "Source/AIncoming", "", ["rank=8192"]);
    const target = node(fake, "Target", "target", ["order=manual"]);
    node(fake, "Target/Existing", "", ["rank=1024"]);
    const nodes = service(fake);
    const previous = nodes.placeNode(prior, { kind: "move-into", parentPath: "Target" });
    const merged = nodes.mergeNode(source, target);
    await previous;
    await merged;
    fake.flushMetadata();
    expect(nodes.children("Target").map(({ childPath }) => childPath)).toEqual(["Target/Existing", "Target/Prior", "Target/AIncoming"]);
    expect(nodes.children("Target").map(({ order }) => order)).toEqual([1024, 2048, 3072]);
  });

  it("uses a queued manual-mode change and exact target ranks despite old mode/rank caches", async () => {
    const fake = new FakeObsidian("Vault", { metadataUpdates: "deferred" });
    const source = node(fake, "Source", "source");
    node(fake, "Source/Incoming", "", ["rank=8192"]);
    const target = node(fake, "Target", "target");
    node(fake, "Target/Existing", "", ["rank=1"]);
    const nodes = service(fake);
    const previous = nodes.setChildOrderMode("Target", "manual");
    const merged = nodes.mergeNode(source, target);
    await previous;
    await merged;
    fake.flushMetadata();
    expect(nodes.children("Target").map(({ order }) => order)).toEqual([1024, 2048]);
  });

  it("does not keep the retired source node in an ancestor target's rank sequence", async () => {
    const fake = new FakeObsidian("Vault", { metadataUpdates: "deferred" });
    const target = node(fake, "Target", "target", ["order=manual"]);
    node(fake, "Target/Existing", "", ["rank=1024"]);
    const source = node(fake, "Target/Source", "source", ["rank=2048"]);
    node(fake, "Target/Source/Incoming", "", ["rank=8192"]);
    const nodes = service(fake);
    await nodes.mergeNode(source, target);
    fake.flushMetadata();
    expect(nodes.children("Target").map(({ childPath }) => childPath)).toEqual(["Target/Existing", "Target/Incoming"]);
    expect(nodes.children("Target").map(({ order }) => order)).toEqual([1024, 2048]);
  });

  it("refuses a new target child at final validation and retains that external addition", async () => {
    const fake = new FakeObsidian();
    const source = node(fake, "Source", "source");
    node(fake, "Source/Incoming", "", ["rank=8192"]);
    const target = node(fake, "Target", "target", ["order=manual"]);
    node(fake, "Target/Existing", "", ["rank=1024"]);
    const read = fake.app.vault.read.bind(fake.app.vault);
    let reads = 0;
    fake.app.vault.read = async (file) => {
      const contents = await read(file);
      if (file.path === "Target/Incoming/Incoming.md" && ++reads === 2) node(fake, "Target/External", "external body");
      return contents;
    };
    await expect(service(fake).mergeNode(source, target)).rejects.toThrow("structure changed");
    expect(fake.requireFolder("Source")).toBe(source);
    expect(fake.contents.get("Target/External/External.md")).toBe("external body");
    expect(fake.trashed).toEqual([]);
  });

  it("preserves an external change to an earlier rank dependency and compensates the merge", async () => {
    const fake = new FakeObsidian("Vault", { metadataUpdates: "deferred" });
    const source = node(fake, "Source", "source");
    node(fake, "Source/Incoming", "", ["rank=8192"]);
    const target = node(fake, "Target", "target", ["order=manual"]);
    node(fake, "Target/Existing", "", ["rank=1024"]);
    const existing = fake.requireFile("Target/Existing/Existing.md");
    const read = fake.app.vault.read.bind(fake.app.vault);
    let reads = 0;
    fake.app.vault.read = async (file) => {
      const contents = await read(file);
      if (file.path === "Target/Incoming/Incoming.md" && ++reads === 2) {
        await fake.app.vault.modify(existing, '---\nfolder-nodes: ["rank=9999"]\n---\nexternal edit');
      }
      return contents;
    };
    await expect(service(fake).mergeNode(source, target)).rejects.toThrow("final merge validation");
    fake.flushMetadata();
    expect(fake.requireFolder("Source")).toBe(source);
    expect(fake.requireFile("Source/Incoming/Incoming.md")).toBeDefined();
    expect(fake.contents.get(existing.path)).toContain("external edit");
    expect(fake.frontmatters.get(existing.path)?.["folder-nodes"]).toEqual(["rank=9999"]);
    expect(fake.frontmatters.get("Source/Incoming/Incoming.md")?.["folder-nodes"]).toEqual(["rank=8192"]);
    expect(fake.trashed).toEqual([]);
  });

  it.each(["open-target-child", "ambiguous-target-rank"])("refuses an uncertain rank dependency before effects: %s", async (change) => {
    const fake = new FakeObsidian();
    const source = node(fake, "Source", "source");
    node(fake, "Source/Incoming", "", ["rank=8192"]);
    const target = node(fake, "Target", "target", ["order=manual"]);
    node(fake, "Target/Existing", "", ["rank=1024"]);
    const existing = fake.requireFile("Target/Existing/Existing.md");
    if (change === "open-target-child") fake.app.workspace.getLeavesOfType = () => [{ view: { file: existing, editor: {} } }] as never;
    else fake.contents.set(existing.path, '---\nfolder-nodes: ["rank=1024", "rank=2048"]\n---\n');
    const snapshots = new Map(fake.contents);
    await expect(service(fake).mergeNode(source, target)).rejects.toThrow(change === "open-target-child" ? "open" : "Cannot prove merge ordering");
    expect(fake.contents).toEqual(snapshots);
    expect(fake.renames).toEqual([]);
    expect(fake.trashed).toEqual([]);
  });

  it("preserves supported dirty target editors with valid ranks while appending", async () => {
    const fake = new FakeObsidian("Vault", { metadataUpdates: "deferred" });
    const source = node(fake, "Source", "source");
    node(fake, "Source/Incoming", "", ["rank=8192"]);
    const target = node(fake, "Target", "target", ["order=manual"]);
    node(fake, "Target/Existing", "disk body");
    const existing = fake.requireFile("Target/Existing/Existing.md");
    let value = '---\nfolder-nodes: ["rank=4096", "future=keep"]\n---\ndirty body';
    const editor = {
      getValue: () => value,
      offsetToPos: (offset: number) => ({ line: 0, ch: offset }),
      transaction: (change: { changes: Array<{ text: string }> }) => { value = change.changes[0]!.text; },
    };
    const requestSave = vi.fn(() => { void fake.app.vault.modify(existing, value); });
    const leaf = { view: { file: existing, editor, requestSave } };
    fake.app.workspace.getLeavesOfType = () => [leaf] as never;
    const nodes = service(fake);
    await nodes.mergeNode(source, target);
    expect(requestSave).not.toHaveBeenCalled();
    expect(fake.frontmatters.get("Target/Incoming/Incoming.md")?.["folder-nodes"]).toEqual(["rank=8192"]);
    await fake.app.vault.modify(existing, value);
    fake.flushMetadata();
    expect(value).toContain("dirty body");
    expect(value).toContain("future=keep");
    expect(nodes.children("Target").map(({ order }) => order)).toEqual([4096, 5120]);
  });

  it("requires closing only an open target child whose rank must be rewritten", async () => {
    const fake = new FakeObsidian();
    const source = node(fake, "Source", "source");
    node(fake, "Source/Incoming", "", ["rank=8192"]);
    const target = node(fake, "Target", "target", ["order=manual"]);
    node(fake, "Target/Existing", "disk body");
    const existing = fake.requireFile("Target/Existing/Existing.md");
    const requestSave = vi.fn();
    const leaf = { view: { file: existing, editor: { getValue: () => "dirty body without a rank" }, requestSave } };
    fake.app.workspace.getLeavesOfType = () => [leaf] as never;
    const snapshots = new Map(fake.contents);
    const process = vi.spyOn(fake.app.vault, "process");
    const nodes = service(fake);
    await expect(nodes.mergeNode(source, target)).rejects.toThrow("open");
    expect(fake.contents).toEqual(snapshots);
    expect(fake.renames).toEqual([]);
    expect(requestSave).not.toHaveBeenCalled();
    expect(process).not.toHaveBeenCalled();
    await fake.app.vault.modify(existing, leaf.view.editor.getValue());
    fake.app.workspace.getLeavesOfType = () => [];
    await nodes.mergeNode(source, target);
    expect(nodes.children("Target").map(({ order }) => order)).toEqual([1024, 2048]);
    expect(fake.contents.get(existing.path)).toContain("dirty body without a rank");
  });

  it.each(["expected-save", "different-disk-content"])("checks an open target's delayed final %s", async (change) => {
    const fake = new FakeObsidian("Vault", { metadataUpdates: "deferred" });
    const source = node(fake, "Source", "source");
    node(fake, "Source/Incoming", "", ["rank=8192"]);
    const target = node(fake, "Target", "target", ["order=manual"]);
    node(fake, "Target/Existing", "disk body", ["rank=1024"]);
    const existing = fake.requireFile("Target/Existing/Existing.md");
    let value = '---\nfolder-nodes: ["rank=1024"]\n---\ndirty body';
    const editor = {
      getValue: () => value,
      offsetToPos: (offset: number) => ({ line: 0, ch: offset }),
      transaction: (update: { changes: Array<{ text: string }> }) => { value = update.changes[0]!.text; },
    };
    const requestSave = vi.fn();
    const leaf = { view: { file: existing, editor, requestSave } };
    fake.app.workspace.getLeavesOfType = () => [leaf] as never;
    const read = fake.app.vault.read.bind(fake.app.vault);
    let reads = 0;
    fake.app.vault.read = async (file) => {
      const contents = await read(file);
      if (file.path === "Target/Incoming/Incoming.md" && ++reads === 2) {
        await fake.app.vault.modify(existing, change === "expected-save" ? value : "external disk edit");
      }
      return contents;
    };
    const nodes = service(fake);
    const merged = nodes.mergeNode(source, target);
    if (change === "expected-save") {
      await merged;
      fake.flushMetadata();
      expect(nodes.children("Target").map(({ order }) => order)).toEqual([1024, 2048]);
      expect(fake.contents.get(existing.path)).toBe(value);
      expect(value).toContain("dirty body");
      expect(fake.trashed).toEqual(["Source"]);
    } else {
      await expect(merged).rejects.toThrow("Merge rank save changed");
      expect(fake.requireFolder("Source")).toBe(source);
      expect(fake.contents.get(existing.path)).toBe("external disk edit");
      expect(value).toContain("dirty body");
      expect(requestSave).not.toHaveBeenCalled();
      expect(fake.trashed).toEqual([]);
    }
  });

  it("rejects an open target disk edit in the last save-verification await gap", async () => {
    const fake = new FakeObsidian();
    const source = node(fake, "Source", "source");
    node(fake, "Source/Incoming", "", ["rank=8192"]);
    const target = node(fake, "Target", "target", ["order=manual"]);
    node(fake, "Target/Existing", "disk body", ["rank=1024"]);
    const existing = fake.requireFile("Target/Existing/Existing.md");
    let value = '---\nfolder-nodes: ["rank=1024"]\n---\ndirty body';
    let armLateEdit = false;
    const editor = {
      getValue: () => {
        if (armLateEdit) {
          armLateEdit = false;
          queueMicrotask(() => { void fake.app.vault.modify(existing, "late external disk edit"); });
        }
        return value;
      },
      offsetToPos: (offset: number) => ({ line: 0, ch: offset }),
      transaction: (update: { changes: Array<{ text: string }> }) => { value = update.changes[0]!.text; },
    };
    const leaf = { view: { file: existing, editor, requestSave: () => undefined } };
    fake.app.workspace.getLeavesOfType = () => [leaf] as never;
    const read = fake.app.vault.read.bind(fake.app.vault);
    let reads = 0;
    fake.app.vault.read = async (file) => {
      const contents = await read(file);
      if (file.path === "Target/Incoming/Incoming.md" && ++reads === 2) await fake.app.vault.modify(existing, value);
      if (file === existing) armLateEdit = true;
      return contents;
    };
    await expect(service(fake).mergeNode(source, target)).rejects.toThrow("save changed after final validation");
    expect(fake.contents.get(existing.path)).toBe("late external disk edit");
    expect(value).toContain("dirty body");
    expect(fake.requireFolder("Source")).toBe(source);
    expect(fake.trashed).toEqual([]);
  });

  it.each(["edit", "replace-editor"])("rejects a final target editor %s without relying on a Vault modify event", async (change) => {
    const fake = new FakeObsidian();
    const source = node(fake, "Source", "source");
    node(fake, "Source/Incoming", "", ["rank=8192"]);
    const target = node(fake, "Target", "target", ["order=manual"]);
    node(fake, "Target/Existing", "", ["rank=1024"]);
    const existing = fake.requireFile("Target/Existing/Existing.md");
    let value = fake.contents.get(existing.path)!;
    const editor = { getValue: () => value };
    let leaf = { view: { file: existing, editor, requestSave: () => undefined } };
    fake.app.workspace.getLeavesOfType = () => [leaf] as never;
    const read = fake.app.vault.read.bind(fake.app.vault);
    let reads = 0;
    fake.app.vault.read = async (file) => {
      const contents = await read(file);
      if (file.path === "Target/Incoming/Incoming.md" && ++reads === 2) {
        if (change === "edit") value += "\nunsaved external edit";
        else leaf = { view: { file: existing, editor: { getValue: () => value }, requestSave: () => undefined } };
      }
      return contents;
    };
    await expect(service(fake).mergeNode(source, target)).rejects.toThrow("Merge rank editor changed");
    expect(fake.requireFolder("Source")).toBe(source);
    expect(fake.requireFile("Source/Incoming/Incoming.md")).toBeDefined();
    if (change === "edit") expect(value).toContain("unsaved external edit");
    expect(fake.trashed).toEqual([]);
  });

  it("does not patch new content that changes before the rank callback", async () => {
    const fake = new FakeObsidian();
    const source = node(fake, "Source", "source");
    node(fake, "Source/Incoming", "body", ["rank=8192"]);
    const target = node(fake, "Target", "target", ["order=manual"]);
    node(fake, "Target/Existing", "", ["rank=1024"]);
    const process = fake.app.vault.process.bind(fake.app.vault);
    let changed = false;
    fake.app.vault.process = async (file, update) => {
      if (file.path === "Target/Incoming/Incoming.md" && !changed) {
        changed = true;
        await fake.app.vault.modify(file, (fake.contents.get(file.path) ?? "") + "\nexternal edit");
      }
      return process(file, update);
    };
    await expect(service(fake).mergeNode(source, target)).rejects.toThrow("Merge rank source changed");
    expect(fake.contents.get("Source/Incoming/Incoming.md")).toContain("external edit");
    expect(fake.frontmatters.get("Source/Incoming/Incoming.md")?.["folder-nodes"]).toEqual(["rank=8192"]);
    expect(fake.trashed).toEqual([]);
  });

  it("does not write through an editor opened after rank preflight", async () => {
    const fake = new FakeObsidian();
    const source = node(fake, "Source", "source");
    node(fake, "Source/Incoming", "body", ["rank=8192"]);
    const target = node(fake, "Target", "target", ["order=manual"]);
    node(fake, "Target/Existing", "", ["rank=1024"]);
    const file = fake.requireFile("Source/Incoming/Incoming.md");
    const original = fake.contents.get(file.path)!;
    const requestSave = vi.fn();
    const leaf = { view: { file, editor: { getValue: () => original }, requestSave } };
    const process = fake.app.vault.process.bind(fake.app.vault);
    fake.app.vault.process = async (current, update) => {
      if (current === file) fake.app.workspace.getLeavesOfType = () => [leaf] as never;
      return process(current, update);
    };
    await expect(service(fake).mergeNode(source, target)).rejects.toThrow("open");
    expect(fake.contents.get("Source/Incoming/Incoming.md")).toBe(original);
    expect(requestSave).not.toHaveBeenCalled();
    expect(fake.trashed).toEqual([]);
  });

  it("refuses rank compensation when an unbindable editor opens inside its actual callback", async () => {
    const fake = new FakeObsidian();
    const source = node(fake, "Source", "source");
    node(fake, "Source/Incoming", "body", ["rank=8192"]);
    const target = node(fake, "Target", "target", ["order=manual"]);
    node(fake, "Target/Existing", "", ["rank=1024"]);
    const file = fake.requireFile("Source/Incoming/Incoming.md");
    const editor = { getValue: () => "unsaved recovery edit" };
    const leaf = { view: { file, editor } };
    const process = fake.app.vault.process.bind(fake.app.vault);
    let writes = 0;
    fake.app.vault.process = async (current, update) => {
      if (current === file && ++writes === 2) fake.app.workspace.getLeavesOfType = () => [leaf] as never;
      return process(current, update);
    };
    fake.failNext("trash");
    await expect(service(fake).mergeNode(source, target)).rejects.toThrow("rollback was incomplete");
    expect(fake.requireFolder("Source")).toBe(source);
    expect(editor.getValue()).toBe("unsaved recovery edit");
    expect(fake.frontmatters.get(file.path)?.["folder-nodes"]).toEqual(["rank=2048"]);
    expect(fake.trashed).toEqual([]);
  });
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
