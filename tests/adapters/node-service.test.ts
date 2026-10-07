import { describe, expect, it, vi } from "vitest";
import { parseYaml } from "obsidian";

import { NodeService } from "../../src/adapters/node-service";
import { DEFAULT_SETTINGS } from "../../src/shared/settings";
import { FakeObsidian } from "../helpers/fake-obsidian";

function service(fake: FakeObsidian): NodeService {
  const settings = structuredClone(DEFAULT_SETTINGS);
  return new NodeService(fake.app, () => settings);
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function markdownEditorLeaf(file: ReturnType<FakeObsidian["requireFile"]>, initial: string) {
  let value = initial;
  const editor = {
    getValue: vi.fn(() => value),
    offsetToPos: vi.fn((offset: number) => ({ line: 0, ch: offset })),
    transaction: vi.fn((transaction: { changes: Array<{ text: string }> }) => {
      value = transaction.changes[0]?.text ?? value;
    }),
  };
  const requestSave = vi.fn();
  return {
    leaf: { view: { editor, file, requestSave } },
    requestSave,
    setValue(next: string) { value = next; },
    value: () => value,
  };
}

describe("NodeService structural safety", () => {
  it("uses only exact true hidden markers, inherits them, and lets unmanaged override visibility", () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    fake.addFolder("Parent");
    fake.addFile("Parent/Parent.md", "", { folderNodeHidden: true });
    fake.addFolder("Parent/Child");
    fake.addFile("Parent/Child/Child.md", "", { folderNodeHidden: "true" });
    fake.addFolder("StringValue");
    fake.addFile("StringValue/StringValue.md", "", { folderNodeHidden: "true" });
    const settings = structuredClone(DEFAULT_SETTINGS);
    const nodes = new NodeService(fake.app, () => settings);

    expect(nodes.hiddenState("Parent")).toMatchObject({ explicit: true, sourcePath: "Parent", unmanaged: false });
    expect(nodes.hiddenState("Parent/Child")).toMatchObject({ explicit: false, sourcePath: "Parent" });
    expect(nodes.hiddenState("StringValue").sourcePath).toBeNull();
    expect(nodes.isNodeVisible("Parent/Child")).toBe(false);
    settings.hiddenNodesEnabled = false;
    expect(nodes.isNodeVisible("Parent/Child")).toBe(true);
    settings.hiddenNodesEnabled = true;
    settings.ignoredFolders.push("Parent/Child");
    expect(nodes.hiddenState("Parent/Child").unmanaged).toBe(true);
    expect(nodes.isNodeVisible("Parent/Child")).toBe(true);
  });

  it("writes and removes the hidden marker only on complete managed non-root nodes", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    const folder = fake.addFolder("A");
    fake.addFile("A/A.md", "Body");
    const nodes = service(fake);

    await nodes.setNodeHidden(folder, true);
    expect(fake.frontmatters.get("A/A.md")?.["folder-nodes"]).toEqual(["hidden=true"]);
    await nodes.setNodeHidden(folder, false);
    expect(fake.frontmatters.get("A/A.md")).not.toHaveProperty("folder-nodes");
    await expect(nodes.setNodeHidden(fake.root, true)).rejects.toThrow("Root Node");
    const incomplete = fake.addFolder("Incomplete");
    await expect(nodes.setNodeHidden(incomplete, true)).rejects.toThrow("Missing canonical");
  });

  it("previews and explicitly migrates legacy properties without touching unrelated YAML", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    fake.addFolder("A");
    fake.addFile(
      "A/A.md",
      "---\n# keep\naliases: [A]\nfolder-nodes:\n  - future=yes\nfolderNodeChildrenSort: manual\nfolderNodeSiblingRank: 1024\nfolderNodeHidden: true\n---\nBody\n",
      {
        aliases: ["A"],
        "folder-nodes": ["future=yes"],
        folderNodeChildrenSort: "manual",
        folderNodeSiblingRank: 1024,
        folderNodeHidden: true,
      },
    );
    fake.addFile("Leaf.md", "---\nfolderNodeHidden: true\n---\nLeaf\n", { folderNodeHidden: true });
    const nodes = service(fake);

    const preview = await nodes.scanPropertiesAsync();
    expect(preview).toMatchObject({ scannedNotes: 3, canonicalPropertyNotes: 1, legacyPropertyNotes: 2 });
    expect(preview.changes.map(({ path }) => path)).toEqual(["A/A.md"]);
    expect(preview.nonCanonical.map(({ path }) => path)).toEqual(["Leaf.md"]);

    await nodes.migrateProperties(preview);
    expect(fake.contents.get("A/A.md")).toBe(
      "---\n# keep\naliases: [A]\nfolder-nodes:\n  - order=manual\n  - rank=1024\n  - hidden=true\n  - future=yes\n---\nBody\n",
    );
    expect(fake.contents.get("Leaf.md")).toContain("folderNodeHidden: true");
    expect((await nodes.scanPropertiesAsync()).changes).toEqual([]);
  });

  it("fails closed when property migration has conflicts or its preview becomes stale", async () => {
    const conflict = new FakeObsidian();
    conflict.addFile("Vault.md");
    conflict.addFolder("A");
    conflict.addFile(
      "A/A.md",
      "---\nfolder-nodes: [hidden=true]\nfolderNodeHidden: false\n---\nBody",
      { "folder-nodes": ["hidden=true"], folderNodeHidden: false },
    );
    const conflictNodes = service(conflict);
    const blocked = await conflictNodes.scanPropertiesAsync();
    expect(blocked.conflicts).toHaveLength(1);
    await expect(conflictNodes.migrateProperties(blocked)).rejects.toThrow("blocking conflicts");
    expect(conflict.contents.get("A/A.md")).toContain("folderNodeHidden: false");

    const stale = new FakeObsidian();
    stale.addFile("Vault.md");
    stale.addFolder("A");
    stale.addFile("A/A.md", "---\nfolderNodeHidden: true\n---\nBody", { folderNodeHidden: true });
    const staleNodes = service(stale);
    const preview = await staleNodes.scanPropertiesAsync();
    stale.contents.set("A/A.md", "---\nfolderNodeHidden: true\n---\nExternally changed");
    await expect(staleNodes.migrateProperties(preview)).rejects.toThrow("Vault changed after preview");
    expect(stale.contents.get("A/A.md")).toContain("folderNodeHidden: true");
  });
  it("uses natural order when stale sibling ranks exist under a natural parent", () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    fake.addFolder("B");
    fake.addFile("B/B.md", "", { folderNodeSiblingRank: 1 });
    fake.addFolder("A");
    fake.addFile("A/A.md", "", { folderNodeSiblingRank: 2048 });
    const nodes = service(fake);

    expect(nodes.children("").map(({ childPath }) => childPath)).toEqual(["A", "B"]);
    fake.frontmatters.set("Vault.md", { folderNodeChildrenSort: "manual" });
    expect(nodes.children("").map(({ childPath }) => childPath)).toEqual(["B", "A"]);
  });

  it("renames a complete node only through FileManager and preserves the invariant", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    const source = fake.addFolder("A");
    fake.addFile("A/A.md");

    const renamed = await service(fake).renameNode(source, "B");

    expect(renamed.path).toBe("B");
    expect(fake.requireFile("B/B.md").path).toBe("B/B.md");
    expect(fake.renames).toEqual([{ from: "A", to: "B" }, { from: "B/A.md", to: "B/B.md" }]);
  });

  it("renames an incomplete folder-side node without inventing a Node Note", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    const source = fake.addFolder("A");

    const renamed = await service(fake).renameNode(source, "B");

    expect(renamed.path).toBe("B");
    expect(fake.files.has("B/B.md")).toBe(false);
    expect(fake.renames).toEqual([{ from: "A", to: "B" }]);
  });

  it("revalidates mutable sources after asynchronous destination preflights", async () => {
    {
      const fake = new FakeObsidian();
      fake.addFile("Vault.md");
      const folder = fake.addFolder("A");
      fake.addFile("A/A.md");
      const nodes = service(fake);
      const entered = deferred();
      const release = deferred();
      fake.app.vault.adapter.exists = async (path: string) => {
        if (path === "B") {
          entered.resolve();
          await release.promise;
        }
        return fake.files.has(path);
      };

      const pending = nodes.renameNode(folder, "B");
      await entered.promise;
      await fake.rename(folder, "External");
      release.resolve();

      await expect(pending).rejects.toThrow("identity changed");
      expect(folder.path).toBe("External");
      expect(fake.files.has("B")).toBe(false);
    }

    {
      const fake = new FakeObsidian();
      fake.addFile("Vault.md");
      fake.addFolder("Parent");
      fake.addFile("Parent/Parent.md");
      fake.addFolder("Elsewhere");
      const child = fake.addFolder("Child");
      fake.addFile("Child/Child.md");
      const nodes = service(fake);
      const entered = deferred();
      const release = deferred();
      fake.app.vault.adapter.exists = async (path: string) => {
        if (path === "Parent/Child") {
          entered.resolve();
          await release.promise;
        }
        return fake.files.has(path);
      };

      const pending = nodes.moveNode(child, "Parent");
      await entered.promise;
      await fake.rename(child, "Elsewhere/Child");
      release.resolve();

      await expect(pending).rejects.toThrow("identity changed");
      expect(child.path).toBe("Elsewhere/Child");
      expect(fake.files.has("Parent/Child")).toBe(false);
    }

    {
      const fake = new FakeObsidian();
      fake.addFile("Vault.md");
      fake.addFolder("Elsewhere");
      const file = fake.addFile("Document.pdf", "body");
      const nodes = service(fake);
      const entered = deferred();
      const release = deferred();
      fake.app.vault.adapter.exists = async (path: string) => {
        if (path === "Renamed.pdf") {
          entered.resolve();
          await release.promise;
        }
        return fake.files.has(path);
      };

      const pending = nodes.renameFile(file, "Renamed.pdf");
      await entered.promise;
      await fake.rename(file, "Elsewhere/Document.pdf");
      release.resolve();

      await expect(pending).rejects.toThrow("identity changed");
      expect(file.path).toBe("Elsewhere/Document.pdf");
      expect(fake.files.has("Renamed.pdf")).toBe(false);
    }
  });

  it("supports case-only node and file renames on a case-insensitive adapter", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    const source = fake.addFolder("Alpha");
    fake.addFile("Alpha/Alpha.md");
    fake.addFile("Document.pdf");
    fake.app.vault.adapter.exists = async (path: string) =>
      [...fake.files.keys()].some((candidate) => candidate.toLocaleLowerCase() === path.toLocaleLowerCase());
    const nodes = service(fake);

    expect((await nodes.renameNode(source, "alpha")).path).toBe("alpha");
    expect(fake.requireFile("alpha/alpha.md")).toBeDefined();
    await nodes.renameFile(fake.requireFile("Document.pdf"), "document.pdf");
    expect(fake.requireFile("document.pdf")).toBeDefined();
    const mixed = fake.addFolder("Mixed");
    const mixedNote = fake.addFile("Mixed/mixed.md");
    expect(nodes.getCanonicalFile(mixed.path)).toBe(mixedNote);
    expect(await nodes.convertLeafNote(mixedNote)).toBe(mixedNote);
    await nodes.deleteFile(mixedNote);
    expect(fake.files.has("Mixed/mixed.md")).toBe(false);
  });

  it("rolls back only an unchanged newly created node after a later workflow failure", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    const nodes = service(fake);
    const note = await nodes.createNode("", "A", { body: "selected" });

    await nodes.rollbackCreatedNode(note);
    expect(fake.files.has("A")).toBe(false);
    expect(fake.files.has("A/A.md")).toBe(false);

    const changed = await nodes.createNode("", "B", { body: "selected" });
    await fake.app.vault.modify(changed, "external edit");
    await expect(nodes.rollbackCreatedNode(changed))
      .rejects.toThrow("concurrently modified created file");
    expect(fake.contents.get("B/B.md")).toBe("external edit");

    const occupied = await nodes.createNode("", "C", { body: "selected" });
    fake.addFile("C/external.md", "external");
    await expect(nodes.rollbackCreatedNode(occupied))
      .rejects.toThrow("changed created folder");
    expect(fake.requireFile("C/C.md")).toBe(occupied);
    expect(fake.requireFile("C/external.md")).toBeDefined();
  });

  it("rolls back its own manual rank without treating it as an external edit", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md", "---\nfolder-nodes:\n  - order=manual\n---\n", { "folder-nodes": ["order=manual"] });
    const nodes = service(fake);
    const note = await nodes.createNode("", "A", { body: "selected" });
    expect(fake.contents.get(note.path)).toContain("rank=1024");
    await nodes.rollbackCreatedNode(note);
    expect(fake.files.has("A")).toBe(false);
  });

  it("restores sibling ranks materialized by a compensated manual-order creation", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md", "---\nfolder-nodes:\n  - order=manual\n---\n", { "folder-nodes": ["order=manual"] });
    fake.addFolder("A");
    fake.addFile("A/A.md", "A body");
    fake.addFolder("B");
    fake.addFile("B/B.md", "B body");
    const nodes = service(fake);

    const created = await nodes.createNode("", "C", { body: "selected" });
    expect(fake.contents.get("A/A.md")).toContain("rank=1024");
    expect(fake.contents.get("B/B.md")).toContain("rank=2048");
    expect(fake.contents.get(created.path)).toContain("rank=3072");

    await nodes.rollbackCreatedNode(created);

    expect(fake.contents.get("A/A.md")).toBe("A body");
    expect(fake.contents.get("B/B.md")).toBe("B body");
    expect(fake.files.has("C")).toBe(false);
  });

  it("preserves externally moved creations and replacement objects at the original path", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    fake.addFolder("Elsewhere");
    const nodes = service(fake);
    const note = await nodes.createNode("", "A", { body: "selected" });
    await fake.rename(note.parent!, "Elsewhere/A");
    await expect(nodes.rollbackCreatedNode(note)).rejects.toThrow();
    expect(fake.requireFile("Elsewhere/A/A.md")).toBe(note);
    fake.addFolder("A");
    const replacement = fake.addFile("A/A.md", "replacement");
    await expect(nodes.rollbackCreatedNode(note)).rejects.toThrow();
    await expect(nodes.rollbackCreatedNode(replacement)).rejects.toThrow("creation receipt");
    expect(fake.contents.get("A/A.md")).toBe("replacement");
    expect(fake.trashed).toEqual([]);
  });

  it("does not reread a newly created Node Note before rollback registration", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    const originalRead = fake.app.vault.read;
    fake.app.vault.read = async (file) => {
      if (file.path === "A/A.md") throw new Error("unexpected create-time read");
      return originalRead(file);
    };

    const created = await service(fake).createNode("", "A", { body: "body" });

    expect(created.path).toBe("A/A.md");
    expect(fake.contents.get("A/A.md")).toBe("body");
  });

  it("rolls back a newly created folder when note creation fails", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    const originalCreate = fake.app.vault.create;
    fake.app.vault.create = async (path: string, source: string) => {
      if (path === "A/A.md") throw new Error("disk full");
      return originalCreate(path, source);
    };

    await expect(service(fake).createNode("", "A")).rejects.toThrow("disk full");
    expect(fake.files.has("A")).toBe(false);
    expect(fake.trashed).toContain("A");
  });

  it("creates every missing Node in an explicit unresolved-link path", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");

    const note = await service(fake).createNodePath("x/a", { alias: "b" });

    expect(note.path).toBe("x/a/a.md");
    expect(fake.requireFile("x/x.md")).toBeDefined();
    expect(fake.contents.get("x/a/a.md")).toBe("---\naliases:\n  - \"b\"\n---\n");
  });

  it("reuses a complete explicit-path ancestor without modifying it", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    fake.addFolder("x");
    fake.addFile("x/x.md", "existing");

    await service(fake).createNodePath("x/a");

    expect(fake.contents.get("x/x.md")).toBe("existing");
    expect(fake.contents.get("x/a/a.md")).toBe("");
  });

  it("rolls back every missing ancestor when explicit-path creation fails", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    const originalCreate = fake.app.vault.create;
    fake.app.vault.create = async (path: string, source: string) => {
      if (path === "x/a/a.md") throw new Error("disk full");
      return originalCreate(path, source);
    };

    await expect(service(fake).createNodePath("x/a")).rejects.toThrow("disk full");
    expect(fake.files.has("x")).toBe(false);
    expect(fake.files.has("x/a")).toBe(false);
  });

  it("keeps a deleted Root Node Note deleted", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md", "root body");
    fake.remove("Vault.md");

    await service(fake).reconcileDeleted("Vault.md");

    expect(fake.files.has("Vault.md")).toBe(false);
  });

  it("leaves the Vault root in place when the Root Node Note is natively renamed", async () => {
    const fake = new FakeObsidian();
    const note = fake.addFile("Vault.md", "root body");
    await fake.rename(note, "Home.md");

    await service(fake).reconcileRenamed(fake.requireFile("Home.md"), "Vault.md");

    expect(fake.app.vault.getRoot().path).toBe("");
    expect(fake.requireFile("Home.md")).toBe(note);
    expect(fake.renames).toEqual([{ from: "Vault.md", to: "Home.md" }]);
  });

  it("leaves the source folder incomplete and the moved Node Note noncanonical", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    const a = fake.addFolder("A");
    const note = fake.addFile("A/A.md", "body");
    fake.addFolder("B");
    fake.addFile("B/B.md");
    await fake.rename(note, "B/A.md");
    const moved = fake.requireFile("B/A.md");

    await service(fake).reconcileRenamed(moved, "A/A.md");

    expect(fake.files.has("A/A.md")).toBe(false);
    expect(fake.requireFile("B/A.md").path).toBe("B/A.md");
    expect(a.path).toBe("A");
  });

  it("rejects a stale migration preview before writing", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    const nodes = service(fake);
    const preview = nodes.scan();
    fake.addFile("Late.md", "late");

    await expect(nodes.migrate(preview)).rejects.toThrow("changed after preview");
    expect(fake.requireFile("Late.md").path).toBe("Late.md");
  });

  it("consumes expected internal events at the event boundary", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    await service(fake).createNode("", "A");
    const nodes = service(fake);
    await nodes.createNode("", "B");

    expect(nodes.consumeExpectedEvent("create", "B")).toBe(true);
    expect(nodes.consumeExpectedEvent("create", "B/B.md")).toBe(true);
    expect(nodes.consumeExpectedEvent("create", "B/B.md")).toBe(false);
  });

  it("renames the folder without creating a stray note when its canonical note is renamed in place", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    const folder = fake.addFolder("A");
    const note = fake.addFile("A/A.md", "body");
    await fake.rename(note, "A/B.md");

    await service(fake).reconcileRenamed(fake.requireFile("A/B.md"), "A/A.md");

    expect(folder.path).toBe("B");
    expect(fake.requireFile("B/B.md").path).toBe("B/B.md");
    expect(fake.files.has("B/A.md")).toBe(false);
  });

  it("fails closed when an external folder rename leaves two possible canonical notes", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    const folder = fake.addFolder("A");
    fake.addFile("A/A.md", "old");
    await fake.rename(folder, "B");
    fake.addFile("B/B.md", "new");

    await expect(service(fake).reconcileRenamed(fake.requireFolder("B"), "A")).rejects.toThrow("rename conflict");
    expect(fake.requireFile("B/A.md")).toBeDefined();
    expect(fake.requireFile("B/B.md")).toBeDefined();
  });

  it("keeps structure scans read-only", () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    fake.addFolder("A");
    fake.addFolder("A/C");
    fake.addFile("A/Leaf.md", "leaf");

    const scan = service(fake).scan();

    expect(fake.files.has("A/A.md")).toBe(false);
    expect(fake.files.has("A/C/C.md")).toBe(false);
    expect(fake.requireFile("A/Leaf.md")).toBeDefined();
    expect(scan.missingNodeNotes).toEqual(["A", "A/C"]);
    expect(scan.leafMarkdown).toEqual(["A/Leaf.md"]);
  });

  it("treats native folder and note creation as valid managed Vault state", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    fake.addFolder("FolderOnly");
    fake.addFile("Loose.md", "ordinary");
    const nodes = service(fake);

    await nodes.reconcileCreated("FolderOnly");
    await nodes.reconcileCreated("Loose.md");

    expect(fake.files.has("FolderOnly/FolderOnly.md")).toBe(false);
    expect(fake.requireFile("Loose.md")).toBeDefined();
    expect(nodes.scan().missingNodeNotes).toEqual(["FolderOnly"]);
    expect(nodes.scan().leafMarkdown).toEqual(["Loose.md"]);
  });

  it("rejects queued structural writes and rolls back an in-flight create after dispose", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    const nodes = service(fake);
    const originalCreateFolder = fake.app.vault.createFolder;
    let releaseCreate!: () => void;
    const createBlocked = new Promise<void>((resolve) => { releaseCreate = resolve; });
    let markFolderCreated!: () => void;
    const folderCreated = new Promise<void>((resolve) => { markFolderCreated = resolve; });
    fake.app.vault.createFolder = async (path: string) => {
      const folder = await originalCreateFolder(path);
      if (path === "A") {
        markFolderCreated();
        await createBlocked;
      }
      return folder;
    };

    const first = nodes.createNode("", "A");
    await folderCreated;
    const queued = nodes.createNode("", "B");
    nodes.dispose();
    releaseCreate();

    await expect(first).rejects.toThrow("service unloaded");
    await expect(queued).rejects.toThrow("service unloaded");
    expect(fake.files.has("A")).toBe(false);
    expect(fake.files.has("A/A.md")).toBe(false);
    expect(fake.files.has("B")).toBe(false);
    expect(fake.trashed).toContain("A");
  });

  it("rejects queued rename, move, merge and delete after disposal", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    const source = fake.addFolder("Source");
    fake.addFile("Source/Source.md", "keep source");
    const target = fake.addFolder("Target");
    fake.addFile("Target/Target.md", "keep target");
    const nodes = service(fake);
    const pending = [
      nodes.renameNode(source, "Renamed"),
      nodes.moveNode(source, "Target"),
      nodes.mergeNode(source, target),
      nodes.deleteNode(source),
    ];
    nodes.dispose();
    const results = await Promise.allSettled(pending);
    expect(results.every((result) => result.status === "rejected")).toBe(true);
    expect(fake.contents.get("Source/Source.md")).toBe("keep source");
    expect(fake.contents.get("Target/Target.md")).toBe("keep target");
    expect(fake.renames).toEqual([]);
    expect(fake.trashed).toEqual([]);
  });

  it("undoes an in-flight folder rename when disposal prevents the matching note rename", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    const folder = fake.addFolder("A");
    fake.addFile("A/A.md", "keep");
    const nodes = service(fake);
    const rename = fake.app.fileManager.renameFile;
    fake.app.fileManager.renameFile = async (entry, path) => {
      await rename(entry, path);
      if (path === "B") nodes.dispose();
    };
    await expect(nodes.renameNode(folder, "B")).rejects.toThrow("service unloaded");
    expect(fake.contents.get("A/A.md")).toBe("keep");
    expect(fake.files.has("B")).toBe(false);
  });

  it("rejects a migration disposed before its queued operation can write", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    fake.addFile("Leaf.md", "leaf");
    const nodes = service(fake);
    const preview = nodes.scan();

    nodes.dispose();

    await expect(nodes.migrate(preview)).rejects.toThrow("service unloaded");
    expect(fake.requireFile("Leaf.md")).toBeDefined();
    expect(fake.files.has("Leaf")).toBe(false);
    expect(fake.renames).toEqual([]);
  });

  it("keeps bulk organization previews read-only", () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    fake.addFile("First.md", "first");
    fake.addFile("Second.md", "second");
    const nodes = service(fake);
    const scan = nodes.scan();
    expect(fake.requireFile("First.md")).toBeDefined();
    expect(fake.requireFile("Second.md")).toBeDefined();
    expect(fake.files.has("First")).toBe(false);
    expect(fake.files.has("Second")).toBe(false);
    expect(fake.renames).toEqual([]);
    expect(scan.leafMarkdown).toEqual(["First.md", "Second.md"]);
  });

  it("rolls back moved merge entries when target writing fails", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    const source = fake.addFolder("Source");
    fake.addFile("Source/Source.md", "source body");
    fake.addFile("Source/asset.bin", "asset");
    const target = fake.addFolder("Target");
    fake.addFile("Target/Target.md", "target body");
    const originalProcess = fake.app.vault.process.bind(fake.app.vault);
    fake.app.vault.process = async (file, update) => {
      if (file.path === "Target/Target.md") throw new Error("write failed");
      return originalProcess(file, update);
    };

    await expect(service(fake).mergeNode(source, target)).rejects.toThrow("write failed");

    expect(fake.requireFile("Source/asset.bin")).toBeDefined();
    expect(fake.files.has("Target/asset.bin")).toBe(false);
    expect(fake.requireFolder("Source")).toBeDefined();
  });

  it("never overwrites a merge target changed before the first owned write", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    const source = fake.addFolder("Source");
    fake.addFile("Source/Source.md", "source body");
    fake.addFile("Source/asset.bin", "asset");
    const target = fake.addFolder("Target");
    fake.addFile("Target/Target.md", "target body");
    const originalProcess = fake.app.vault.process.bind(fake.app.vault);
    fake.app.vault.process = async (file, update) => {
      if (file.path === "Target/Target.md") {
        fake.contents.set(file.path, "concurrent edit");
        fake.frontmatters.set(file.path, {});
      }
      return originalProcess(file, update);
    };

    await expect(service(fake).mergeNode(source, target)).rejects.toThrow("target Node Note changed");
    expect(fake.contents.get("Target/Target.md")).toBe("concurrent edit");
    expect(fake.requireFile("Source/asset.bin")).toBeDefined();
  });

  it("rejects dirty source and target editors before a merge writes anything", async () => {
    for (const role of ["source", "target"] as const) {
      const fake = new FakeObsidian();
      fake.addFile("Vault.md");
      const source = fake.addFolder("Source");
      const sourceNote = fake.addFile("Source/Source.md", "source disk body");
      fake.addFile("Source/asset.bin", "asset");
      const target = fake.addFolder("Target");
      const targetNote = fake.addFile("Target/Target.md", "target disk body");
      const note = role === "source" ? sourceNote : targetNote;
      const open = markdownEditorLeaf(note, `${role} unsaved editor body`);
      fake.app.workspace.getLeavesOfType = vi.fn(() => [open.leaf] as never);

      await expect(service(fake).mergeNode(source, target)).rejects.toThrow(`${role} Node Note is open`);

      expect(fake.renames).toEqual([]);
      expect(fake.trashed).toEqual([]);
      expect(fake.contents.get("Source/Source.md")).toBe("source disk body");
      expect(fake.contents.get("Target/Target.md")).toBe("target disk body");
      expect(open.value()).toContain("unsaved editor body");
    }
  });

  it("rejects a merge when either Node Note is open in multiple editors", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    const source = fake.addFolder("Source");
    fake.addFile("Source/Source.md", "source body");
    const target = fake.addFolder("Target");
    const targetNote = fake.addFile("Target/Target.md", "target body");
    const first = markdownEditorLeaf(targetNote, "target body");
    const second = markdownEditorLeaf(targetNote, "target body");
    fake.app.workspace.getLeavesOfType = vi.fn(() => [first.leaf, second.leaf] as never);

    await expect(service(fake).mergeNode(source, target)).rejects.toThrow("multiple editors");
    expect(fake.renames).toEqual([]);
    expect(fake.trashed).toEqual([]);
  });

  it("preserves an external edit injected after the merge property write", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    const source = fake.addFolder("Source");
    fake.addFile("Source/Source.md", "---\ncategory: source\n---\nsource body", { category: "source" });
    fake.addFile("Source/asset.bin", "asset");
    const target = fake.addFolder("Target");
    fake.addFile("Target/Target.md", "---\ntitle: Target\n---\ntarget body", { title: "Target" });
    const originalProcess = fake.app.vault.process.bind(fake.app.vault);
    let targetWrites = 0;
    fake.app.vault.process = async (file, update) => {
      const published = await originalProcess(file, update);
      if (file.path === "Target/Target.md" && ++targetWrites === 1) {
        fake.contents.set(file.path, `${published}\nexternal after properties`);
        fake.frontmatters.set(file.path, { title: "Target", category: "source" });
      }
      return published;
    };

    await expect(service(fake).mergeNode(source, target)).rejects.toThrow("rollback was incomplete");

    expect(fake.contents.get("Target/Target.md")).toContain("external after properties");
    expect(fake.requireFile("Source/asset.bin")).toBeDefined();
    expect(fake.requireFolder("Source")).toBeDefined();
  });

  it("preserves an external edit injected after the merge body write", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    const source = fake.addFolder("Source");
    fake.addFile("Source/Source.md", "---\ncategory: source\n---\nsource body", { category: "source" });
    fake.addFile("Source/asset.bin", "asset");
    const target = fake.addFolder("Target");
    fake.addFile("Target/Target.md", "---\ntitle: Target\n---\ntarget body", { title: "Target" });
    const originalProcess = fake.app.vault.process.bind(fake.app.vault);
    let targetWrites = 0;
    fake.app.vault.process = async (file, update) => {
      const published = await originalProcess(file, update);
      if (file.path === "Target/Target.md" && ++targetWrites === 2) {
        fake.contents.set(file.path, `${published}\nexternal after body`);
      }
      return published;
    };

    await expect(service(fake).mergeNode(source, target)).rejects.toThrow("rollback was incomplete");

    expect(fake.contents.get("Target/Target.md")).toContain("external after body");
    expect(fake.requireFile("Source/asset.bin")).toBeDefined();
    expect(fake.requireFolder("Source")).toBeDefined();
  });

  it("rolls a merge back if the source Note changes before trash", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    const source = fake.addFolder("Source");
    const sourceNote = fake.addFile("Source/Source.md", "source body");
    fake.addFile("Source/asset.bin", "asset");
    const target = fake.addFolder("Target");
    fake.addFile("Target/Target.md", "target body");
    const originalProcess = fake.app.vault.process.bind(fake.app.vault);
    fake.app.vault.process = async (file, update) => {
      const published = await originalProcess(file, update);
      if (file.path === "Target/Target.md") {
        fake.contents.set(sourceNote.path, "source body\nexternal source edit");
      }
      return published;
    };

    await expect(service(fake).mergeNode(source, target)).rejects.toThrow("source Node Note changed");

    expect(fake.contents.get("Source/Source.md")).toContain("external source edit");
    expect(fake.contents.get("Target/Target.md")).toBe("target body");
    expect(fake.requireFile("Source/asset.bin")).toBeDefined();
    expect(fake.files.has("Source")).toBe(true);
  });

  it("rechecks source content after the final target validation before trash", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    const source = fake.addFolder("Source");
    const sourceNote = fake.addFile("Source/Source.md", "source body");
    fake.addFile("Source/asset.bin", "asset");
    const target = fake.addFolder("Target");
    fake.addFile("Target/Target.md", "target body");
    const originalRead = fake.app.vault.read.bind(fake.app.vault);
    let targetReads = 0;
    fake.app.vault.read = async (file) => {
      const content = await originalRead(file);
      if (file.path === "Target/Target.md" && ++targetReads === 5) {
        fake.contents.set(sourceNote.path, "source body\nlate source edit");
      }
      return content;
    };

    await expect(service(fake).mergeNode(source, target)).rejects.toThrow("source Node Note changed");

    expect(fake.contents.get("Source/Source.md")).toContain("late source edit");
    expect(fake.contents.get("Target/Target.md")).toBe("target body");
    expect(fake.requireFile("Source/asset.bin")).toBeDefined();
    expect(fake.files.has("Source")).toBe(true);
  });

  it("preserves a same-path source Note replacement before trash", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    const source = fake.addFolder("Source");
    const sourceNote = fake.addFile("Source/Source.md", "source body");
    fake.addFile("Source/asset.bin", "asset");
    const target = fake.addFolder("Target");
    fake.addFile("Target/Target.md", "target body");
    const originalProcess = fake.app.vault.process.bind(fake.app.vault);
    let replaced = false;
    fake.app.vault.process = async (file, update) => {
      const published = await originalProcess(file, update);
      if (!replaced && file.path === "Target/Target.md") {
        replaced = true;
        fake.remove(sourceNote.path);
        fake.addFile("Source/Source.md", "replacement source body");
      }
      return published;
    };

    await expect(service(fake).mergeNode(source, target)).rejects.toThrow("identity changed during operation");

    expect(fake.contents.get("Source/Source.md")).toBe("replacement source body");
    expect(fake.contents.get("Target/Target.md")).toBe("target body");
    expect(fake.requireFile("Source/asset.bin")).toBeDefined();
    expect(fake.files.has("Source")).toBe(true);
  });

  it("preserves a child added to the source while merge is in progress", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    const source = fake.addFolder("Source");
    fake.addFile("Source/Source.md", "source body");
    fake.addFile("Source/asset.bin", "asset");
    const target = fake.addFolder("Target");
    fake.addFile("Target/Target.md", "target body");
    const originalProcess = fake.app.vault.process.bind(fake.app.vault);
    let added = false;
    fake.app.vault.process = async (file, update) => {
      const published = await originalProcess(file, update);
      if (!added && file.path === "Target/Target.md") {
        added = true;
        fake.addFile("Source/new.bin", "concurrent child");
      }
      return published;
    };

    await expect(service(fake).mergeNode(source, target)).rejects.toThrow("source structure changed");

    expect(fake.requireFile("Source/new.bin")).toBeDefined();
    expect(fake.requireFile("Source/asset.bin")).toBeDefined();
    expect(fake.contents.get("Target/Target.md")).toBe("target body");
    expect(fake.files.has("Source")).toBe(true);
  });

  it("preserves typing that starts in the source editor while merge is in progress", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    const source = fake.addFolder("Source");
    const sourceNote = fake.addFile("Source/Source.md", "source body");
    fake.addFile("Source/asset.bin", "asset");
    const target = fake.addFolder("Target");
    fake.addFile("Target/Target.md", "target body");
    const typing = markdownEditorLeaf(sourceNote, "source body\nunsaved typing");
    let leaves: unknown[] = [];
    fake.app.workspace.getLeavesOfType = vi.fn(() => leaves as never);
    const originalProcess = fake.app.vault.process.bind(fake.app.vault);
    fake.app.vault.process = async (file, update) => {
      const published = await originalProcess(file, update);
      if (file.path === "Target/Target.md") leaves = [typing.leaf];
      return published;
    };

    await expect(service(fake).mergeNode(source, target)).rejects.toThrow("source Node Note is open");

    expect(typing.value()).toContain("unsaved typing");
    expect(fake.contents.get("Target/Target.md")).toBe("target body");
    expect(fake.requireFile("Source/asset.bin")).toBeDefined();
    expect(fake.files.has("Source")).toBe(true);
  });

  it.each([1, 2])("stops merge write %i after disposal while preserving rollback", async (stopAt) => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    const source = fake.addFolder("Source");
    fake.addFile("Source/Source.md", "---\ncategory: source\n---\nsource body");
    fake.addFile("Source/asset.bin", "asset");
    const target = fake.addFolder("Target");
    fake.addFile("Target/Target.md", "target body");
    const nodes = service(fake);
    const process = fake.app.vault.process.bind(fake.app.vault);
    const published: string[] = [];
    let calls = 0;
    fake.app.vault.process = async (file, update) => {
      if (++calls === stopAt) nodes.dispose();
      const result = await process(file, update);
      published.push(result);
      return result;
    };

    await expect(nodes.mergeNode(source, target)).rejects.toThrow("service unloaded");
    expect(published).toHaveLength(stopAt === 1 ? 0 : 2);
    expect(published.some((content) => content.includes("Merged from"))).toBe(false);
    expect(fake.contents.get("Target/Target.md")).toBe("target body");
    expect(fake.requireFile("Source/asset.bin")).toBeDefined();
    expect(fake.trashed).toEqual([]);
  });

  it.each(["edit", "replace", "open"])("preserves source when target changes during final source read: %s", async (change) => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    const source = fake.addFolder("Source");
    const sourceNote = fake.addFile("Source/Source.md", "source body");
    const target = fake.addFolder("Target");
    const targetNote = fake.addFile("Target/Target.md", "target body");
    const read = fake.app.vault.read.bind(fake.app.vault);
    let reads = 0;
    fake.app.vault.read = async (file) => {
      const content = await read(file);
      if (file === sourceNote && ++reads === 4) {
        if (change === "edit") await fake.app.vault.modify(targetNote, "external target edit");
        if (change === "replace") {
          fake.remove(targetNote.path);
          fake.addFile(targetNote.path, "external replacement");
        }
        if (change === "open") {
          const editor = markdownEditorLeaf(targetNote, "unsaved target edit");
          fake.app.workspace.getLeavesOfType = vi.fn(() => [editor.leaf] as never);
        }
      }
      return content;
    };
    await expect(service(fake).mergeNode(source, target)).rejects.toThrow();
    expect(fake.files.get(sourceNote.path)).toBe(sourceNote);
    expect(fake.trashed).toEqual([]);
    if (change === "edit") expect(fake.contents.get(targetNote.path)).toBe("external target edit");
    if (change === "replace") expect(fake.contents.get(targetNote.path)).toBe("external replacement");
    expect(fake.modifyListeners.size).toBe(0);
  });

  it.each(["Source/renamed.bin", "Elsewhere/b.bin"])("does not seize a pending child moved to %s", async (externalPath) => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    const source = fake.addFolder("Source");
    fake.addFile("Source/Source.md", "source");
    fake.addFile("Source/a.bin", "a");
    const pending = fake.addFile("Source/b.bin", "b");
    fake.addFolder("Elsewhere");
    const target = fake.addFolder("Target");
    fake.addFile("Target/Target.md", "target");
    const rename = fake.app.fileManager.renameFile.bind(fake.app.fileManager);
    fake.app.fileManager.renameFile = async (file, path) => {
      await rename(file, path);
      if (path === "Target/a.bin") await fake.rename(pending, externalPath);
    };
    await expect(service(fake).mergeNode(source, target)).rejects.toThrow();
    expect(fake.files.get(externalPath)).toBe(pending);
    expect(fake.files.has("Source/a.bin")).toBe(true);
    expect(fake.trashed).toEqual([]);
  });

  it("removes a source file BOM before appending plain Markdown", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    const source = fake.addFolder("Source");
    fake.addFile("Source/Source.md", "\uFEFF# Heading\r\nbody");
    const target = fake.addFolder("Target");
    fake.addFile("Target/Target.md", "target");
    await service(fake).mergeNode(source, target);
    expect(fake.contents.get("Target/Target.md")).toBe("target\n\n## Merged from Source\n\n# Heading\nbody");
    expect(fake.modifyListeners.size).toBe(0);
  });

  it.each(["{title: Target}", "title: Target\nnested:\n  values:\n    - one\n    - two"])("keeps merged YAML valid for %s", async (yaml) => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    const source = fake.addFolder("Source");
    fake.addFile("Source/Source.md", "\uFEFF---\r\ncategory: source\r\n---\r\n# Heading");
    const target = fake.addFolder("Target");
    fake.addFile("Target/Target.md", `---\n${yaml}\n---\ntarget`);
    await service(fake).mergeNode(source, target);
    const result = fake.contents.get("Target/Target.md") ?? "";
    expect(parseYaml(result.split("---")[1] ?? "")).toEqual({
      ...(parseYaml(yaml) as Record<string, unknown>), category: "source",
    });
    expect(result).toContain("## Merged from Source\n\n# Heading");
  });

  it("treats a dispatched source trash as committed even if unload follows", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    const source = fake.addFolder("Source");
    fake.addFile("Source/Source.md", "source");
    const target = fake.addFolder("Target");
    fake.addFile("Target/Target.md", "target");
    const nodes = service(fake);
    const trash = fake.app.fileManager.trashFile.bind(fake.app.fileManager);
    fake.app.fileManager.trashFile = async (file) => {
      nodes.dispose();
      await trash(file);
    };
    await nodes.mergeNode(source, target);
    expect(fake.files.has("Source")).toBe(false);
    expect(fake.contents.get("Target/Target.md")).toContain("Merged from Source\n\nsource");
    expect(fake.modifyListeners.size).toBe(0);
  });

  it("reports a non-Markdown file occupying a migration target folder path", () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    fake.addFile("Leaf", "binary");
    fake.addFile("Leaf.md", "leaf");

    expect(service(fake).scan().conflicts[0]?.reason).toContain("occupied by a file");
  });

  it("reports ambiguous case-only Root Node Notes instead of choosing one", () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    fake.addFile("vault.md");
    expect(service(fake).scan().conflicts[0]?.reason).toContain("Multiple Root Node Notes");
  });

  it("serializes competing creates and leaves exactly one complete node", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    const nodes = service(fake);

    const results = await Promise.allSettled([nodes.createNode("", "A"), nodes.createNode("", "A")]);

    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(1);
    expect(fake.requireFile("A/A.md")).toBeDefined();
  });

  it("opens and repairs missing node notes idempotently", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    const folder = fake.addFolder("A");
    const nodes = service(fake);
    const first = await nodes.createMissingNodeNote(folder);
    const second = await nodes.createMissingNodeNote(folder);
    await nodes.openFolderNode("A", true);
    expect(first).toBe(second);
    expect(fake.opened).toEqual(["A/A.md"]);
  });

  it("completes a folder with its matching leaf Markdown when available", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    const folder = fake.addFolder("A");
    const leaf = fake.addFile("A.md", "existing body");

    const completed = await service(fake).completeFolder(folder);

    expect(completed).toBe(leaf);
    expect(completed.path).toBe("A/A.md");
    expect(fake.contents.get("A/A.md")).toBe("existing body");
  });

  it("completes a folder from a case-only matching leaf without creating a second folder", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    const folder = fake.addFolder("A");
    const leaf = fake.addFile("a.md", "existing body");
    fake.app.vault.adapter.exists = async (path: string) =>
      [...fake.files.keys()].some((candidate) => candidate.toLocaleLowerCase() === path.toLocaleLowerCase());

    const completed = await service(fake).completeFolder(folder);

    expect(completed).toBe(leaf);
    expect(completed.path).toBe("A/A.md");
    expect(fake.files.has("a")).toBe(false);
  });

  it("converts and adopts leaf notes with link-safe renames", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    const leaf = fake.addFile("Leaf.md", "body");
    const nodes = service(fake);
    expect((await nodes.convertLeafNote(leaf)).path).toBe("Leaf/Leaf.md");
    const folder = fake.addFolder("Adopt");
    const candidate = fake.addFile("Adopt/candidate.md", "candidate");
    expect((await nodes.useAsNodeNote(folder, candidate)).path).toBe("Adopt/Adopt.md");
  });

  it("refuses menu reordering across a hidden adjacent sibling", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md", "---\nfolder-nodes:\n  - order=manual\n---\n", { "folder-nodes": ["order=manual"] });
    const a = fake.addFolder("A");
    fake.addFile("A/A.md", "---\nfolder-nodes:\n  - rank=1024\n---\n", { "folder-nodes": ["rank=1024"] });
    fake.addFolder("Hidden");
    fake.addFile("Hidden/Hidden.md", "---\nfolder-nodes:\n  - rank=2048\n  - hidden=true\n---\n", {
      "folder-nodes": ["rank=2048", "hidden=true"],
    });
    fake.addFolder("B");
    fake.addFile("B/B.md", "---\nfolder-nodes:\n  - rank=3072\n---\n", { "folder-nodes": ["rank=3072"] });
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.hiddenNodesEnabled = true;
    const nodes = new NodeService(fake.app, () => settings);

    expect(nodes.canReorder(a, 1)).toBe(false);
    await nodes.reorder(a, 1);

    expect(nodes.children("").map(({ childPath }) => childPath)).toEqual(["A", "Hidden", "B"]);
    expect(fake.frontmatters.get("A/A.md")?.["folder-nodes"]).toEqual(["rank=1024"]);
  });

  it("moves and reorders nodes with transactional structural metadata", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    fake.addFolder("Parent");
    fake.addFile("Parent/Parent.md");
    const a = fake.addFolder("A");
    fake.addFile("A/A.md");
    fake.addFolder("B");
    fake.addFile("B/B.md");
    const c = fake.addFolder("C");
    fake.addFile("C/C.md");
    const nodes = service(fake);
    expect((await nodes.moveNode(a, "Parent")).path).toBe("Parent/A");
    expect(nodes.sortMode("Parent")).toBe("natural");
    expect(fake.frontmatters.get("Parent/Parent.md")?.["folder-nodes"]).toBeUndefined();
    await nodes.setChildOrderMode("", "manual");
    await nodes.reorder(c, -1);
    expect(nodes.sortMode("")).toBe("manual");
    expect(nodes.children("")[0]?.childPath).toBe("C");
  });

  it("does not change sorting mode for a structural move into a natural parent", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    fake.addFolder("Parent");
    fake.addFile("Parent/Parent.md");
    const child = fake.addFolder("Child");
    fake.addFile("Child/Child.md", "", { "folder-nodes": ["rank=4096"] });
    const nodes = service(fake);

    await nodes.moveNode(child, "Parent");

    expect(child.path).toBe("Parent/Child");
    expect(nodes.sortMode("Parent")).toBe("natural");
    expect(fake.frontmatters.get("Parent/Parent.md")?.["folder-nodes"]).toBeUndefined();
  });

  it("requires an explicit manual mode before exact placement", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    const a = fake.addFolder("A");
    fake.addFile("A/A.md");
    const b = fake.addFolder("B");
    fake.addFile("B/B.md");
    const nodes = service(fake);
    const gap = { parentPath: "", previousSiblingPath: null, nextSiblingPath: "A" };

    expect(nodes.previewPlacement("B", { kind: "insert", gap }).kind).toBe("blocked");
    await nodes.setChildOrderMode("", "manual");
    expect(nodes.previewPlacement("B", { kind: "insert", gap }).kind).toBe("ready");
    await nodes.placeNode(b, { kind: "insert", gap });
    expect(nodes.children("").map(({ childPath }) => childPath).slice(0, 2)).toEqual(["B", "A"]);
    expect(nodes.canReorder(a, -1)).toBe(true);
  });

  it("treats moving into the current parent as a true no-op", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    const child = fake.addFolder("Child");
    fake.addFile("Child/Child.md");
    const rename = fake.app.fileManager.renameFile;
    const nodes = service(fake);

    expect(nodes.previewPlacement("Child", { kind: "move-into", parentPath: "" })).toEqual({ kind: "noop" });
    await nodes.moveNode(child, "");
    expect(fake.app.fileManager.renameFile).toBe(rename);
    expect(nodes.sortMode("")).toBe("natural");
  });

  it("merges a concurrent closed-file edit into structural metadata", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    fake.addFolder("Parent");
    fake.addFile("Parent/Parent.md", "---\ntitle: Parent\n---\nBody", { title: "Parent" });
    fake.addFolder("Child");
    fake.addFile("Child/Child.md", "# Child");
    const originalProcess = fake.app.vault.process.bind(fake.app.vault);
    let injected = false;
    fake.app.vault.process = async (file, update) => {
      if (!injected && file.path === "Parent/Parent.md") {
        injected = true;
        fake.contents.set(file.path, "---\ntitle: Parent\n---\nBody\nExternal edit");
      }
      return originalProcess(file, update);
    };

    await service(fake).setChildOrderMode("Parent", "manual");

    expect(fake.contents.get("Parent/Parent.md")).toContain("External edit");
    expect(fake.contents.get("Parent/Parent.md")).toContain(
      "folder-nodes:\n  - order=manual",
    );
  });

  it("updates an unsaved Markdown editor instead of stale Vault content", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    fake.addFolder("Parent");
    const parentNote = fake.addFile(
      "Parent/Parent.md",
      "---\ntitle: Parent\n---\nStale disk body",
      { title: "Parent" },
    );
    fake.addFolder("Child");
    fake.addFile("Child/Child.md", "# Child");
    let editorContent = "---\ntitle: Parent\n---\nUnsaved editor body";
    const editor = {
      getValue: vi.fn(() => editorContent),
      offsetToPos: vi.fn((offset: number) => ({ line: 0, ch: offset })),
      transaction: vi.fn((transaction: { changes: Array<{ text: string }> }) => {
        editorContent = transaction.changes[0]?.text ?? editorContent;
      }),
    };
    const requestSave = vi.fn();
    const leaf = {
      view: { editor, file: parentNote, requestSave },
    };
    fake.app.workspace.getLeavesOfType = vi.fn(() => [leaf] as never);

    await service(fake).setChildOrderMode("Parent", "manual");

    expect(editorContent).toContain("Unsaved editor body");
    expect(editorContent).toContain("folder-nodes:\n  - order=manual");
    expect(fake.contents.get("Parent/Parent.md")).not.toContain(
      "folder-nodes:",
    );
    expect(requestSave).toHaveBeenCalledOnce();
  });

  it("rejects a same-path file replacement before structural metadata commit", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    fake.addFolder("Parent");
    fake.addFile("Parent/Parent.md", "---\ntitle: Parent\n---\nOriginal", { title: "Parent" });
    fake.addFolder("Child");
    fake.addFile("Child/Child.md", "# Child");
    const originalProcess = fake.app.vault.process.bind(fake.app.vault);
    fake.app.vault.process = async (file, update) => {
      if (file.path === "Parent/Parent.md") {
        fake.remove(file.path);
        fake.addFile("Parent/Parent.md", "---\ntitle: Replacement\n---\nExternal", {
          title: "Replacement",
        });
      }
      return originalProcess(file, update);
    };

    await expect(service(fake).setChildOrderMode("Parent", "manual"))
      .rejects.toThrow("identity changed");
    expect(fake.contents.get("Parent/Parent.md")).toContain("External");
    expect(fake.files.has("Child")).toBe(true);
  });

  it("never rolls back a moved folder through a same-path replacement", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    fake.addFolder("Parent");
    fake.addFile("Parent/Parent.md", "", { folderNodeChildrenSort: "manual" });
    const child = fake.addFolder("Child");
    fake.addFile("Child/Child.md", "# Original child", { folderNodeSiblingRank: 1024 });
    const originalRename = fake.app.fileManager.renameFile.bind(fake.app.fileManager);
    fake.app.fileManager.renameFile = async (entry, nextPath) => {
      await originalRename(entry, nextPath);
      if (entry === child && nextPath === "Parent/Child") {
        fake.remove(nextPath);
        fake.addFolder(nextPath);
        fake.addFile("Parent/Child/Child.md", "# Replacement child");
      }
    };

    await expect(service(fake).moveNode(child, "Parent"))
      .rejects.toThrow("rollback was incomplete");
    expect(fake.contents.get("Parent/Child/Child.md")).toBe("# Replacement child");
    expect(fake.files.has("Child")).toBe(false);
  });

  it("moves and deletes a Node Note without deleting its containing folder", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    const folder = fake.addFolder("A");
    const canonical = fake.addFile("A/A.md");
    const ordinary = fake.addFile("A/data.pdf", "data");
    const nodes = service(fake);
    await nodes.moveFile(ordinary, "");
    await nodes.renameFile(fake.requireFile("data.pdf"), "renamed.pdf");
    await nodes.deleteFile(fake.requireFile("renamed.pdf"));
    expect(fake.files.has("renamed.pdf")).toBe(false);
    await nodes.moveFile(canonical, "");
    expect(fake.files.has("A/A.md")).toBe(false);
    expect(fake.requireFile("A.md")).toBe(canonical);
    await nodes.deleteFile(canonical);
    expect(fake.files.has("A.md")).toBe(false);
    expect(fake.requireFolder("A")).toBe(folder);
    await nodes.deleteNode(folder);
    expect(fake.files.has("A")).toBe(false);
  });

  it("merges compatible properties and content before trashing the source", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    const source = fake.addFolder("Source");
    fake.addFile(
      "Source/Source.md",
      "---\nnested: {\"b\":2,\"a\":1}\nsourceOnly: copied\nposition: manager\n---\nsource body",
      { nested: { b: 2, a: 1 }, sourceOnly: "copied", position: "manager" },
    );
    fake.addFile("Source/asset.bin", "asset");
    const target = fake.addFolder("Target");
    fake.addFile(
      "Target/Target.md",
      "---\nnested: {\"a\":1,\"b\":2}\n---\ntarget body",
      { nested: { a: 1, b: 2 } },
    );
    await service(fake).mergeNode(source, target);
    expect(fake.requireFile("Target/asset.bin")).toBeDefined();
    expect(parseYaml((fake.contents.get("Target/Target.md") ?? "").split("---")[1] ?? ""))
      .toMatchObject({ position: "manager", sourceOnly: "copied" });
    expect(fake.contents.get("Target/Target.md")).toContain("Merged from Source");
    expect(fake.files.has("Source")).toBe(false);
  });

  it("does not copy hidden state while merging nodes", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    const source = fake.addFolder("Source");
    fake.addFile(
      "Source/Source.md",
      "---\nfolderNodeHidden: true\n---\nsource body",
      { folderNodeHidden: true },
    );
    const target = fake.addFolder("Target");
    fake.addFile("Target/Target.md", "target body", {});

    await service(fake).mergeNode(source, target);

    expect(fake.frontmatters.get("Target/Target.md")).not.toHaveProperty("folderNodeHidden");
  });

  it("blocks merge property and path conflicts before writing", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    const source = fake.addFolder("Source");
    fake.addFile("Source/Source.md", "---\nstatus: source\n---\n", { status: "source" });
    fake.addFile("Source/same.bin");
    const target = fake.addFolder("Target");
    fake.addFile("Target/Target.md", "---\nstatus: target\n---\n", { status: "target" });
    fake.addFile("Target/same.bin");
    await expect(service(fake).mergeNode(source, target)).rejects.toThrow("Path already exists");
    fake.remove("Target/same.bin");
    await expect(service(fake).mergeNode(source, target)).rejects.toThrow("property conflict");
    expect(fake.requireFolder("Source")).toBeDefined();
  });

  it("commits a current migration preview and validates the result", async () => {
    const fake = new FakeObsidian();
    fake.addFolder("Folder");
    fake.addFile("Leaf.md", "leaf");
    const nodes = service(fake);
    const preview = nodes.scan();
    const progress: number[] = [];
    await nodes.migrate(preview, (completed) => progress.push(completed));
    expect(fake.requireFile("Vault.md")).toBeDefined();
    expect(fake.requireFile("Folder/Folder.md")).toBeDefined();
    expect(fake.requireFile("Leaf/Leaf.md")).toBeDefined();
    expect(progress.at(-1)).toBe(preview.leafMarkdown.length + preview.missingNodeNotes.length);
  });

  it("keeps a natively moved folder subtree and its notes unchanged", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    const ignored = fake.addFolder("_Archive");
    fake.addFolder("_Archive/Child");
    fake.addFile("_Archive/loose.md", "loose");
    await fake.rename(ignored, "Archive");
    await service(fake).reconcileRenamed(fake.requireFolder("Archive"), "_Archive");
    expect(fake.files.has("Archive/Archive.md")).toBe(false);
    expect(fake.files.has("Archive/Child/Child.md")).toBe(false);
    expect(fake.requireFile("Archive/loose.md")).toBeDefined();
  });

  it("assigns target-relative ranks to child nodes moved by merge into a manual parent", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    const source = fake.addFolder("Source");
    fake.addFile("Source/Source.md", "---\nfolder-nodes:\n  - order=manual\n---\n", { "folder-nodes": ["order=manual"] });
    fake.addFolder("Source/First");
    fake.addFile("Source/First/First.md", "---\nfolder-nodes:\n  - rank=1024\n---\n", { "folder-nodes": ["rank=1024"] });
    fake.addFolder("Source/Second");
    fake.addFile("Source/Second/Second.md", "---\nfolder-nodes:\n  - rank=2048\n---\n", { "folder-nodes": ["rank=2048"] });
    const target = fake.addFolder("Target");
    fake.addFile("Target/Target.md", "---\nfolder-nodes:\n  - order=manual\n---\n", { "folder-nodes": ["order=manual"] });
    fake.addFolder("Target/Existing");
    fake.addFile("Target/Existing/Existing.md", "---\nfolder-nodes:\n  - rank=1024\n---\n", { "folder-nodes": ["rank=1024"] });

    const nodes = service(fake);
    await nodes.mergeNode(source, target);

    expect(nodes.children("Target").map(({ childPath }) => childPath)).toEqual([
      "Target/Existing",
      "Target/First",
      "Target/Second",
    ]);
    expect(fake.frontmatters.get("Target/Existing/Existing.md")?.["folder-nodes"]).toEqual(["rank=1024"]);
    expect(fake.frontmatters.get("Target/First/First.md")?.["folder-nodes"]).toEqual(["rank=3072"]);
    expect(fake.frontmatters.get("Target/Second/Second.md")?.["folder-nodes"]).toEqual(["rank=4096"]);
  });

  it("assigns a fresh target-parent rank after a native cross-parent node move", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    fake.addFolder("Parent");
    fake.addFile("Parent/Parent.md", "", { folderNodeChildrenSort: "manual" });
    fake.addFolder("Parent/Existing");
    fake.addFile("Parent/Existing/Existing.md", "", { folderNodeSiblingRank: 4096 });
    const child = fake.addFolder("Child");
    fake.addFile("Child/Child.md", "", { folderNodeSiblingRank: 4096 });
    await fake.rename(child, "Parent/Child");

    await service(fake).reconcileRenamed(fake.requireFolder("Parent/Child"), "Child");

    expect(fake.frontmatters.get("Parent/Child/Child.md")?.["folder-nodes"]).toEqual(["rank=5120"]);
    expect(service(fake).children("Parent").map(({ childPath }) => childPath)).toEqual([
      "Parent/Existing",
      "Parent/Child",
    ]);
  });

  it("renames an existing Node Note but leaves an incomplete folder note-free", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    const stale = fake.addFolder("Old");
    fake.addFile("Old/Old.md");
    await fake.rename(stale, "New");
    const nodes = service(fake);
    await nodes.reconcileRenamed(fake.requireFolder("New"), "Old");
    expect(fake.requireFile("New/New.md")).toBeDefined();
    const empty = fake.addFolder("Before");
    await fake.rename(empty, "After");
    await nodes.reconcileRenamed(fake.requireFolder("After"), "Before");
    expect(fake.files.has("After/After.md")).toBe(false);
  });
});
