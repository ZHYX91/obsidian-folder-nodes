import { describe, expect, it, vi } from "vitest";

import { NodeService } from "../../src/adapters/node-service";
import { DEFAULT_SETTINGS } from "../../src/shared/settings";
import { FakeObsidian } from "../helpers/fake-obsidian";

function service(fake: FakeObsidian, state: "managed" | "unadopted" = "managed"): NodeService {
  const settings = structuredClone(DEFAULT_SETTINGS);
  settings.adoptionState = state;
  return new NodeService(fake.app, () => settings);
}

describe("NodeService structural safety", () => {
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
    await expect(nodes.deleteFile(mixedNote)).rejects.toThrow("canonical");
    expect(await nodes.convertLeafNote(mixedNote)).toBe(mixedNote);
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

  it("recreates a deleted Root Node Note", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md", "root body");
    fake.remove("Vault.md");

    await service(fake).reconcileDeleted("Vault.md");

    expect(fake.requireFile("Vault.md")).toBeDefined();
  });

  it("repairs the source and converts the destination after a canonical note is moved", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    const a = fake.addFolder("A");
    const note = fake.addFile("A/A.md", "body");
    fake.addFolder("B");
    fake.addFile("B/B.md");
    await fake.rename(note, "B/A.md");
    const moved = fake.requireFile("B/A.md");

    await service(fake).reconcileRenamed(moved, "A/A.md");

    expect(fake.requireFile("A/A.md")).toBeDefined();
    expect(fake.requireFile("B/A/A.md").path).toBe("B/A/A.md");
    expect(a.path).toBe("A");
  });

  it("rejects a stale migration preview before writing", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    const nodes = service(fake, "unadopted");
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

  it("repairs a complete managed subtree during startup reconciliation", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    fake.addFolder("A");
    fake.addFolder("A/C");
    fake.addFile("A/Leaf.md", "leaf");

    await service(fake).repairManagedVault();

    expect(fake.requireFile("A/A.md")).toBeDefined();
    expect(fake.requireFile("A/C/C.md")).toBeDefined();
    expect(fake.requireFile("A/Leaf/Leaf.md")).toBeDefined();
  });

  it("rejects a migration disposed before its queued operation can write", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    fake.addFile("Leaf.md", "leaf");
    const nodes = service(fake, "unadopted");
    const preview = nodes.scan();

    nodes.dispose();

    await expect(nodes.migrate(preview)).rejects.toThrow("service unloaded");
    expect(fake.requireFile("Leaf.md")).toBeDefined();
    expect(fake.files.has("Leaf")).toBe(false);
    expect(fake.renames).toEqual([]);
  });

  it("rolls back an active startup repair and starts no later writes after dispose", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    fake.addFile("First.md", "first");
    fake.addFile("Second.md", "second");
    const nodes = service(fake);
    const originalCreateFolder = fake.app.vault.createFolder;
    let markFirstStarted!: () => void;
    let releaseFirst!: () => void;
    const firstStarted = new Promise<void>((resolve) => { markFirstStarted = resolve; });
    const firstRelease = new Promise<void>((resolve) => { releaseFirst = resolve; });
    fake.app.vault.createFolder = vi.fn(async (path: string) => {
      if (path === "First") {
        markFirstStarted();
        await firstRelease;
      }
      return originalCreateFolder(path);
    });

    const repair = nodes.repairManagedVault();
    await firstStarted;
    nodes.dispose();
    releaseFirst();

    await expect(repair).rejects.toThrow("service unloaded");
    expect(fake.requireFile("First.md")).toBeDefined();
    expect(fake.requireFile("Second.md")).toBeDefined();
    expect(fake.files.has("First")).toBe(false);
    expect(fake.files.has("Second")).toBe(false);
    expect(fake.renames).toEqual([]);
  });

  it("rolls back moved merge entries when target writing fails", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    const source = fake.addFolder("Source");
    fake.addFile("Source/Source.md", "source body");
    fake.addFile("Source/asset.bin", "asset");
    const target = fake.addFolder("Target");
    fake.addFile("Target/Target.md", "target body");
    fake.app.vault.append = async () => { throw new Error("write failed"); };

    await expect(service(fake).mergeNode(source, target)).rejects.toThrow("write failed");

    expect(fake.requireFile("Source/asset.bin")).toBeDefined();
    expect(fake.files.has("Target/asset.bin")).toBe(false);
    expect(fake.requireFolder("Source")).toBeDefined();
  });

  it("never overwrites a concurrently changed merge target during rollback", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    const source = fake.addFolder("Source");
    fake.addFile("Source/Source.md", "source body");
    fake.addFile("Source/asset.bin", "asset");
    const target = fake.addFolder("Target");
    fake.addFile("Target/Target.md", "target body");
    fake.app.vault.append = async (file) => {
      fake.contents.set(file.path, "concurrent edit");
      throw new Error("write failed");
    };

    await expect(service(fake).mergeNode(source, target)).rejects.toThrow("rollback was incomplete");
    expect(fake.contents.get("Target/Target.md")).toBe("concurrent edit");
    expect(fake.requireFile("Source/asset.bin")).toBeDefined();
  });

  it("reports a non-Markdown file occupying a migration target folder path", () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    fake.addFile("Leaf", "binary");
    fake.addFile("Leaf.md", "leaf");

    expect(service(fake, "unadopted").scan().conflicts[0]?.reason).toContain("occupied by a file");
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
    expect((await nodes.placeNode(a, "Parent", 0)).path).toBe("Parent/A");
    expect(fake.frontmatters.get("Parent/Parent.md")?.folderNodeChildrenSort).toBe("manual");
    await nodes.reorder(c, -1);
    expect(nodes.sortMode("")).toBe("manual");
    expect(nodes.children("")[0]?.childPath).toBe("C");
  });

  it("merges a concurrent closed-file edit into structural metadata", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    fake.addFolder("Parent");
    fake.addFile("Parent/Parent.md", "---\ntitle: Parent\n---\nBody", { title: "Parent" });
    const child = fake.addFolder("Child");
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

    await service(fake).placeNode(child, "Parent", 0);

    expect(fake.contents.get("Parent/Parent.md")).toContain("External edit");
    expect(fake.contents.get("Parent/Parent.md")).toContain(
      "folderNodeChildrenSort: \"manual\"",
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
    const child = fake.addFolder("Child");
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

    await service(fake).placeNode(child, "Parent", 0);

    expect(editorContent).toContain("Unsaved editor body");
    expect(editorContent).toContain("folderNodeChildrenSort: \"manual\"");
    expect(fake.contents.get("Parent/Parent.md")).not.toContain(
      "folderNodeChildrenSort: manual",
    );
    expect(requestSave).toHaveBeenCalledOnce();
  });

  it("rejects a same-path file replacement before structural metadata commit", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    fake.addFolder("Parent");
    fake.addFile("Parent/Parent.md", "---\ntitle: Parent\n---\nOriginal", { title: "Parent" });
    const child = fake.addFolder("Child");
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

    await expect(service(fake).placeNode(child, "Parent", 0))
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

    await expect(service(fake).placeNode(child, "Parent", 0))
      .rejects.toThrow("rollback was incomplete");
    expect(fake.contents.get("Parent/Child/Child.md")).toBe("# Replacement child");
    expect(fake.files.has("Child")).toBe(false);
  });

  it("moves, renames, and deletes ordinary files while protecting canonical notes", async () => {
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
    await expect(nodes.moveFile(canonical, "")).rejects.toThrow("canonical");
    await expect(nodes.deleteFile(canonical)).rejects.toThrow("canonical");
    await nodes.deleteNode(folder);
    expect(fake.files.has("A")).toBe(false);
  });

  it("merges compatible properties and content before trashing the source", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    const source = fake.addFolder("Source");
    fake.addFile("Source/Source.md", "source body", { nested: { b: 2, a: 1 } });
    fake.addFile("Source/asset.bin", "asset");
    const target = fake.addFolder("Target");
    fake.addFile("Target/Target.md", "target body", { nested: { a: 1, b: 2 } });
    await service(fake).mergeNode(source, target);
    expect(fake.requireFile("Target/asset.bin")).toBeDefined();
    expect(fake.contents.get("Target/Target.md")).toContain("Merged from Source");
    expect(fake.files.has("Source")).toBe(false);
  });

  it("blocks merge property and path conflicts before writing", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    const source = fake.addFolder("Source");
    fake.addFile("Source/Source.md", "", { status: "source" });
    fake.addFile("Source/same.bin");
    const target = fake.addFolder("Target");
    fake.addFile("Target/Target.md", "", { status: "target" });
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
    const nodes = service(fake, "unadopted");
    const preview = nodes.scan();
    const progress: number[] = [];
    await nodes.migrate(preview, (completed) => progress.push(completed));
    expect(fake.requireFile("Vault.md")).toBeDefined();
    expect(fake.requireFile("Folder/Folder.md")).toBeDefined();
    expect(fake.requireFile("Leaf/Leaf.md")).toBeDefined();
    expect(progress.at(-1)).toBe(preview.leafMarkdown.length + preview.missingNodeNotes.length);
  });

  it("repairs an ignored folder subtree when it is moved into managed scope", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    const ignored = fake.addFolder("_Archive");
    fake.addFolder("_Archive/Child");
    fake.addFile("_Archive/loose.md", "loose");
    await fake.rename(ignored, "Archive");
    await service(fake).reconcileRenamed(fake.requireFolder("Archive"), "_Archive");
    expect(fake.requireFile("Archive/Archive.md")).toBeDefined();
    expect(fake.requireFile("Archive/Child/Child.md")).toBeDefined();
    expect(fake.requireFile("Archive/loose/loose.md")).toBeDefined();
  });

  it("repairs both stale and absent canonical notes after folder renames", async () => {
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
    expect(fake.requireFile("After/After.md")).toBeDefined();
  });
});
