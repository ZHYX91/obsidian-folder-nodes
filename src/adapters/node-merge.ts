import { type App, type Editor, type WorkspaceLeaf, normalizePath, TAbstractFile, TFile, TFolder } from "obsidian";
import { FolderNodesError } from "../core/folder-nodes-error";
import { assertMergeLinksKeepDestinations, type MergeLinkResolver } from "../core/merge-link-safety";
import { compareChildren, naturalOrder, planAppendChildren } from "../core/ordering";
import { basename, dirname, isDescendantPath } from "../core/paths";
import type { ChildOrderRecord, OrderPatch } from "../core/types";
import {
  assertMergePropertyLinks, deepEqual, mergeFrontmatterProperties, readMergeFrontmatter,
  readOrderingProperties, stripMergeFrontmatter, STRUCTURAL_PROPERTIES,
} from "./node-merge-frontmatter";
import type { VaultEventKind } from "./vault-operation-coordinator";

type Undo = () => Promise<void>;

export interface OpenMarkdownTarget {
  readonly editor: Editor;
  readonly file: TFile;
  readonly leaf: WorkspaceLeaf;
  readonly requestSave: () => void;
}

interface MergeRankBinding {
  readonly file: TFile;
  readonly before: string;
  readonly after: string;
  readonly folder: string;
  readonly editor: OpenMarkdownTarget | null;
}

interface MergeHost {
  assertActive(): void;
  assertEntryIdentity<T extends TAbstractFile>(entry: T, path: string, kind: abstract new (...args: never[]) => T): void;
  assertAvailable(path: string): Promise<void>;
  childRecords(path: string): ChildOrderRecord[];
  getCanonicalFile(path: string): TFile | null;
  requireCanonicalNote(folder: TFolder): TFile;
  isIgnoredPath(path: string): boolean;
  expectEvent(kind: VaultEventKind, newPath: string, oldPath: string | null, recursive: boolean): void;
  readRankSource(file: TFile, path: string): Promise<{ source: string; editor: OpenMarkdownTarget | null }>;
  isSameOpenMarkdownTarget(target: OpenMarkdownTarget, file: TFile, path: string): boolean;
  applyRanks(patches: readonly OrderPatch[], undos: Undo[], sources: Map<TFile, string>): Promise<void>;
  rollback(undos: readonly Undo[], cause: unknown): Promise<never>;
}

export class NodeMerge {
  public constructor(private readonly app: App, private readonly host: MergeHost) {}

  public async run(source: TFolder, target: TFolder): Promise<void> {
    if (this.host.isIgnoredPath(source.path) || this.host.isIgnoredPath(target.path)) throw new FolderNodesError("unmanaged_merge", {}, "An unmanaged folder cannot be merged as a Folder Node");
    if (source.path === target.path || isDescendantPath(target.path, source.path)) throw new Error("A node cannot be merged into itself or a descendant");
    const sourcePath = source.path;
    const targetPath = target.path;
    const sourceNote = this.host.requireCanonicalNote(source);
    const targetNote = this.host.requireCanonicalNote(target);
    const sourceNotePath = sourceNote.path;
    const targetNotePath = targetNote.path;
    const initialSourceChildren = [...source.children];
    const initialTargetChildren = [...target.children];
    const movable = initialSourceChildren.filter((entry) => entry !== sourceNote).map((entry) => ({
      entry, path: entry.path, name: entry.name, parent: entry.parent,
    }));

    for (const entry of movable) await this.host.assertAvailable(normalizePath(`${targetPath}/${entry.name}`));
    const sourceSnapshot = await this.readClosedMergeNote(sourceNote, sourceNotePath, "source");
    const targetSnapshot = await this.readClosedMergeNote(targetNote, targetNotePath, "target");
    const sourceProperties = readMergeFrontmatter(sourceSnapshot, sourceNotePath);
    const targetWithProperties = mergeFrontmatterProperties(
      targetSnapshot,
      sourceProperties,
      targetNotePath,
    );
    const sourceBody = stripMergeFrontmatter(sourceSnapshot, sourceNotePath);
    const resolveLink: MergeLinkResolver = (path, from) => {
      const file = this.app.metadataCache.getFirstLinkpathDest(path, from);
      return file == null || this.app.vault.getAbstractFileByPath(normalizePath(file.path)) !== file ? null : { path: file.path, identity: file };
    };
    const movingFiles = this.app.vault.getAllLoadedFiles()
      .filter((file): file is TFile => file instanceof TFile && file !== sourceNote && file.path.startsWith(sourcePath + "/"))
      .map((file) => ({ from: file.path, to: targetPath + file.path.slice(sourcePath.length) }));
    const targetProperties = readMergeFrontmatter(targetSnapshot, targetNotePath);
    const mergeLinkChecks = [
      assertMergePropertyLinks(sourceProperties, sourceNotePath, targetNotePath, sourceNotePath, resolveLink, movingFiles, targetProperties),
      assertMergeLinksKeepDestinations(sourceBody, sourceNotePath, targetNotePath, sourceNotePath, resolveLink, movingFiles,
        stripMergeFrontmatter(targetSnapshot, targetNotePath)),
    ];
    const movingMarkdown = this.app.vault.getMarkdownFiles()
      .filter((file) => file !== sourceNote && file.path.startsWith(sourcePath + "/"))
      .map((file) => ({ file, from: file.path, to: targetPath + file.path.slice(sourcePath.length) }));
    const movingSources = new Map<TFile, string>();
    for (const entry of movingMarkdown) {
      const contents = await this.readClosedMergeNote(entry.file, entry.from, "source");
      movingSources.set(entry.file, contents);
      mergeLinkChecks.push(
        assertMergePropertyLinks(readMergeFrontmatter(contents, entry.from), entry.from, entry.to, sourceNotePath, resolveLink, movingFiles),
        assertMergeLinksKeepDestinations(stripMergeFrontmatter(contents, entry.from), entry.from, entry.to, sourceNotePath, resolveLink, movingFiles),
      );
    }

    const rankSources = new Map(movingSources);
    const rankBindings: MergeRankBinding[] = [];
    let mergeOrder: ReturnType<typeof planAppendChildren> | null = null;
    if (readOrderingProperties(targetSnapshot, targetNotePath, "order", "merge").order === "manual") {
      const sourceChildren = this.host.childRecords(sourcePath).map((child) => {
        const note = this.host.getCanonicalFile(child.childPath);
        const contents = note === null ? undefined : movingSources.get(note);
        if (note === null || contents === undefined) throw new Error(`Merge rank source changed: ${child.childPath}`);
        rankBindings.push({ file: note, before: note.path, after: targetPath + note.path.slice(sourcePath.length), folder: normalizePath(`${targetPath}/${basename(child.childPath)}`), editor: null });
        return { ...child, order: readOrderingProperties(contents, note.path, "rank", "merge").rank };
      });
      const sourceOrder = readOrderingProperties(sourceSnapshot, sourceNotePath, "order", "merge").order === "manual"
        ? sourceChildren.sort(compareChildren) : naturalOrder(sourceChildren);
      const targetChildren: ChildOrderRecord[] = [];
      for (const child of this.host.childRecords(targetPath).filter(({ childPath }) => childPath !== sourcePath)) {
        const note = this.host.getCanonicalFile(child.childPath);
        if (note === null) throw new Error(`Merge rank source changed: ${child.childPath}`);
        const path = note.path;
        const snapshot = await this.host.readRankSource(note, path);
        const contents = snapshot.source;
        rankSources.set(note, contents);
        rankBindings.push({ file: note, before: path, after: path, folder: child.childPath, editor: snapshot.editor });
        targetChildren.push({ ...child, order: readOrderingProperties(contents, path, "rank", "merge").rank });
      }
      mergeOrder = planAppendChildren(targetChildren, sourceOrder.map((child) => ({
        ...child, childPath: normalizePath(`${targetPath}/${basename(child.childPath)}`), order: null,
      })));
      const patchedFolders = new Set(mergeOrder.patches.map(({ childPath }) => childPath));
      for (const binding of rankBindings) {
        if (binding.editor !== null && patchedFolders.has(binding.folder)) this.assertMergeNoteClosed(binding.file, binding.before, "target");
      }
    }

    for (const binding of rankBindings) {
      await this.assertMergeRankSnapshot(binding, binding.before, rankSources.get(binding.file)!);
    }
    for (const entry of movingMarkdown) {
      await this.assertClosedMergeNoteSnapshot(entry.file, entry.from, "source", movingSources.get(entry.file)!);
    }
    await this.assertClosedMergeNoteSnapshot(sourceNote, sourceNotePath, "source", sourceSnapshot);
    await this.assertClosedMergeNoteSnapshot(targetNote, targetNotePath, "target", targetSnapshot);
    this.assertMergeStructure(source, sourcePath, initialSourceChildren);
    this.assertMergeStructure(target, targetPath, initialTargetChildren);
    for (const check of mergeLinkChecks) check("before");
    const undos: Undo[] = [];
    let latestTarget = targetSnapshot;
    try {
      for (const snapshot of movable) {
        this.host.assertActive();
        const { entry, path: sourceEntryPath, name, parent } = snapshot;
        this.host.assertEntryIdentity(entry, sourceEntryPath, entry instanceof TFolder ? TFolder : TFile);
        if (entry.name !== name || entry.parent !== parent || parent !== source) {
          throw new Error(`source child changed during merge: ${sourceEntryPath}`);
        }
        const destination = normalizePath(`${targetPath}/${name}`);
        this.host.expectEvent("rename", destination, sourceEntryPath, entry instanceof TFolder);
        await this.app.fileManager.renameFile(entry, destination);
        undos.push(async () => {
          this.host.assertEntryIdentity(
            entry,
            destination,
            entry instanceof TFolder ? TFolder : TFile,
          );
          this.host.expectEvent("rename", sourceEntryPath, destination, entry instanceof TFolder);
          await this.app.fileManager.renameFile(entry, sourceEntryPath);
        });
      }

      if (mergeOrder !== null) await this.host.applyRanks(mergeOrder.patches, undos, rankSources);

      await this.assertClosedMergeNoteSnapshot(sourceNote, sourceNotePath, "source", sourceSnapshot);
      await this.assertClosedMergeNoteSnapshot(targetNote, targetNotePath, "target", latestTarget);
      this.assertMergeStructure(source, sourcePath, [sourceNote]);
      this.host.assertEntryIdentity(target, targetPath, TFolder);

      if (targetWithProperties !== latestTarget) {
        const receipt = await this.applyClosedMergeFileChange(
          targetNote,
          targetNotePath,
          "target",
          (current) => {
            if (current !== latestTarget) {
              throw new Error(`target Node Note changed during merge: ${targetNotePath}`);
            }
            return targetWithProperties;
          },
        );
        this.pushExactMergeUndo(undos, targetNote, targetNotePath, receipt);
        latestTarget = receipt.after;
        await this.assertClosedMergeNoteSnapshot(targetNote, targetNotePath, "target", latestTarget);
      }

      if (/\S/u.test(sourceBody)) {
        const expectedBefore = latestTarget;
        const appended = `${expectedBefore}\n\n## Merged from ${source.name}\n\n${sourceBody}`;
        const receipt = await this.applyClosedMergeFileChange(
          targetNote,
          targetNotePath,
          "target",
          (current) => {
            if (current !== expectedBefore) {
              throw new Error(`target Node Note changed during merge: ${targetNotePath}`);
            }
            return appended;
          },
        );
        this.pushExactMergeUndo(undos, targetNote, targetNotePath, receipt);
        latestTarget = receipt.after;
        await this.assertClosedMergeNoteSnapshot(targetNote, targetNotePath, "target", latestTarget);
      }

      // Observe all checked notes across the final asynchronous reads. Finish
      // every await before the synchronous checks at the trash commit point.
      let notesChanged = false;
      const checkedNotes = new Set<TAbstractFile>([sourceNote, targetNote, ...movingMarkdown.map(({ file }) => file), ...rankBindings.map(({ file }) => file)]);
      const openRankBindings = new Map(rankBindings.filter(({ editor }) => editor !== null).map((binding) => [binding.file, binding]));
      const openRankChanges = new Map<TFile, number>();
      const modification = this.app.vault.on("modify", (file) => {
        if (file instanceof TFile && openRankBindings.has(file)) openRankChanges.set(file, (openRankChanges.get(file) ?? 0) + 1);
        else if (checkedNotes.has(file)) notesChanged = true;
      });
      try {
        this.host.assertEntryIdentity(target, targetPath, TFolder);
        await this.assertClosedMergeNoteSnapshot(targetNote, targetNotePath, "target", latestTarget);
        await this.assertClosedMergeNoteSnapshot(sourceNote, sourceNotePath, "source", sourceSnapshot);
        for (const binding of rankBindings) {
          await this.assertMergeRankSnapshot(binding, binding.after, rankSources.get(binding.file)!);
        }
        for (const entry of movingMarkdown) {
          const contents = await this.readClosedMergeNote(entry.file, entry.to, "source");
          const original = movingSources.get(entry.file)!;
          const properties = (source: string) => Object.fromEntries(Object.entries(readMergeFrontmatter(source, entry.to))
            .filter(([key]) => !STRUCTURAL_PROPERTIES.has(key)));
          if (stripMergeFrontmatter(contents, entry.to) !== stripMergeFrontmatter(original, entry.from)
            || !deepEqual(properties(contents), properties(original))) {
            throw new Error(`source Markdown changed during merge: ${entry.to}`);
          }
        }
        const verifiedRankSaves = await this.assertMergeRankSaves(openRankBindings, openRankChanges, rankSources);
        this.host.assertActive();
        this.host.assertEntryIdentity(target, targetPath, TFolder);
        this.host.assertEntryIdentity(targetNote, targetNotePath, TFile);
        this.assertMergeNoteClosed(targetNote, targetNotePath, "target");
        this.host.assertEntryIdentity(sourceNote, sourceNotePath, TFile);
        this.assertMergeNoteClosed(sourceNote, sourceNotePath, "source");
        this.assertMergeStructure(source, sourcePath, [sourceNote]);
        this.assertMergeStructure(target, targetPath, [...initialTargetChildren, ...movable.map(({ entry }) => entry)]);
        for (const binding of rankBindings) {
          this.assertMergeRankBinding(binding, binding.after, rankSources.get(binding.file)!);
          if (this.host.getCanonicalFile(binding.folder) !== binding.file) throw new Error(`Merge rank source changed: ${binding.folder}`);
        }
        for (const entry of movingMarkdown) {
          this.host.assertEntryIdentity(entry.file, entry.to, TFile);
          this.assertMergeNoteClosed(entry.file, entry.to, "source");
        }
        for (const check of mergeLinkChecks) check("after");
        if ([...openRankChanges].some(([file, version]) => verifiedRankSaves.get(file) !== version)) {
          throw new Error("Merge rank save changed after final validation");
        }
        if (notesChanged) throw new Error("Node Note changed during final merge validation");
        this.host.expectEvent("delete", sourcePath, null, true);
        await this.app.fileManager.trashFile(source);
      } finally {
        this.app.vault.offref(modification);
      }
    } catch (error) {
      await this.host.rollback(undos, error);
    }
  }

  private assertMergeRankBinding(binding: MergeRankBinding, path: string, expected: string): void {
    this.host.assertEntryIdentity(binding.file, path, TFile);
    if (this.host.getCanonicalFile(dirname(path)) !== binding.file) throw new Error(`Merge rank source changed: ${path}`);
    if (binding.editor === null) this.assertMergeNoteClosed(binding.file, path, "target");
    else {
      const editors = this.app.workspace.getLeavesOfType("markdown").filter((leaf) => {
        const view = leaf.view as typeof leaf.view & { file?: TFile | null; editor?: Editor };
        return view.file?.path === path && view.editor !== undefined;
      });
      if (editors.length !== 1 || editors[0] !== binding.editor.leaf
        || !this.host.isSameOpenMarkdownTarget(binding.editor, binding.file, path) || binding.editor.editor.getValue() !== expected) {
        throw new Error(`Merge rank editor changed: ${path}`);
      }
    }
  }

  private async assertMergeRankSaves(
    bindings: ReadonlyMap<TFile, MergeRankBinding>, changes: ReadonlyMap<TFile, number>, expected: ReadonlyMap<TFile, string>,
  ): Promise<ReadonlyMap<TFile, number>> {
    const verified = new Map<TFile, number>();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      for (const [file, version] of changes) {
        if (verified.get(file) === version) continue;
        const binding = bindings.get(file)!;
        const source = await this.app.vault.read(file);
        this.assertMergeRankBinding(binding, binding.after, expected.get(file)!);
        if (source !== expected.get(file)) throw new Error(`Merge rank save changed: ${binding.after}`);
        verified.set(file, version);
      }
      if ([...changes].every(([file, version]) => verified.get(file) === version)) return new Map(verified);
    }
    throw new Error("Merge rank saves did not settle during final validation");
  }

  private async assertMergeRankSnapshot(binding: MergeRankBinding, path: string, expected: string): Promise<void> {
    this.assertMergeRankBinding(binding, path, expected);
    if (binding.editor === null) await this.assertClosedMergeNoteSnapshot(binding.file, path, "target", expected);
  }

  private async readClosedMergeNote(
    file: TFile,
    path: string,
    role: "source" | "target",
  ): Promise<string> {
    this.host.assertEntryIdentity(file, path, TFile);
    this.assertMergeNoteClosed(file, path, role);
    const content = await this.app.vault.read(file);
    this.host.assertEntryIdentity(file, path, TFile);
    this.assertMergeNoteClosed(file, path, role);
    return content;
  }

  private async assertClosedMergeNoteSnapshot(
    file: TFile,
    path: string,
    role: "source" | "target",
    expected: string,
  ): Promise<void> {
    const current = await this.readClosedMergeNote(file, path, role);
    if (current !== expected) throw new Error(`${role} Node Note changed during merge: ${path}`);
  }

  public assertMergeNoteClosed(
    file: TFile,
    path: string,
    role: "source" | "target",
  ): void {
    const matching = this.app.workspace.getLeavesOfType("markdown").flatMap((leaf) => {
      const view = leaf.view as typeof leaf.view & { file?: TFile | null; editor?: Editor };
      return view.file?.path === path && view.editor !== undefined ? [view.file] : [];
    });
    if (matching.some((current) => current !== file)) {
      throw new Error(`Markdown file identity changed during merge: ${path}`);
    }
    if (matching.length > 1) {
      throw new FolderNodesError("merge_note_open", { path }, `Cannot merge while the ${role} Node Note is open in multiple editors: ${path}`);
    }
    if (matching.length === 1) {
      throw new FolderNodesError("merge_note_open", { path }, `Cannot merge while the ${role} Node Note is open in a Markdown editor: ${path}`);
    }
  }

  private assertMergeStructure(
    source: TFolder,
    sourcePath: string,
    expectedChildren: readonly TAbstractFile[],
  ): void {
    this.host.assertEntryIdentity(source, sourcePath, TFolder);
    if (
      source.children.length !== expectedChildren.length
      || expectedChildren.some((entry) => !source.children.includes(entry))
    ) {
      throw new Error(`source structure changed during merge: ${sourcePath}`);
    }
  }

  private async applyClosedMergeFileChange(
    file: TFile,
    path: string,
    role: "source" | "target",
    update: (current: string) => string,
    rollback = false,
  ): Promise<{ before: string; after: string }> {
    if (!rollback) this.host.assertActive();
    this.host.assertEntryIdentity(file, path, TFile);
    this.assertMergeNoteClosed(file, path, role);
    let before: string | undefined;
    let after: string | undefined;
    const published = await this.app.vault.process(file, (current) => {
      if (!rollback) this.host.assertActive();
      this.host.assertEntryIdentity(file, path, TFile);
      this.assertMergeNoteClosed(file, path, role);
      before = current;
      after = update(current);
      return after;
    });
    if (before === undefined || after === undefined || published !== after) {
      throw new Error(`Vault did not publish merge update: ${path}`);
    }
    return { before, after };
  }

  public pushExactMergeUndo(
    undos: Undo[],
    file: TFile,
    path: string,
    receipt: { before: string; after: string },
  ): void {
    if (receipt.before === receipt.after) return;
    undos.push(async () => {
      await this.applyClosedMergeFileChange(file, path, "target", (current) => {
        if (current !== receipt.after) {
          throw new Error(`Cannot safely roll back concurrently modified file: ${path}`);
        }
        return receipt.before;
      }, true);
    });
  }
}
