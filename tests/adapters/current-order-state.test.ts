import { describe, expect, it, vi } from "vitest";
import { NodeService } from "../../src/adapters/node-service";
import { DEFAULT_SETTINGS } from "../../src/shared/settings";
import { FakeObsidian } from "../helpers/fake-obsidian";

const service = (fake: FakeObsidian) => new NodeService(fake.app, () => structuredClone(DEFAULT_SETTINGS));
const content = (tokens: string[], body = "") => `---\nfolder-nodes: ${JSON.stringify(tokens)}\n---\n${body}`;

function node(fake: FakeObsidian, path: string, rank?: number) {
  const folder = fake.addFolder(path);
  fake.addFile(`${path}/${folder.name}.md`, rank === undefined ? "body" : content([`rank=${rank}`, "future=keep"], `${folder.name} body`));
  return folder;
}

describe("Current ordering state at queued operation entry", () => {
  it.each(["immediate", "deferred", "partial"])("applies both queued reorders with %s metadata", async (mode) => {
    const fake = new FakeObsidian("Vault", { metadataUpdates: mode === "immediate" ? "immediate" : "deferred" });
    fake.addFile("Vault.md", content(["order=manual"]));
    const a = node(fake, "A", 1024);
    node(fake, "B", 2048);
    node(fake, "C", 3072);
    const nodes = service(fake);
    await nodes.reorder(a, 1);
    if (mode === "partial") fake.refreshMetadata(fake.requireFile("C/C.md"));
    await nodes.reorder(a, 1);
    fake.flushMetadata();

    expect(nodes.children("").map(({ childPath }) => childPath)).toEqual(["B", "C", "A"]);
    expect(nodes.children("").map(({ order }) => order)).toEqual([2048, 3072, 4096]);
    expect(fake.contents.get("A/A.md")).toContain("future=keep");
    expect(fake.contents.get("A/A.md")).toContain("A body");
  });

  it.each(["", "Parent"])("keeps the last mode selection before metadata catches up under %s", async (parentPath) => {
    const fake = new FakeObsidian("Vault", { metadataUpdates: "deferred" });
    if (parentPath !== "") fake.addFolder(parentPath);
    fake.addFile(parentPath === "" ? "Vault.md" : "Parent/Parent.md", content(["order=manual", "future=keep"]));
    const prefix = parentPath === "" ? "" : parentPath + "/";
    node(fake, prefix + "A", 3072);
    node(fake, prefix + "B", 2048);
    node(fake, prefix + "C", 1024);
    const nodes = service(fake);
    const first = nodes.setChildOrderMode(parentPath, "natural");
    const second = nodes.setChildOrderMode(parentPath, "manual");
    await first;
    await second;
    fake.flushMetadata();

    expect(nodes.sortMode(parentPath)).toBe("manual");
    expect(nodes.children(parentPath).map(({ basename }) => basename)).toEqual(["A", "B", "C"]);
    expect(nodes.children(parentPath).map(({ order }) => order)).toEqual([1024, 2048, 3072]);
  });

  it("reorders immediately after enabling manual mode without awaiting a cache event", async () => {
    const fake = new FakeObsidian("Vault", { metadataUpdates: "deferred" });
    fake.addFile("Vault.md", "root");
    const a = node(fake, "A");
    node(fake, "B");
    const nodes = service(fake);
    const mode = nodes.setChildOrderMode("", "manual");
    const reorder = nodes.reorder(a, 1);
    await mode;
    await reorder;
    fake.flushMetadata();

    expect(nodes.children("").map(({ childPath }) => childPath)).toEqual(["B", "A"]);
  });

  it("places a node using the preceding mode change and current target ranks", async () => {
    const fake = new FakeObsidian("Vault", { metadataUpdates: "deferred" });
    fake.addFile("Vault.md", "root");
    node(fake, "Target");
    node(fake, "Target/Existing", 1);
    const incoming = node(fake, "Incoming", 99);
    const nodes = service(fake);
    const mode = nodes.setChildOrderMode("Target", "manual");
    const move = nodes.placeNode(incoming, { kind: "move-into", parentPath: "Target" });
    await mode;
    await move;
    fake.flushMetadata();

    expect(nodes.children("Target").map(({ basename }) => basename)).toEqual(["Existing", "Incoming"]);
    expect(nodes.children("Target").map(({ order }) => order)).toEqual([1024, 2048]);
  });

  it("appends consecutive new nodes in creation order while all rank caches lag", async () => {
    const fake = new FakeObsidian("Vault", { metadataUpdates: "deferred" });
    fake.addFile("Vault.md", content(["order=manual"]));
    const nodes = service(fake);
    for (const name of ["Zulu", "Alpha", "Beta"]) await nodes.createNode("", name);
    fake.flushMetadata();

    expect(nodes.children("").map(({ childPath }) => childPath)).toEqual(["Zulu", "Alpha", "Beta"]);
    expect(nodes.children("").map(({ order }) => order)).toEqual([1024, 2048, 3072]);
  });

  it("resolves the next explicit gap from the preceding placement's written ranks", async () => {
    const fake = new FakeObsidian("Vault", { metadataUpdates: "deferred" });
    fake.addFile("Vault.md", content(["order=manual"]));
    const a = node(fake, "A", 1024);
    node(fake, "B", 2048);
    const c = node(fake, "C", 3072);
    const nodes = service(fake);
    await nodes.placeNode(a, { kind: "insert", gap: { parentPath: "", previousSiblingPath: "C", nextSiblingPath: null } });
    await nodes.placeNode(c, { kind: "insert", gap: { parentPath: "", previousSiblingPath: "A", nextSiblingPath: null } });
    fake.flushMetadata();

    expect(nodes.children("").map(({ childPath }) => childPath)).toEqual(["B", "A", "C"]);
    expect(new Set(nodes.children("").map(({ order }) => order)).size).toBe(3);
  });

  it("uses a single supported editor's current mode and ranks without losing its body", async () => {
    const fake = new FakeObsidian("Vault", { metadataUpdates: "deferred" });
    const parent = fake.addFile("Vault.md", "disk root");
    const a = node(fake, "A", 1024);
    node(fake, "B", 2048);
    const aNote = fake.requireFile("A/A.md");
    const values = new Map([[parent, content(["order=manual"], "unsaved root")], [aNote, content(["rank=1024", "future=keep"], "unsaved A")]]);
    const leaves = [...values.keys()].map((file) => ({ view: {
      file,
      editor: {
        getValue: () => values.get(file)!,
        offsetToPos: (offset: number) => ({ line: 0, ch: offset }),
        transaction: (change: { changes: Array<{ text: string }> }) => { values.set(file, change.changes[0]!.text); },
      },
      requestSave: vi.fn(),
    } }));
    fake.app.workspace.getLeavesOfType = () => leaves as never;

    await service(fake).reorder(a, 1);
    expect(values.get(aNote)).toContain("rank=3072");
    expect(values.get(aNote)).toContain("unsaved A");
    expect(values.get(aNote)).toContain("future=keep");
    expect(values.get(parent)).toContain("unsaved root");
    expect(fake.contents.get(aNote.path)).toContain("rank=1024");
  });

  it("refuses ambiguous current mode bytes even when the cached mode is valid", async () => {
    const fake = new FakeObsidian("Vault", { metadataUpdates: "deferred" });
    const parent = fake.addFile("Vault.md", content(["order=manual"]));
    const a = node(fake, "A", 1024);
    node(fake, "B", 2048);
    await fake.app.vault.modify(parent, content(["order=manual", "order=unknown"]));
    const before = new Map(fake.contents);

    await expect(service(fake).reorder(a, 1)).rejects.toThrow(/ordering/u);
    expect(fake.contents).toEqual(before);
    expect(fake.renames).toEqual([]);
  });

  it("refuses an earlier dependency changed during a later source read before writing ranks", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md", content(["order=manual"]));
    const a = node(fake, "A", 1024);
    node(fake, "B", 2048);
    node(fake, "C", 3072);
    const b = fake.requireFile("B/B.md");
    const read = fake.app.vault.read.bind(fake.app.vault);
    let changed = false;
    fake.app.vault.read = async (file) => {
      const current = await read(file);
      if (file.path === "C/C.md" && !changed) {
        changed = true;
        await fake.app.vault.modify(b, content(["rank=8192"], "external edit"));
      }
      return current;
    };
    const process = vi.spyOn(fake.app.vault, "process");

    await expect(service(fake).reorder(a, 1)).rejects.toThrow(/changed/u);
    expect(process).not.toHaveBeenCalled();
    expect(fake.contents.get("A/A.md")).toContain("rank=1024");
    expect(fake.contents.get(b.path)).toContain("external edit");
    expect(fake.modifyListeners.size).toBe(0);
  });

  it.each(["prose", "rank"])("preserves a concurrent %s edit in the actual rank callback", async (change) => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md", content(["order=manual"]));
    const a = node(fake, "A", 1024);
    node(fake, "B", 2048);
    const process = fake.app.vault.process.bind(fake.app.vault);
    fake.app.vault.process = async (file, update) => {
      if (file.path === "A/A.md") fake.contents.set(file.path, content([change === "rank" ? "rank=8192" : "rank=1024", "future=keep"], "external prose"));
      return process(file, update);
    };

    const operation = service(fake).reorder(a, 1);
    if (change === "rank") await expect(operation).rejects.toThrow("Ordering source changed");
    else await operation;
    expect(fake.contents.get("A/A.md")).toContain(change === "rank" ? "rank=8192" : "rank=3072");
    expect(fake.contents.get("A/A.md")).toContain("external prose");
    expect(fake.contents.get("A/A.md")).toContain("future=keep");
    expect(fake.modifyListeners.size).toBe(0);
  });

  it("compensates its rank write if another dependency changes during the write", async () => {
    const fake = new FakeObsidian("Vault", { metadataUpdates: "deferred" });
    fake.addFile("Vault.md", content(["order=manual"]));
    const a = node(fake, "A", 1024);
    node(fake, "B", 2048);
    const b = fake.requireFile("B/B.md");
    const beforeA = fake.contents.get("A/A.md");
    const process = fake.app.vault.process.bind(fake.app.vault);
    let changed = false;
    fake.app.vault.process = async (file, update) => {
      const result = await process(file, update);
      if (file.path === "A/A.md" && !changed) {
        changed = true;
        await fake.app.vault.modify(b, content(["rank=8192"], "external edit"));
      }
      return result;
    };

    await expect(service(fake).reorder(a, 1)).rejects.toThrow("Ordering source changed");
    expect(fake.contents.get("A/A.md")).toBe(beforeA);
    expect(fake.contents.get(b.path)).toContain("rank=8192");
    expect(fake.contents.get(b.path)).toContain("external edit");
    expect(fake.modifyListeners.size).toBe(0);
  });

  it("retains host link rewrites in ordering dependencies during a normal move", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md", "root");
    fake.addFolder("Target");
    const parent = fake.addFile("Target/Target.md", content(["order=manual"], "[[Source/Source]]"));
    const source = node(fake, "Source", 99);
    node(fake, "Target/Existing", 1024);
    const rename = fake.app.fileManager.renameFile.bind(fake.app.fileManager);
    fake.app.fileManager.renameFile = async (file, path) => {
      await rename(file, path);
      if (file === source && path === "Target/Source") {
        await fake.app.vault.modify(parent, content(["order=manual"], "[[Target/Source/Source]]"));
      }
    };
    const nodes = service(fake);

    await nodes.placeNode(source, { kind: "move-into", parentPath: "Target" });
    expect(fake.contents.get(parent.path)).toContain("[[Target/Source/Source]]");
    expect(nodes.children("Target").map(({ basename }) => basename)).toEqual(["Existing", "Source"]);
    expect(nodes.children("Target").map(({ order }) => order)).toEqual([1024, 2048]);
    expect(fake.renames).toEqual([{ from: "Source", to: "Target/Source" }]);
    expect(fake.modifyListeners.size).toBe(0);
  });

  it("binds original note objects before awaiting later ordering sources", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md", content(["order=manual"]));
    const a = node(fake, "A", 1024);
    node(fake, "B", 2048);
    node(fake, "C", 3072);
    const originalB = fake.requireFile("B/B.md");
    const read = fake.app.vault.read.bind(fake.app.vault);
    let replaced = false;
    fake.app.vault.read = async (file) => {
      const current = await read(file);
      if (file.path === "C/C.md" && !replaced) {
        replaced = true;
        fake.remove(originalB.path);
        fake.addFile("B/B.md", content(["rank=2048"], "replacement"));
      }
      return current;
    };
    const process = vi.spyOn(fake.app.vault, "process");

    await expect(service(fake).reorder(a, 1)).rejects.toThrow("identity changed");
    expect(process).not.toHaveBeenCalled();
    expect(fake.contents.get("B/B.md")).toContain("replacement");
    expect(fake.modifyListeners.size).toBe(0);
  });

  it("reads only the affected parent and direct canonical children", async () => {
    const fake = new FakeObsidian();
    fake.addFolder("Parent");
    fake.addFile("Parent/Parent.md", content(["order=manual"]));
    const a = node(fake, "Parent/A", 1024);
    node(fake, "Parent/B", 2048);
    node(fake, "Other");
    fake.addFile("Other/unrelated.md", "unrelated body");
    const read = vi.spyOn(fake.app.vault, "read");
    const inventory = vi.spyOn(fake.app.vault, "getAllLoadedFiles");

    await service(fake).reorder(a, 1);
    expect(new Set(read.mock.calls.map(([file]) => file.path))).toEqual(new Set(["Parent/Parent.md", "Parent/A/A.md", "Parent/B/B.md"]));
    expect(inventory).not.toHaveBeenCalled();
    expect(fake.modifyListeners.size).toBe(0);
  });
});
