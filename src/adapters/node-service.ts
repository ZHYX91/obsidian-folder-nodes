import {
  App,
  normalizePath,
  parseYaml,
  stringifyYaml,
  TAbstractFile,
  TFile,
  TFolder,
  type Editor,
  type WorkspaceLeaf,
} from "obsidian";

import { VaultOperationCoordinator, type VaultEventKind } from "./vault-operation-coordinator";
import { matchesFolderExemption, matchesLeafNoteExemption } from "../core/exemptions";
import { FolderNodesError } from "../core/folder-nodes-error";
import { classifyFileIdentity, classifyFolderIdentity, type FileIdentity, type FolderIdentity } from "../core/identity";
import { analyzeFolderNodesSource, createNodeDocument, patchFolderNodesFrontmatter, type FolderNodesFrontmatterPatch } from "../core/frontmatter";
import { scanMigration, scanMigrationAsync, type VaultInventory } from "../core/migration";
import { compareChildren, materializeManualOrder, naturalOrder, planInsert } from "../core/ordering";
import { basename, dirname, isCanonicalNodeNote, isDescendantPath, isSameVaultName, isSameVaultPath, nodeNotePath, normalizeVaultPath, sanitizeNodeName } from "../core/paths";
import { insertionIndex, type PlacementIntent, type PlacementPreview } from "../core/placement";
import {
  FOLDER_NODES_PROPERTY,
  ICON_PROPERTY,
  LEGACY_FOLDER_NODES_PROPERTIES,
  resolveFolderNodesProperties,
} from "../core/properties";
import type {
  ChildOrderRecord,
  FolderNodeHiddenState,
  FolderNodesSettings,
  MigrationScan,
  OrderPatch,
  PropertyHealthFinding,
  PropertyMigrationScan,
} from "../core/types";
import { editableVisualCandidates } from "../core/visual";

const STRUCTURAL_PROPERTIES = new Set([FOLDER_NODES_PROPERTY, ...LEGACY_FOLDER_NODES_PROPERTIES]);
type Undo = () => Promise<void>;

interface FileChangeReceipt {
  readonly after: string;
  readonly before: string;
  readonly file: TFile;
  readonly path: string;
}

interface OpenMarkdownTarget {
  readonly editor: Editor;
  readonly file: TFile;
  readonly leaf: WorkspaceLeaf;
  readonly requestSave: () => void;
}

export class NodeService {
  private readonly operations = new VaultOperationCoordinator();
  private readonly lifecycle = new AbortController();
  private readonly createdNodes = new WeakMap<TFile, {
    folder: TFolder;
    folderPath: string;
    notePath: string;
    initialContent: string;
    finalContent: string;
    orderReceipts: readonly FileChangeReceipt[];
  }>();

  public constructor(
    private readonly app: App,
    private readonly getSettings: () => FolderNodesSettings,
    private readonly getShowHiddenNodesThisSession: () => boolean = () => false,
  ) {}

  public dispose(): void {
    if (!this.lifecycle.signal.aborted) {
      this.lifecycle.abort(new Error("Folder Nodes service unloaded"));
    }
  }

  public rootNotePath(): string { return `${sanitizeNodeName(this.app.vault.getName())}.md`; }
  public notePathForFolder(folderPath: string): string {
    const normalized = normalizeVaultPath(folderPath);
    return normalized === "" ? this.rootNotePath() : nodeNotePath(normalized);
  }

  public getFolder(path: string): TFolder | null {
    const normalized = normalizeVaultPath(path);
    if (normalized === "") return this.app.vault.getRoot();
    const file = this.app.vault.getAbstractFileByPath(normalizePath(normalized));
    return file instanceof TFolder ? file : null;
  }

  public getFile(path: string): TFile | null {
    const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
    return file instanceof TFile ? file : null;
  }

  public getCanonicalFile(folderPath: string): TFile | null {
    const candidates = this.nodeNoteCandidates(folderPath);
    return candidates.length === 1 ? candidates[0] ?? null : null;
  }

  public nodeNoteCandidates(folderPath: string): TFile[] {
    return this.canonicalFiles(folderPath);
  }

  public nodeNoteRole(file: TFile): "unique" | "conflict" | "none" {
    if (!this.isCanonicalNameMatch(file) || file.parent === null) return "none";
    const candidates = this.canonicalFiles(file.parent.path);
    if (candidates.length === 1 && candidates[0] === file) return "unique";
    return candidates.includes(file) ? "conflict" : "none";
  }

  public isCanonicalFile(file: TFile): boolean {
    return this.nodeNoteRole(file) === "unique";
  }

  public folderForFile(file: TFile | null): TFolder | null { return file?.parent ?? null; }

  public folderIdentity(folderPath: string): FolderIdentity {
    const folder = this.getFolder(folderPath);
    if (folder === null) return "ordinary";
    return classifyFolderIdentity(
      this.isIgnoredPath(folder.path),
      this.isIgnoredRootPath(folder.path),
      this.nodeNoteCandidates(folder.path).length,
    );
  }

  public fileIdentity(file: TFile): FileIdentity {
    const parent = file.parent;
    if (parent === null) return "ordinary";
    const counterpartPath = parent.path === "" ? file.basename : `${parent.path}/${file.basename}`;
    const counterpart = this.getFolder(counterpartPath);
    return classifyFileIdentity({
      canonicalRole: this.nodeNoteRole(file),
      counterpartNodeExists: counterpart !== null && this.getCanonicalFile(counterpart.path) !== null,
      parentUnmanaged: this.isIgnoredPath(parent.path),
      leafExempt: this.isLeafNoteExempt(file.path),
      markdown: file.extension.toLocaleLowerCase() === "md",
    });
  }

  public async openFolderNode(folderPath: string, newLeaf = false): Promise<void> {
    const note = this.getCanonicalFile(folderPath);
    if (note !== null) await this.app.workspace.getLeaf(newLeaf).openFile(note);
  }

  public isIgnoredPath(path: string): boolean {
    const settings = this.getSettings();
    return matchesFolderExemption(path, [...settings.ignoredFolders, this.app.vault.configDir], settings.ignoredFolderPrefixes);
  }

  public isIgnoredRootPath(path: string): boolean {
    const normalized = normalizeVaultPath(path);
    return normalized !== "" && this.isIgnoredPath(normalized) && !this.isIgnoredPath(dirname(normalized));
  }

  public hiddenState(path: string): FolderNodeHiddenState {
    const normalized = normalizeVaultPath(path);
    const unmanaged = this.isIgnoredPath(normalized);
    let current = normalized;
    while (current !== "") {
      const note = this.getCanonicalFile(current);
      const hidden = note !== null && this.propertiesForNote(note).hidden;
      if (hidden) return { explicit: current === normalized, sourcePath: current, unmanaged };
      current = dirname(current);
    }
    return { explicit: false, sourcePath: null, unmanaged };
  }

  public isNodeVisible(path: string): boolean {
    const state = this.hiddenState(path);
    return state.unmanaged
      || !this.getSettings().hiddenNodesEnabled
      || this.getShowHiddenNodesThisSession()
      || state.sourcePath === null;
  }

  public revealingHiddenNodes(): boolean {
    return this.getSettings().hiddenNodesEnabled && this.getShowHiddenNodesThisSession();
  }

  public setNodeHidden(folder: TFolder, hidden: boolean): Promise<void> {
    return this.exclusive(async () => {
      const path = normalizeVaultPath(folder.path);
      if (path === "") throw new FolderNodesError("root_cannot_hide", {}, "The Root Node cannot be hidden");
      if (this.isIgnoredPath(path)) throw new FolderNodesError("folder_unmanaged", { path }, `Folder is unmanaged: ${path}`);
      const note = this.requireCanonicalNote(folder);
      const undos: Undo[] = [];
      try {
        await this.patchFolderNodesTransactional(note, { hidden: hidden ? true : null }, undos);
      } catch (error) {
        await this.rollback(undos, error);
      }
    });
  }

  public isLeafNoteExempt(path: string): boolean {
    const settings = this.getSettings();
    return matchesLeafNoteExemption(path, settings.leafNoteExemptions, settings.leafNotePrefixes);
  }

  public consumeExpectedEvent(kind: VaultEventKind, newPath: string, oldPath: string | null = null): boolean {
    return this.operations.consume(kind, newPath, oldPath);
  }

  public createNode(parentPath: string, rawName: string, options: { alias?: string; body?: string } = {}): Promise<TFile> {
    return this.exclusive(() => this.createNodeUnlocked(parentPath, rawName, options));
  }

  public createNodePath(nodePath: string, options: { alias?: string; body?: string } = {}): Promise<TFile> {
    return this.exclusive(() => this.createNodePathUnlocked(nodePath, options));
  }

  public rollbackCreatedNode(note: TFile): Promise<void> {
    return this.operations.run(async () => {
      const receipt = this.createdNodes.get(note);
      if (receipt === undefined) throw new Error("Cannot safely roll back a node without its creation receipt");
      const { folder, folderPath, notePath, initialContent, finalContent, orderReceipts } = receipt;
      const assertOwned = (): void => {
        this.assertEntryIdentity(folder, folderPath, TFolder);
        this.assertEntryIdentity(note, notePath, TFile);
        if (note.parent !== folder || this.getCanonicalFile(folderPath) !== note
          || folder.children.length !== 1 || folder.children[0] !== note) {
          throw new Error(`Cannot safely roll back changed created folder: ${folderPath}`);
        }
      };
      assertOwned();
      if (await this.readCurrentSource(note) !== finalContent) {
        throw new Error(`Cannot safely roll back concurrently modified created file: ${notePath}`);
      }
      for (const orderReceipt of [...orderReceipts].reverse()) {
        this.assertEntryIdentity(orderReceipt.file, orderReceipt.path, TFile);
        if (await this.readCurrentSource(orderReceipt.file) !== orderReceipt.after) {
          throw new Error(`Cannot safely roll back concurrently modified file: ${orderReceipt.path}`);
        }
      }
      assertOwned();
      for (const orderReceipt of [...orderReceipts].reverse()) {
        await this.restoreFileChange(orderReceipt);
      }
      assertOwned();
      await this.trashCreatedFile(note, notePath, initialContent);
      await this.trashCreatedFolder(folder, folderPath);
      this.createdNodes.delete(note);
    });
  }

  public createMissingNodeNote(folder: TFolder): Promise<TFile> {
    return this.exclusive(async () => {
      if (this.isIgnoredPath(folder.path)) throw new FolderNodesError("folder_unmanaged", { path: folder.path }, `Folder is unmanaged: ${folder.path}`);
      const notePath = this.notePathForFolder(folder.path);
      const existing = this.getCanonicalFile(folder.path);
      if (existing !== null) return existing;
      await this.assertAvailable(notePath);
      this.assertActive();
      this.expectEvent("create", notePath);
      return this.app.vault.create(notePath, "");
    });
  }

  public completeFolder(folder: TFolder): Promise<TFile> {
    return this.exclusive(async () => {
      if (this.isIgnoredPath(folder.path)) throw new FolderNodesError("folder_unmanaged", { path: folder.path }, `Folder is unmanaged: ${folder.path}`);
      const existing = this.getCanonicalFile(folder.path);
      if (existing !== null) return existing;
      const parent = folder.parent;
      const candidates = parent === null ? [] : parent.children.filter((entry): entry is TFile =>
        entry instanceof TFile &&
        entry.extension.toLocaleLowerCase() === "md" &&
        !this.isLeafNoteExempt(entry.path) &&
        isSameVaultName(entry.basename, folder.name));
      if (candidates.length > 1) throw new Error(`Multiple leaf Markdown candidates for folder: ${folder.path}`);
      const candidate = candidates[0];
      if (candidate !== undefined) return this.convertLeafNoteUnlocked(candidate);
      const notePath = this.notePathForFolder(folder.path);
      await this.assertAvailable(notePath);
      this.assertActive();
      this.expectEvent("create", notePath);
      return this.app.vault.create(notePath, "");
    });
  }

  public convertLeafNote(file: TFile): Promise<TFile> { return this.exclusive(() => this.convertLeafNoteUnlocked(file)); }

  public useAsNodeNote(folder: TFolder, file: TFile): Promise<TFile> {
    return this.exclusive(async () => {
      if (file.parent !== folder) throw new Error("The note is not inside the selected folder");
      if (this.isIgnoredPath(folder.path)) throw new FolderNodesError("folder_unmanaged", { path: folder.path }, `Folder is unmanaged: ${folder.path}`);
      const notePath = this.notePathForFolder(folder.path);
      if (await this.pathExists(notePath)) throw new Error(`Node Note already exists: ${notePath}`);
      this.assertActive();
      this.expectEvent("rename", notePath, file.path);
      await this.app.fileManager.renameFile(file, notePath);
      this.assertEntryIdentity(file, notePath, TFile);
      return file;
    });
  }

  public renameNode(folder: TFolder, rawName: string): Promise<TFolder> {
    return this.exclusive(async () => {
      if (this.isIgnoredPath(folder.path)) throw new FolderNodesError("folder_unmanaged", { path: folder.path }, `Folder is unmanaged: ${folder.path}`);
      const sourcePath = normalizeVaultPath(folder.path);
      if (sourcePath === "") throw new FolderNodesError("root_cannot_rename", {}, "The Root Node cannot be renamed");
      const noteCandidates = this.canonicalFiles(sourcePath);
      if (noteCandidates.length > 1) throw new FolderNodesError("multiple_canonical_notes", { path: sourcePath }, `Multiple canonical Node Notes: ${sourcePath}`);
      const note = noteCandidates[0] ?? null;
      const sourceNotePath = note?.path ?? null;
      const name = sanitizeNodeName(rawName);
      const oldName = folder.name;
      if (name === oldName) return folder;
      const parentPath = normalizeVaultPath(folder.parent?.path ?? "");
      const nextPath = normalizePath(parentPath === "" ? name : `${parentPath}/${name}`);
      const nextNotePath = `${nextPath}/${name}.md`;
      const conflictingNoteBeforeMove = `${sourcePath}/${name}.md`;
      await this.assertAvailable(nextPath, folder);
      if (note !== null && sourceNotePath !== null && conflictingNoteBeforeMove !== sourceNotePath) {
        await this.assertAvailable(conflictingNoteBeforeMove, note);
      }
      this.assertEntryIdentity(folder, sourcePath, TFolder);
      if (note !== null && sourceNotePath !== null) {
        this.assertEntryIdentity(note, sourceNotePath, TFile);
        if (note.parent !== folder) throw new Error(`Node Note source changed during operation: ${sourceNotePath}`);
      }

      const undos: Undo[] = [];
      try {
        this.assertActive();
        this.expectEvent("rename", nextPath, sourcePath, true);
        await this.app.fileManager.renameFile(folder, nextPath);
        undos.push(async () => {
          this.assertEntryIdentity(folder, nextPath, TFolder);
          this.expectEvent("rename", sourcePath, nextPath, true);
          await this.app.fileManager.renameFile(folder, sourcePath);
        });
        if (note === null) {
          this.assertEntryIdentity(folder, nextPath, TFolder);
          return folder;
        }
        const oldNoteAtNewLocation = note;
        this.assertEntryIdentity(oldNoteAtNewLocation, `${nextPath}/${oldName}.md`, TFile);
        const oldNotePathAtNewLocation = oldNoteAtNewLocation.path;
        this.assertActive();
        this.expectEvent("rename", nextNotePath, oldNoteAtNewLocation.path);
        await this.app.fileManager.renameFile(oldNoteAtNewLocation, nextNotePath);
        undos.push(async () => {
          this.assertEntryIdentity(oldNoteAtNewLocation, nextNotePath, TFile);
          this.expectEvent("rename", oldNotePathAtNewLocation, nextNotePath);
          await this.app.fileManager.renameFile(oldNoteAtNewLocation, oldNotePathAtNewLocation);
        });
        this.assertEntryIdentity(folder, nextPath, TFolder);
        this.assertEntryIdentity(oldNoteAtNewLocation, nextNotePath, TFile);
        return folder;
      } catch (error) {
        return this.rollback(undos, error);
      }
    });
  }

  public moveNode(folder: TFolder, targetParentPath: string): Promise<TFolder> {
    return this.placeNode(folder, { kind: "move-into", parentPath: targetParentPath });
  }

  public previewPlacement(sourcePath: string, intent: PlacementIntent): PlacementPreview {
    const source = this.getFolder(sourcePath);
    if (source === null) return { kind: "blocked", reason: `Unknown source node: ${sourcePath}` };
    try {
      const resolved = this.resolvePlacement(source, intent);
      return resolved === null ? { kind: "noop" } : { kind: "ready", intent: resolved.intent };
    } catch (error) {
      return { kind: "blocked", reason: error instanceof Error ? error.message : String(error) };
    }
  }

  public placeNode(folder: TFolder, intent: PlacementIntent): Promise<TFolder> {
    return this.exclusive(() => this.placeNodeUnlocked(folder, intent));
  }

  public setChildOrderMode(parentPath: string, mode: "natural" | "manual"): Promise<void> {
    return this.exclusive(async () => {
      parentPath = normalizeVaultPath(parentPath);
      if (this.sortMode(parentPath) === mode) return;
      const parentNote = this.getCanonicalFile(parentPath);
      if (parentNote === null) throw new FolderNodesError("complete_parent_required", {}, "A complete parent Node is required to change child ordering");
      const undos: Undo[] = [];
      try {
        if (mode === "natural") {
          await this.patchFolderNodesTransactional(parentNote, { order: null }, undos);
          return;
        }
        const ordered = naturalOrder(this.childRecords(parentPath));
        await this.patchFolderNodesTransactional(parentNote, { order: "manual" }, undos);
        await this.applyOrderPatches(materializeManualOrder(ordered).patches, null, undos);
      } catch (error) {
        await this.rollback(undos, error);
      }
    });
  }

  public deleteNode(folder: TFolder): Promise<void> {
    return this.exclusive(async () => {
      if (this.isIgnoredPath(folder.path)) throw new FolderNodesError("folder_unmanaged", { path: folder.path }, `Folder is unmanaged: ${folder.path}`);
      if (normalizeVaultPath(folder.path) === "") throw new FolderNodesError("root_cannot_delete", {}, "The Root Node cannot be deleted");
      this.assertActive();
      this.expectEvent("delete", folder.path, null, true);
      await this.app.fileManager.trashFile(folder);
    });
  }

  public moveFile(file: TFile, targetFolderPath: string): Promise<void> {
    return this.exclusive(async () => {
      const sourcePath = file.path;
      targetFolderPath = normalizeVaultPath(targetFolderPath);
      const target = targetFolderPath === "" ? this.app.vault.getRoot() : this.getFolder(targetFolderPath);
      if (target === null) throw new Error(`Unknown target folder: ${targetFolderPath}`);
      const normalizedTarget = normalizeVaultPath(target.path);
      const nextPath = normalizePath(normalizedTarget === "" ? file.name : `${normalizedTarget}/${file.name}`);
      if (nextPath === sourcePath) return;
      await this.assertAvailable(nextPath, file);
      this.assertEntryIdentity(file, sourcePath, TFile);
      if (normalizedTarget !== "") this.assertEntryIdentity(target, normalizedTarget, TFolder);
      this.assertActive();
      this.expectEvent("rename", nextPath, sourcePath);
      await this.app.fileManager.renameFile(file, nextPath);
    });
  }

  public renameFile(file: TFile, rawName: string): Promise<void> {
    return this.exclusive(async () => {
      const sourcePath = file.path;
      const name = validateFileName(rawName);
      const parentPath = normalizeVaultPath(file.parent?.path ?? "");
      const nextPath = normalizePath(parentPath === "" ? name : `${parentPath}/${name}`);
      if (nextPath === sourcePath) return;
      await this.assertAvailable(nextPath, file);
      this.assertEntryIdentity(file, sourcePath, TFile);
      this.assertActive();
      this.expectEvent("rename", nextPath, sourcePath);
      await this.app.fileManager.renameFile(file, nextPath);
    });
  }

  public deleteFile(file: TFile): Promise<void> {
    return this.exclusive(async () => {
      this.assertActive();
      this.expectEvent("delete", file.path);
      await this.app.fileManager.trashFile(file);
    });
  }

  public mergeNode(source: TFolder, target: TFolder): Promise<void> {
    return this.exclusive(async () => {
      if (this.isIgnoredPath(source.path) || this.isIgnoredPath(target.path)) throw new FolderNodesError("unmanaged_merge", {}, "An unmanaged folder cannot be merged as a Folder Node");
      if (source.path === target.path || isDescendantPath(target.path, source.path)) throw new Error("A node cannot be merged into itself or a descendant");
      const sourcePath = source.path;
      const targetPath = target.path;
      const sourceNote = this.requireCanonicalNote(source);
      const targetNote = this.requireCanonicalNote(target);
      const sourceNotePath = sourceNote.path;
      const targetNotePath = targetNote.path;
      const initialSourceChildren = [...source.children];
      const movable = initialSourceChildren.filter((entry) => entry !== sourceNote).map((entry) => ({
        entry, path: entry.path, name: entry.name, parent: entry.parent,
      }));

      for (const entry of movable) await this.assertAvailable(normalizePath(`${targetPath}/${entry.name}`));
      const sourceSnapshot = await this.readClosedMergeNote(sourceNote, sourceNotePath, "source");
      const targetSnapshot = await this.readClosedMergeNote(targetNote, targetNotePath, "target");
      const sourceProperties = readMergeFrontmatter(sourceSnapshot, sourceNotePath);
      const targetWithProperties = mergeFrontmatterProperties(
        targetSnapshot,
        sourceProperties,
        targetNotePath,
      );
      const sourceBody = stripMergeFrontmatter(sourceSnapshot, sourceNotePath);

      await this.assertClosedMergeNoteSnapshot(sourceNote, sourceNotePath, "source", sourceSnapshot);
      await this.assertClosedMergeNoteSnapshot(targetNote, targetNotePath, "target", targetSnapshot);
      this.assertMergeStructure(source, sourcePath, initialSourceChildren);
      this.assertEntryIdentity(target, targetPath, TFolder);

      const movedNodeOrder = this.children(sourcePath);
      const undos: Undo[] = [];
      let latestTarget = targetSnapshot;
      try {
        for (const snapshot of movable) {
          this.assertActive();
          const { entry, path: sourceEntryPath, name, parent } = snapshot;
          this.assertEntryIdentity(entry, sourceEntryPath, entry instanceof TFolder ? TFolder : TFile);
          if (entry.name !== name || entry.parent !== parent || parent !== source) {
            throw new Error(`source child changed during merge: ${sourceEntryPath}`);
          }
          const destination = normalizePath(`${targetPath}/${name}`);
          this.expectEvent("rename", destination, sourceEntryPath, entry instanceof TFolder);
          await this.app.fileManager.renameFile(entry, destination);
          undos.push(async () => {
            this.assertEntryIdentity(
              entry,
              destination,
              entry instanceof TFolder ? TFolder : TFile,
            );
            this.expectEvent("rename", sourceEntryPath, destination, entry instanceof TFolder);
            await this.app.fileManager.renameFile(entry, sourceEntryPath);
          });
        }

        for (const child of movedNodeOrder) {
          const destination = normalizePath(`${targetPath}/${basename(child.childPath)}`);
          const note = this.getCanonicalFile(destination);
          if (note !== null) await this.appendRankIfManual(targetPath, note, undos);
        }

        await this.assertClosedMergeNoteSnapshot(sourceNote, sourceNotePath, "source", sourceSnapshot);
        await this.assertClosedMergeNoteSnapshot(targetNote, targetNotePath, "target", latestTarget);
        this.assertMergeStructure(source, sourcePath, [sourceNote]);
        this.assertEntryIdentity(target, targetPath, TFolder);

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

        // Observe both notes across the final asynchronous reads, so checking one
        // cannot silently invalidate the other. Trash dispatch is the commit point.
        let notesChanged = false;
        const modification = this.app.vault.on("modify", (file) => {
          if (file === sourceNote || file === targetNote) notesChanged = true;
        });
        try {
          this.assertEntryIdentity(target, targetPath, TFolder);
          await this.assertClosedMergeNoteSnapshot(targetNote, targetNotePath, "target", latestTarget);
          await this.assertClosedMergeNoteSnapshot(sourceNote, sourceNotePath, "source", sourceSnapshot);
          this.assertActive();
          this.assertEntryIdentity(target, targetPath, TFolder);
          this.assertEntryIdentity(targetNote, targetNotePath, TFile);
          this.assertMergeNoteClosed(targetNote, targetNotePath, "target");
          this.assertEntryIdentity(sourceNote, sourceNotePath, TFile);
          this.assertMergeNoteClosed(sourceNote, sourceNotePath, "source");
          this.assertMergeStructure(source, sourcePath, [sourceNote]);
          if (notesChanged) throw new Error("Node Note changed during final merge validation");
          this.expectEvent("delete", sourcePath, null, true);
          await this.app.fileManager.trashFile(source);
        } finally {
          this.app.vault.offref(modification);
        }
      } catch (error) {
        await this.rollback(undos, error);
      }
    });
  }

  public inventory(): VaultInventory {
    const folders: string[] = [];
    const markdown: string[] = [];
    const files: string[] = [];
    for (const file of this.app.vault.getAllLoadedFiles()) {
      if (file.path === this.app.vault.configDir || file.path.startsWith(`${this.app.vault.configDir}/`)) continue;
      if (file instanceof TFolder && normalizeVaultPath(file.path) !== "") folders.push(normalizeVaultPath(file.path));
      if (file instanceof TFile) {
        files.push(file.path);
        if (file.extension.toLocaleLowerCase() === "md" && !(normalizeVaultPath(file.parent?.path ?? "") === "" && this.isCanonicalFile(file))) markdown.push(file.path);
      }
    }
    return { files, folders, markdown };
  }

  public scan(): MigrationScan {
    const result = scanMigration(this.inventory(), {
      folders: this.getSettings().ignoredFolders,
      folderPrefixes: this.getSettings().ignoredFolderPrefixes,
      leafMarkdown: this.getSettings().leafNoteExemptions,
      leafMarkdownPrefixes: this.getSettings().leafNotePrefixes,
    });
    const rootCandidates = this.canonicalFiles("");
    if (rootCandidates.length > 1) {
      return {
        ...result,
        conflicts: [{ path: "", reason: `Multiple Root Node Notes: ${rootCandidates.map(({ path }) => path).join(", ")}` }, ...result.conflicts],
      };
    }
    if (rootCandidates.length === 0) {
      return { ...result, missingNodeNotes: ["", ...result.missingNodeNotes] };
    }
    return result;
  }

  public async scanAsync(onProgress?: (completed: number, total: number) => void, externalSignal?: AbortSignal): Promise<MigrationScan> {
    const signal = externalSignal === undefined ? this.lifecycle.signal : AbortSignal.any([this.lifecycle.signal, externalSignal]);
    throwIfAborted(signal);
    const result = await scanMigrationAsync(this.inventory(), {
      folders: this.getSettings().ignoredFolders,
      folderPrefixes: this.getSettings().ignoredFolderPrefixes,
      leafMarkdown: this.getSettings().leafNoteExemptions,
      leafMarkdownPrefixes: this.getSettings().leafNotePrefixes,
    }, onProgress, signal);
    throwIfAborted(signal);
    const rootCandidates = this.canonicalFiles("");
    if (rootCandidates.length > 1) {
      return {
        ...result,
        conflicts: [{ path: "", reason: `Multiple Root Node Notes: ${rootCandidates.map(({ path }) => path).join(", ")}` }, ...result.conflicts],
      };
    }
    return rootCandidates.length === 0 ? { ...result, missingNodeNotes: ["", ...result.missingNodeNotes] } : result;
  }

  public migrate(expected: MigrationScan, onStep?: (completed: number, total: number) => void): Promise<void> {
    const signal = this.lifecycle.signal;
    return this.exclusive(async () => {
      throwIfAborted(signal);
      const current = await this.scanAsync();
      if (scanSignature(current) !== scanSignature(expected)) throw new Error("The Vault changed after preview. Review the structure again before applying changes.");
      await this.migrateUnlocked(current, signal, onStep);
    });
  }

  public async scanPropertiesAsync(
    onProgress?: (completed: number, total: number) => void,
    externalSignal?: AbortSignal,
  ): Promise<PropertyMigrationScan> {
    const signal = externalSignal === undefined ? this.lifecycle.signal : AbortSignal.any([this.lifecycle.signal, externalSignal]);
    const files = this.app.vault.getMarkdownFiles();
    const changes: PropertyMigrationScan["changes"] = [];
    const conflicts: PropertyHealthFinding[] = [];
    const nonCanonical: PropertyHealthFinding[] = [];
    const invalidIcons: PropertyHealthFinding[] = [];
    let canonicalPropertyNotes = 0;
    let legacyPropertyNotes = 0;
    let redundantLegacyNotes = 0;
    for (const [index, file] of files.entries()) {
      throwIfAborted(signal);
      const source = await this.readCurrentSource(file);
      const analysis = analyzeFolderNodesSource(source);
      const resolution = resolveFolderNodesProperties(analysis.frontmatter, analysis.issues);
      const hasFolderNodesData = resolution.canonicalPresent
        || resolution.legacyKeysPresent.length > 0
        || analysis.issues.length > 0;
      if (resolution.canonicalPresent) canonicalPropertyNotes += 1;
      if (resolution.legacyKeysPresent.length > 0) legacyPropertyNotes += 1;
      if (resolution.redundantLegacyKeys.length > 0) redundantLegacyNotes += 1;

      if (hasFolderNodesData && !this.isCanonicalFile(file)) {
        nonCanonical.push({
          path: file.path,
          messages: [
            "Folder Nodes properties are only migrated on canonical Node Notes",
            ...resolution.issues.map(({ message }) => message),
          ],
        });
      } else if (resolution.issues.length > 0) {
        conflicts.push({ path: file.path, messages: resolution.issues.map(({ message }) => message) });
      } else if (resolution.legacyKeysPresent.length > 0) {
        changes.push({
          path: file.path,
          sourceFingerprint: sourceFingerprint(source),
          summary: `${resolution.legacyKeysPresent.join(", ")} → ${FOLDER_NODES_PROPERTY}`,
        });
      }

      const rawIcon: unknown = this.app.metadataCache.getFileCache(file)?.frontmatter?.[ICON_PROPERTY];
      if (rawIcon !== undefined && editableVisualCandidates(rawIcon) === null) {
        invalidIcons.push({ path: file.path, messages: ["Unsupported icon property shape"] });
      }
      const completed = index + 1;
      if (completed % 128 === 0 || completed === files.length) {
        onProgress?.(completed, Math.max(1, files.length));
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      }
    }
    throwIfAborted(signal);
    return {
      scannedNotes: files.length,
      canonicalPropertyNotes,
      legacyPropertyNotes,
      redundantLegacyNotes,
      changes: changes.sort(comparePaths),
      conflicts: conflicts.sort(comparePaths),
      nonCanonical: nonCanonical.sort(comparePaths),
      invalidIcons: invalidIcons.sort(comparePaths),
    };
  }

  public migrateProperties(
    expected: PropertyMigrationScan,
    onStep?: (completed: number, total: number) => void,
    externalSignal?: AbortSignal,
  ): Promise<void> {
    const signal = externalSignal === undefined ? this.lifecycle.signal : AbortSignal.any([this.lifecycle.signal, externalSignal]);
    return this.exclusive(async () => {
      throwIfAborted(signal);
      const current = await this.scanPropertiesAsync(undefined, signal);
      if (propertyScanSignature(current) !== propertyScanSignature(expected)) {
        throw new Error("The Vault changed after preview. Review Folder Nodes properties again before applying changes.");
      }
      if (current.conflicts.length > 0) {
        throw new Error(`Property migration contains blocking conflicts: ${current.conflicts[0]?.messages[0] ?? "unknown conflict"}`);
      }
      const undos: Undo[] = [];
      try {
        for (const [index, change] of current.changes.entries()) {
          throwIfAborted(signal);
          const file = this.getFile(change.path);
          if (file === null || !this.isCanonicalFile(file)) throw new Error(`Property migration target changed: ${change.path}`);
          const result = await this.applyFileChange(file, change.path, (source) => {
            if (sourceFingerprint(source) !== change.sourceFingerprint) {
              throw new Error(`Property migration target changed after preview: ${change.path}`);
            }
            return patchFolderNodesFrontmatter(source, { migrateLegacy: true });
          });
          if (result.after !== result.before) {
            const { after, before } = result;
            undos.push(async () => {
              await this.applyFileChange(file, change.path, (source) => {
                if (source !== after) throw new Error(`Cannot safely roll back concurrently modified file: ${change.path}`);
                return before;
              });
            });
          }
          onStep?.(index + 1, current.changes.length);
          throwIfAborted(signal);
        }
        const post = await this.scanPropertiesAsync(undefined, signal);
        const changedPaths = new Set(current.changes.map(({ path }) => path));
        if (post.changes.some(({ path }) => changedPaths.has(path)) || post.conflicts.some(({ path }) => changedPaths.has(path))) {
          throw new Error("Folder Nodes property validation failed after migration");
        }
      } catch (error) {
        await this.rollback(undos, error);
      }
    });
  }

  public children(parentPath: string): ChildOrderRecord[] {
    parentPath = normalizeVaultPath(parentPath);
    const records = this.childRecords(parentPath);
    return this.sortMode(parentPath) === "manual" ? records.sort(compareChildren) : naturalOrder(records);
  }

  public sortMode(parentPath: string): "natural" | "manual" {
    const note = this.getCanonicalFile(parentPath);
    return note !== null && this.propertiesForNote(note).order === "manual" ? "manual" : "natural";
  }

  public canReorder(folder: TFolder, delta: -1 | 1): boolean {
    const parentPath = normalizeVaultPath(folder.parent?.path ?? "");
    if (this.sortMode(parentPath) !== "manual" || !this.isNodeVisible(folder.path)) return false;
    const children = this.children(parentPath);
    const index = children.findIndex(({ childPath }) => childPath === folder.path);
    const target = index + delta;
    const adjacent = children[target];
    return index >= 0 && target >= 0 && target < children.length
      && adjacent !== undefined && this.isNodeVisible(adjacent.childPath);
  }

  public reorder(folder: TFolder, delta: -1 | 1): Promise<void> {
    return this.exclusive(async () => {
      const parentPath = normalizeVaultPath(folder.parent?.path ?? "");
      if (this.sortMode(parentPath) !== "manual") throw new Error("Enable manual child ordering before reordering nodes");
      if (!this.isNodeVisible(folder.path)) return;
      const children = this.children(parentPath);
      const index = children.findIndex(({ childPath }) => childPath === folder.path);
      const target = index + delta;
      const adjacent = children[target];
      if (index < 0 || target < 0 || target >= children.length
        || adjacent === undefined || !this.isNodeVisible(adjacent.childPath)) return;
      const siblings = children.filter(({ childPath }) => childPath !== folder.path);
      const intent: PlacementIntent = {
        kind: "insert",
        gap: {
          parentPath,
          previousSiblingPath: siblings[target - 1]?.childPath ?? null,
          nextSiblingPath: siblings[target]?.childPath ?? null,
        },
      };
      await this.placeNodeUnlocked(folder, intent);
    });
  }

  public reconcileCreated(path: string): Promise<void> {
    return this.exclusive(async () => {
      // Native creation remains native. A new folder or Markdown file is surfaced
      // as an incomplete node until the user completes it or marks it unmanaged.
      void path;
    });
  }

  public reconcileDeleted(path: string): Promise<void> {
    return this.exclusive(async () => {
      // Deleting a Node Note intentionally leaves an incomplete folder-side node. Never
      // recreate user-deleted content in a background reconciliation pass.
      void path;
    });
  }

  public reconcileRenamed(entry: TAbstractFile, oldPath: string): Promise<void> {
    return this.exclusive(async () => {
      const oldRoot = isSameVaultPath(oldPath, this.rootNotePath());
      const oldCanonical = oldRoot || isCanonicalNodeNote(oldPath);
      const entryScope = entry instanceof TFolder ? entry.path : dirname(entry.path);
      const oldScope = entry instanceof TFolder ? oldPath : dirname(oldPath);
      if (this.isIgnoredPath(entryScope)) return;
      if (entry instanceof TFolder) {
        if (this.isIgnoredPath(oldScope)) return;
        const parentChanged = !isSameVaultPath(dirname(entry.path), dirname(oldPath));
        const canonicalPath = nodeNotePath(entry.path);
        const previousName = basename(oldPath);
        const candidates = [...new Set([
          ...this.canonicalFiles(entry.path),
          ...entry.children.filter((child): child is TFile =>
            child instanceof TFile && child.extension.toLocaleLowerCase() === "md" && isSameVaultName(child.basename, previousName)),
        ])];
        if (candidates.length > 1) throw new Error(`Folder rename conflict: multiple canonical notes exist in ${entry.path}`);
        const candidate = candidates[0];
        if (candidate !== undefined && candidate.path !== canonicalPath) {
          await this.assertAvailable(canonicalPath, candidate);
          this.expectEvent("rename", canonicalPath, candidate.path);
          await this.app.fileManager.renameFile(candidate, canonicalPath);
        }
        const canonical = this.getCanonicalFile(entry.path);
        if (parentChanged && canonical !== null) {
          const undos: Undo[] = [];
          try {
            await this.appendRankIfManual(dirname(entry.path), canonical, undos);
          } catch (error) {
            await this.rollback(undos, error);
          }
        }
        return;
      }
      if (entry instanceof TFile && oldRoot) return;
      if (entry instanceof TFile && oldCanonical && dirname(entry.path) === dirname(oldPath) && !isCanonicalNodeNote(entry.path)) {
        if (entry.parent !== null) await this.renameNodeUnlockedFromRenamedNote(entry.parent, entry);
      }
    });
  }

  private resolvePlacement(folder: TFolder, intent: PlacementIntent): {
    intent: PlacementIntent;
    parentPath: string;
    targetIndex: number | null;
    siblings: ChildOrderRecord[];
  } | null {
    const sourcePath = normalizeVaultPath(folder.path);
    if (sourcePath === "") throw new FolderNodesError("root_cannot_move", {}, "The Root Node cannot be moved");
    if (this.getFolder(sourcePath) !== folder) throw new FolderNodesError("source_node_changed", {}, "The source node changed; retry the drag");
    if (this.isIgnoredPath(sourcePath)) throw new FolderNodesError("folder_unmanaged", { path: sourcePath }, "An unmanaged folder cannot be placed as a Folder Node");
    this.requireCanonicalNote(folder);

    const parentPath = normalizeVaultPath(intent.kind === "move-into" ? intent.parentPath : intent.gap.parentPath);
    if (this.isIgnoredPath(parentPath)) throw new FolderNodesError("folder_unmanaged", { path: parentPath }, "An unmanaged folder cannot contain a placed Folder Node");
    if (parentPath === sourcePath || isDescendantPath(parentPath, sourcePath)) throw new Error("A node cannot be moved into itself or a descendant");
    const targetParent = parentPath === "" ? this.app.vault.getRoot() : this.getFolder(parentPath);
    if (targetParent === null) throw new FolderNodesError("target_folder_unknown", { path: parentPath }, `Unknown target folder: ${parentPath}`);
    if (parentPath !== "" && this.getCanonicalFile(parentPath) === null) throw new FolderNodesError("target_not_complete", { path: parentPath }, `Target is not a complete Folder Node: ${parentPath}`);

    const oldParentPath = normalizeVaultPath(folder.parent?.path ?? "");
    if (intent.kind === "move-into" && oldParentPath === parentPath) return null;

    if (oldParentPath !== parentPath) {
      const destination = normalizeVaultPath(parentPath === "" ? folder.name : `${parentPath}/${folder.name}`);
      if (targetParent.children.some((entry) => isSameVaultPath(entry.path, destination))) {
        throw new Error(`Path already exists: ${destination}`);
      }
    }

    const siblings = this.children(parentPath).filter(({ childPath }) => childPath !== sourcePath);
    if (intent.kind === "move-into") {
      return { intent: { kind: "move-into", parentPath }, parentPath, targetIndex: this.sortMode(parentPath) === "manual" ? siblings.length : null, siblings };
    }

    if (this.sortMode(parentPath) !== "manual") throw new Error("Enable manual child ordering before placing a node at an exact position");
    const gap = {
      parentPath,
      previousSiblingPath: intent.gap.previousSiblingPath === null ? null : normalizeVaultPath(intent.gap.previousSiblingPath),
      nextSiblingPath: intent.gap.nextSiblingPath === null ? null : normalizeVaultPath(intent.gap.nextSiblingPath),
    };
    const targetIndex = insertionIndex(siblings.map(({ childPath }) => childPath), gap);
    if (targetIndex === null) throw new Error("The insertion position is stale; retry the drag");
    if (oldParentPath === parentPath) {
      const current = this.children(parentPath).findIndex(({ childPath }) => childPath === sourcePath);
      if (current === targetIndex) return null;
    }
    return { intent: { kind: "insert", gap }, parentPath, targetIndex, siblings };
  }

  private async placeNodeUnlocked(folder: TFolder, intent: PlacementIntent): Promise<TFolder> {
    const resolved = this.resolvePlacement(folder, intent);
    if (resolved === null) return folder;
    const { parentPath, siblings, targetIndex } = resolved;
    const sourcePath = normalizeVaultPath(folder.path);
    const sourceNote = this.requireCanonicalNote(folder);
    const sourceNotePath = sourceNote.path;
    const targetParent = parentPath === "" ? null : this.getFolder(parentPath);
    if (parentPath !== "" && targetParent === null) throw new Error(`Unknown target folder: ${parentPath}`);
    const oldParentPath = normalizeVaultPath(folder.parent?.path ?? "");
    const nextPath = normalizePath(parentPath === "" ? folder.name : `${parentPath}/${folder.name}`);
    if (oldParentPath !== parentPath) await this.assertAvailable(nextPath);
    this.assertEntryIdentity(folder, sourcePath, TFolder);
    this.assertEntryIdentity(sourceNote, sourceNotePath, TFile);
    if (sourceNote.parent !== folder) throw new Error(`Node Note source changed during operation: ${sourceNotePath}`);
    if (targetParent !== null) this.assertEntryIdentity(targetParent, parentPath, TFolder);

    const undos: Undo[] = [];
    try {
      if (this.sortMode(parentPath) === "manual") {
        this.assertActive();
        const note = this.requireCanonicalNote(folder);
        const moved: ChildOrderRecord = { basename: folder.name, childPath: sourcePath, order: this.readRank(note) };
        const plan = planInsert(siblings, moved, targetIndex ?? siblings.length);
        await this.applyOrderPatches(plan.patches, folder, undos);
      }
      this.assertEntryIdentity(folder, sourcePath, TFolder);
      this.assertEntryIdentity(sourceNote, sourceNotePath, TFile);
      if (sourceNote.parent !== folder) throw new Error(`Node Note source changed during operation: ${sourceNotePath}`);
      if (targetParent !== null) this.assertEntryIdentity(targetParent, parentPath, TFolder);
      if (oldParentPath === parentPath) return folder;
      this.assertActive();
      this.expectEvent("rename", nextPath, sourcePath, true);
      await this.app.fileManager.renameFile(folder, nextPath);
      undos.push(async () => {
        this.assertEntryIdentity(folder, nextPath, TFolder);
        this.expectEvent("rename", sourcePath, nextPath, true);
        await this.app.fileManager.renameFile(folder, sourcePath);
      });
      this.assertEntryIdentity(folder, nextPath, TFolder);
      if (this.getCanonicalFile(nextPath) === null) throw new Error("Moved node failed structural validation");
      return folder;
    } catch (error) {
      return this.rollback(undos, error);
    }
  }

  private async createNodeUnlocked(parentPath: string, rawName: string, options: { alias?: string; body?: string }): Promise<TFile> {
    const undos: Undo[] = [];
    try { return await this.createNodeStepUnlocked(parentPath, rawName, options, undos); }
    catch (error) { return this.rollback(undos, error); }
  }

  private async createNodePathUnlocked(nodePath: string, options: { alias?: string; body?: string }): Promise<TFile> {
    const normalized = normalizeVaultPath(nodePath);
    const parts = normalized.split("/").filter((part) => part !== "");
    if (parts.length === 0) throw new FolderNodesError("node_path_required", {}, "A Node path is required");
    const undos: Undo[] = [];
    let parentPath = "";
    let result: TFile | null = null;
    try {
      for (const [index, part] of parts.entries()) {
        this.assertActive();
        const folderPath = normalizePath(parentPath === "" ? part : `${parentPath}/${part}`);
        if (this.isIgnoredPath(folderPath)) throw new FolderNodesError("folder_unmanaged", { path: folderPath }, `Folder is unmanaged: ${folderPath}`);
        const existing = this.app.vault.getAbstractFileByPath(folderPath);
        const isTarget = index === parts.length - 1;
        if (existing !== null) {
          if (!(existing instanceof TFolder)) throw new Error(`Path already exists: ${folderPath}`);
          if (isTarget) throw new Error(`Path already exists: ${folderPath}`);
          this.requireCanonicalNote(existing);
        } else {
          result = await this.createNodeStepUnlocked(parentPath, part, isTarget ? options : {}, undos);
        }
        parentPath = folderPath;
      }
      if (result === null || result.path !== this.notePathForFolder(normalized)) throw new Error(`Node creation failed structural validation: ${normalized}`);
      return result;
    } catch (error) { return this.rollback(undos, error); }
  }

  private async createNodeStepUnlocked(
    parentPath: string,
    rawName: string,
    options: { alias?: string; body?: string },
    undos: Undo[],
  ): Promise<TFile> {
    const normalizedParent = normalizeVaultPath(parentPath);
    if (this.isIgnoredPath(normalizedParent)) throw new FolderNodesError("folder_unmanaged", { path: normalizedParent }, `Folder is unmanaged: ${normalizedParent}`);
    if (normalizedParent !== "" && this.getFolder(normalizedParent) === null) throw new Error(`Unknown parent folder: ${normalizedParent}`);
    const name = sanitizeNodeName(rawName);
    const folderPath = normalizePath(normalizedParent === "" ? name : `${normalizedParent}/${name}`);
    const notePath = `${folderPath}/${name}.md`;
    await this.assertAvailable(folderPath);
    await this.assertAvailable(notePath);
    this.assertActive();
    this.expectEvent("create", folderPath);
    const createdFolder = await this.app.vault.createFolder(folderPath);
    undos.push(() => this.trashCreatedFolder(createdFolder, folderPath));
    this.assertActive();
    this.expectEvent("create", notePath);
    const initialContent = createNodeDocument(options.alias?.trim() || null, options.body ?? "");
    const note = await this.app.vault.create(notePath, initialContent);
    undos.push(() => this.trashCreatedFile(note, notePath, initialContent));
    this.assertEntryIdentity(note, notePath, TFile);
    this.assertActive();
    const orderReceipts: FileChangeReceipt[] = [];
    const rank = await this.appendRankIfManual(normalizedParent, note, undos, orderReceipts);
    this.createdNodes.set(note, {
      folder: createdFolder,
      folderPath,
      notePath,
      initialContent,
      finalContent: rank === null ? initialContent : patchFolderNodesFrontmatter(initialContent, { rank }),
      orderReceipts,
    });
    return note;
  }

  private async convertLeafNoteUnlocked(file: TFile): Promise<TFile> {
    if (file.extension.toLocaleLowerCase() !== "md") throw new Error(`Not a Markdown note: ${file.path}`);
    if (this.isCanonicalFile(file)) return file;
    const originalPath = file.path;
    const parentPath = normalizeVaultPath(file.parent?.path ?? "");
    const name = sanitizeNodeName(file.basename);
    const desiredFolderPath = normalizePath(parentPath === "" ? name : `${parentPath}/${name}`);
    const existingFolder = file.parent?.children.find((entry): entry is TFolder =>
      entry instanceof TFolder && isSameVaultName(entry.name, name)) ?? null;
    const folderPath = existingFolder?.path ?? desiredFolderPath;
    const noteName = existingFolder?.name ?? name;
    const notePath = `${folderPath}/${noteName}.md`;
    if (this.isIgnoredPath(folderPath)) throw new Error(`Target belongs to an unmanaged folder: ${folderPath}`);
    const target = existingFolder ?? this.app.vault.getAbstractFileByPath(folderPath);
    if (target !== null && !(target instanceof TFolder)) throw new Error(`Path already exists: ${folderPath}`);
    if (target === null) await this.assertAvailable(folderPath);
    await this.assertAvailable(notePath, file);
    const undos: Undo[] = [];
    try {
      if (target === null) {
        this.assertActive();
        this.expectEvent("create", folderPath);
        const createdFolder = await this.app.vault.createFolder(folderPath);
        undos.push(() => this.trashCreatedFolder(createdFolder, folderPath));
      }
      this.assertActive();
      this.expectEvent("rename", notePath, originalPath);
      await this.app.fileManager.renameFile(file, notePath);
      undos.push(async () => {
        this.assertEntryIdentity(file, notePath, TFile);
        this.expectEvent("rename", originalPath, notePath);
        await this.app.fileManager.renameFile(file, originalPath);
      });
      this.assertEntryIdentity(file, notePath, TFile);
      await this.appendRankIfManual(parentPath, file, undos);
      return file;
    } catch (error) { return this.rollback(undos, error); }
  }

  private async renameNodeUnlockedFromRenamedNote(folder: TFolder, renamedNote: TFile): Promise<void> {
    this.assertActive();
    const name = sanitizeNodeName(renamedNote.basename);
    const sourcePath = normalizeVaultPath(folder.path);
    if (sourcePath === "") return;
    const renamedNotePath = renamedNote.path;
    const parentPath = normalizeVaultPath(folder.parent?.path ?? "");
    const nextPath = normalizePath(parentPath === "" ? name : `${parentPath}/${name}`);
    await this.assertAvailable(nextPath);
    this.assertEntryIdentity(folder, sourcePath, TFolder);
    this.assertEntryIdentity(renamedNote, renamedNotePath, TFile);
    if (renamedNote.parent !== folder) throw new Error(`Node Note source changed during operation: ${renamedNotePath}`);
    const undos: Undo[] = [];
    try {
      this.expectEvent("rename", nextPath, sourcePath, true);
      await this.app.fileManager.renameFile(folder, nextPath);
      undos.push(async () => {
        this.assertEntryIdentity(folder, nextPath, TFolder);
        this.expectEvent("rename", sourcePath, nextPath, true);
        await this.app.fileManager.renameFile(folder, sourcePath);
      });
      if (this.getFile(`${nextPath}/${name}.md`) === null) throw new Error("Renamed node failed structural validation");
    } catch (error) {
      await this.rollback(undos, error);
    }
  }

  private async applyOrderPatches(
    patches: readonly OrderPatch[],
    movedFolder: TFolder | null,
    undos: Undo[],
    receipts?: FileChangeReceipt[],
  ): Promise<void> {
    const movedPath = movedFolder === null ? null : normalizeVaultPath(movedFolder.path);
    for (const patch of patches) {
      this.assertActive();
      const note = movedPath !== null && patch.childPath === movedPath
        ? this.requireCanonicalNote(movedFolder!)
        : this.getCanonicalFile(patch.childPath);
      const receipt = await this.patchFolderNodesTransactional(note, { rank: patch.nextOrder }, undos);
      if (receipt !== null) receipts?.push(receipt);
    }
  }

  private childRecords(parentPath: string): ChildOrderRecord[] {
    const parent = parentPath === "" ? this.app.vault.getRoot() : this.getFolder(parentPath);
    if (parent === null) return [];
    return parent.children.filter((child): child is TFolder => child instanceof TFolder && !this.isIgnoredPath(child.path) && this.getCanonicalFile(child.path) !== null).map((child) => ({
      basename: child.name,
      childPath: child.path,
      order: this.readRank(this.getCanonicalFile(child.path)),
    }));
  }

  private readRank(note: TFile | null): number | null {
    return note === null ? null : this.propertiesForNote(note).rank;
  }

  private async appendRankIfManual(
    parentPath: string,
    note: TFile,
    undos: Undo[],
    receipts?: FileChangeReceipt[],
  ): Promise<number | null> {
    if (this.sortMode(parentPath) !== "manual") return null;
    const movedPath = normalizeVaultPath(note.parent?.path ?? "");
    const siblings = this.childRecords(parentPath).filter(({ childPath }) => childPath !== movedPath);
    const moved: ChildOrderRecord = { basename: note.parent?.name ?? note.basename, childPath: movedPath, order: this.readRank(note) };
    const plan = planInsert(siblings, moved, siblings.length);
    await this.applyOrderPatches(plan.patches, note.parent instanceof TFolder ? note.parent : null, undos, receipts);
    return plan.patches.find(({ childPath }) => childPath === movedPath)?.nextOrder ?? null;
  }

  private async migrateUnlocked(
    scan: MigrationScan,
    signal: AbortSignal,
    onStep?: (completed: number, total: number) => void,
  ): Promise<void> {
    if (scan.conflicts.length > 0) throw new Error(`Migration contains blocking conflicts: ${scan.conflicts[0]?.reason ?? "unknown conflict"}`);
    const total = scan.leafMarkdown.length + scan.missingNodeNotes.length;
    const undos: Undo[] = [];
    let completed = 0;
    try {
      for (const path of scan.leafMarkdown) {
        throwIfAborted(signal);
        const note = this.getFile(path);
        if (note === null) throw new Error(`Migration source disappeared: ${path}`);
        const parent = dirname(path);
        const name = sanitizeNodeName(basename(path).slice(0, -3));
        const folderPath = normalizePath(parent === "" ? name : `${parent}/${name}`);
        const targetNotePath = `${folderPath}/${name}.md`;
        if (this.getFolder(folderPath) === null) {
          await this.assertAvailable(folderPath);
          throwIfAborted(signal);
          this.expectEvent("create", folderPath);
          const createdFolder = await this.app.vault.createFolder(folderPath);
          undos.push(() => this.trashCreatedFolder(createdFolder, folderPath));
          throwIfAborted(signal);
        }
        await this.assertAvailable(targetNotePath, note);
        throwIfAborted(signal);
        this.expectEvent("rename", targetNotePath, path);
        await this.app.fileManager.renameFile(note, targetNotePath);
        undos.push(async () => {
          this.assertEntryIdentity(note, targetNotePath, TFile);
          this.expectEvent("rename", path, targetNotePath);
          await this.app.fileManager.renameFile(note, path);
        });
        throwIfAborted(signal);
        onStep?.(++completed, total);
        throwIfAborted(signal);
      }
      for (const folderPath of scan.missingNodeNotes) {
        throwIfAborted(signal);
        const notePath = this.notePathForFolder(folderPath);
        if (this.getFile(notePath) === null) {
          await this.assertAvailable(notePath);
          throwIfAborted(signal);
          this.expectEvent("create", notePath);
          const created = await this.app.vault.create(notePath, "");
          undos.push(() => this.trashCreatedFile(created, notePath, ""));
          throwIfAborted(signal);
        }
        onStep?.(++completed, total);
        throwIfAborted(signal);
      }
      throwIfAborted(signal);
      const post = await this.scanAsync();
      if (post.conflicts.length > 0 || post.leafMarkdown.length > 0 || post.missingNodeNotes.length > 0) throw new Error("Structural validation failed after bulk organization");
    } catch (error) { await this.rollback(undos, error); }
  }

  private requireCanonicalNote(folder: TFolder): TFile {
    const candidates = this.canonicalFiles(folder.path);
    if (candidates.length === 0) throw new Error(`Missing canonical Node Note: ${folder.path}`);
    if (candidates.length > 1) throw new Error(`Multiple canonical Node Notes: ${folder.path}`);
    return candidates[0]!;
  }

  private canonicalFiles(folderPath: string): TFile[] {
    const folder = this.getFolder(folderPath);
    if (folder === null) return [];
    return folder.children.filter((entry): entry is TFile => entry instanceof TFile && this.isCanonicalNameMatch(entry));
  }

  private isCanonicalNameMatch(file: TFile): boolean {
    if (file.extension.toLocaleLowerCase() !== "md" || file.parent === null) return false;
    const expectedName = normalizeVaultPath(file.parent.path) === "" ? sanitizeNodeName(this.app.vault.getName()) : file.parent.name;
    return isSameVaultName(file.basename, expectedName);
  }

  private async pathExists(path: string): Promise<boolean> {
    return this.app.vault.getAbstractFileByPath(normalizePath(path)) !== null || await this.app.vault.adapter.exists(normalizePath(path));
  }

  private async assertAvailable(path: string, allowed: TAbstractFile | null = null): Promise<void> {
    const normalized = normalizePath(path);
    const cached = this.app.vault.getAbstractFileByPath(normalized);
    if (cached !== null && cached !== allowed) throw new Error(`Path already exists: ${normalized}`);
    const sameCaseInsensitiveEntry = allowed !== null && isSameVaultPath(allowed.path, normalized);
    if (cached === null && await this.app.vault.adapter.exists(normalized) && !sameCaseInsensitiveEntry) throw new Error(`Path already exists: ${normalized}`);
  }

  private expectEvent(kind: VaultEventKind, newPath: string, oldPath: string | null = null, recursive = false): void {
    this.operations.expect(kind, newPath, oldPath, recursive);
  }

  private propertiesForNote(file: TFile): ReturnType<typeof resolveFolderNodesProperties> {
    return resolveFolderNodesProperties(this.app.metadataCache.getFileCache(file)?.frontmatter);
  }

  private async patchFolderNodesTransactional(
    file: TFile | null,
    patch: FolderNodesFrontmatterPatch,
    undos: Undo[],
  ): Promise<FileChangeReceipt | null> {
    this.assertActive();
    if (file === null) throw new Error(`Cannot update missing Node Note: ${FOLDER_NODES_PROPERTY}`);
    const path = file.path;
    const result = await this.applyFileChange(
      file,
      path,
      (current) => patchFolderNodesFrontmatter(current, patch),
    );
    const { after, before } = result;
    if (after === before) return null;
    const receipt = { after, before, file, path };
    undos.push(() => this.restoreFileChange(receipt));
    return receipt;
  }

  private async restoreFileChange(receipt: FileChangeReceipt): Promise<void> {
    const { after, before, file, path } = receipt;
    await this.applyFileChange(file, path, (current) => {
      if (current !== after) {
        throw new Error(`Cannot safely roll back concurrently modified file: ${path}`);
      }
      return before;
    });
  }

  private async readClosedMergeNote(
    file: TFile,
    path: string,
    role: "source" | "target",
  ): Promise<string> {
    this.assertEntryIdentity(file, path, TFile);
    this.assertMergeNoteClosed(file, path, role);
    const content = await this.app.vault.read(file);
    this.assertEntryIdentity(file, path, TFile);
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

  private assertMergeNoteClosed(
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
    this.assertEntryIdentity(source, sourcePath, TFolder);
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
    if (!rollback) this.assertActive();
    this.assertEntryIdentity(file, path, TFile);
    this.assertMergeNoteClosed(file, path, role);
    let before: string | undefined;
    let after: string | undefined;
    const published = await this.app.vault.process(file, (current) => {
      if (!rollback) this.assertActive();
      this.assertEntryIdentity(file, path, TFile);
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

  private pushExactMergeUndo(
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

  private async readCurrentSource(file: TFile): Promise<string> {
    const target = this.findOpenMarkdownTarget(file, file.path);
    return target?.editor.getValue() ?? this.app.vault.cachedRead(file);
  }

  private async applyFileChange(
    file: TFile,
    path: string,
    update: (current: string) => string,
  ): Promise<{ before: string; after: string }> {
    this.assertEntryIdentity(file, path, TFile);
    const openTarget = this.findOpenMarkdownTarget(file, path);
    if (openTarget !== null) {
      const before = openTarget.editor.getValue();
      const after = update(before);
      if (after === before) return { before, after };
      this.assertEntryIdentity(file, path, TFile);
      if (!this.isSameOpenMarkdownTarget(openTarget, file, path)) {
        throw new Error(`Markdown editor changed before structural metadata update: ${path}`);
      }
      if (openTarget.editor.getValue() !== before) {
        throw new Error(`Markdown content changed before structural metadata update: ${path}`);
      }
      openTarget.editor.transaction({
        changes: [{
          from: { line: 0, ch: 0 },
          to: openTarget.editor.offsetToPos(before.length),
          text: after,
        }],
      }, "folder-nodes-structural-metadata");
      openTarget.requestSave();
      if (openTarget.editor.getValue() !== after) {
        throw new Error(`Markdown editor did not accept structural metadata update: ${path}`);
      }
      return { before, after };
    }

    let before: string | undefined;
    let after: string | undefined;
    const published = await this.app.vault.process(file, (current) => {
      this.assertEntryIdentity(file, path, TFile);
      if (this.findOpenMarkdownTarget(file, path) !== null) {
        throw new Error(`Markdown editor opened before structural metadata update: ${path}`);
      }
      before = current;
      after = update(current);
      return after;
    });
    this.assertEntryIdentity(file, path, TFile);
    if (before === undefined || after === undefined || published !== after) {
      throw new Error(`Vault did not publish structural metadata update: ${path}`);
    }
    return { before, after };
  }

  private findOpenMarkdownTarget(file: TFile, path: string): OpenMarkdownTarget | null {
    const targets = this.app.workspace.getLeavesOfType("markdown").flatMap((leaf) => {
      const view = leaf.view as typeof leaf.view & {
        file?: TFile | null;
        editor?: Editor;
        requestSave?: () => void;
      };
      if (
        view.file?.path !== path ||
        view.editor === undefined ||
        typeof view.requestSave !== "function"
      ) return [];
      return [{
        editor: view.editor,
        file: view.file,
        leaf,
        requestSave: () => view.requestSave?.(),
      }];
    });
    if (targets.length > 1) {
      throw new Error(`Cannot update structural metadata while a note is open in multiple editors: ${path}`);
    }
    const target = targets[0] ?? null;
    if (target !== null && target.file !== file) {
      throw new Error(`Markdown file identity changed before structural metadata update: ${path}`);
    }
    return target;
  }

  private isSameOpenMarkdownTarget(
    expected: OpenMarkdownTarget,
    file: TFile,
    path: string,
  ): boolean {
    const current = this.findOpenMarkdownTarget(file, path);
    return current?.leaf === expected.leaf && current.editor === expected.editor;
  }

  private assertEntryIdentity<T extends TAbstractFile>(
    entry: T,
    path: string,
    kind: abstract new (...args: never[]) => T,
  ): void {
    const current = this.app.vault.getAbstractFileByPath(normalizePath(path));
    if (!(entry instanceof kind) || entry.path !== path || current !== entry) {
      throw new Error(`Vault entry identity changed during operation: ${path}`);
    }
  }

  private async trashCreatedFile(file: TFile, path: string, initialContent: string): Promise<void> {
    this.assertEntryIdentity(file, path, TFile);
    if (await this.app.vault.read(file) !== initialContent) {
      throw new Error(`Cannot roll back concurrently modified created file: ${path}`);
    }
    this.assertEntryIdentity(file, path, TFile);
    this.expectEvent("delete", path);
    await this.app.fileManager.trashFile(file);
  }

  private async trashCreatedFolder(folder: TFolder, folderPath: string): Promise<void> {
    this.assertEntryIdentity(folder, folderPath, TFolder);
    if (folder.children.length > 0) {
      throw new Error(`Cannot roll back non-empty created folder: ${folderPath}`);
    }
    this.expectEvent("delete", folderPath, null, true);
    await this.app.fileManager.trashFile(folder);
  }

  private async rollback(undos: readonly Undo[], cause: unknown): Promise<never> {
    const failures: unknown[] = [];
    for (const undo of [...undos].reverse()) {
      try { await undo(); } catch (error) { failures.push(error); }
    }
    if (failures.length > 0) throw new AggregateError([cause, ...failures], "Folder Nodes operation failed and rollback was incomplete", { cause });
    throw cause;
  }

  private assertActive(): void {
    throwIfAborted(this.lifecycle.signal);
  }

  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const signal = this.lifecycle.signal;
    return this.operations.run(async () => {
      throwIfAborted(signal);
      return operation();
    });
  }
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw signal.reason instanceof Error
      ? signal.reason
      : new Error("Folder Nodes operation cancelled");
  }
}

function scanSignature(scan: MigrationScan): string {
  return JSON.stringify({
    conflicts: scan.conflicts.map(({ path, reason }) => [path, reason]),
    exemptLeafMarkdown: scan.exemptLeafMarkdown,
    ignoredFolders: scan.ignoredFolders,
    leafMarkdown: scan.leafMarkdown,
    missingNodeNotes: scan.missingNodeNotes,
  });
}

function propertyScanSignature(scan: PropertyMigrationScan): string {
  return JSON.stringify({
    scannedNotes: scan.scannedNotes,
    canonicalPropertyNotes: scan.canonicalPropertyNotes,
    legacyPropertyNotes: scan.legacyPropertyNotes,
    redundantLegacyNotes: scan.redundantLegacyNotes,
    changes: scan.changes.map(({ path, sourceFingerprint: fingerprint, summary }) => [path, fingerprint, summary]),
    conflicts: scan.conflicts.map(({ path, messages }) => [path, messages]),
    nonCanonical: scan.nonCanonical.map(({ path, messages }) => [path, messages]),
    invalidIcons: scan.invalidIcons.map(({ path, messages }) => [path, messages]),
  });
}

function sourceFingerprint(source: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${source.length}:${(first >>> 0).toString(16)}:${(second >>> 0).toString(16)}`;
}

function comparePaths<T extends { readonly path: string }>(left: T, right: T): number {
  return left.path.localeCompare(right.path, "en");
}

function validateFileName(rawName: string): string {
  const name = rawName.trim();
  if (name === "" || name === "." || name === ".." || /[<>:"/\\|?*]/u.test(name) || /[. ]$/u.test(name)) throw new Error(`Invalid file name: ${rawName}`);
  const stem = name.split(".")[0] ?? name;
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/iu.test(stem)) throw new Error(`Invalid file name: ${rawName}`);
  return name;
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => deepEqual(value, right[index]));
  if (typeof left !== "object" || left === null || typeof right !== "object" || right === null) return false;
  const leftEntries = Object.entries(left as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  const rightEntries = Object.entries(right as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return leftEntries.length === rightEntries.length && leftEntries.every(([key, value], index) => {
    const peer = rightEntries[index];
    return peer !== undefined && key === peer[0] && deepEqual(value, peer[1]);
  });
}

interface ParsedMergeFrontmatter {
  readonly bom: string;
  readonly closingBoundary: number;
  readonly eol: string;
  readonly frontmatter: Record<string, unknown>;
  readonly hasFrontmatter: boolean;
  readonly lines: string[];
}

function readMergeFrontmatter(source: string, path: string): Record<string, unknown> {
  return parseMergeFrontmatter(source, path).frontmatter;
}

function mergeFrontmatterProperties(
  targetSource: string,
  sourceProperties: Readonly<Record<string, unknown>>,
  targetPath: string,
): string {
  const parsed = parseMergeFrontmatter(targetSource, targetPath);
  const additions: Array<readonly [string, unknown]> = [];
  for (const [key, value] of Object.entries(sourceProperties)) {
    if (STRUCTURAL_PROPERTIES.has(key)) continue;
    if (Object.prototype.hasOwnProperty.call(parsed.frontmatter, key)) {
      if (!deepEqual(parsed.frontmatter[key], value)) throw new Error(`Merge property conflict: ${key}`);
      continue;
    }
    additions.push([key, value]);
  }
  if (additions.length === 0) return targetSource;
  const serialized = stringifyYaml(Object.fromEntries(additions)).replaceAll("\r\n", "\n");
  const rendered = (serialized.endsWith("\n") ? serialized.slice(0, -1) : serialized)
    .replaceAll("\n", parsed.eol);
  if (!parsed.hasFrontmatter) {
    return `${parsed.bom}---${parsed.eol}${rendered}${parsed.eol}---${parsed.eol}${targetSource.slice(parsed.bom.length)}`;
  }
  const lines = [...parsed.lines];
  lines.splice(parsed.closingBoundary, 0, ...rendered.split(parsed.eol));
  const candidate = `${parsed.bom}${lines.join(parsed.eol)}`;
  const expected = Object.fromEntries([...Object.entries(parsed.frontmatter), ...additions]);
  try {
    if (deepEqual(readMergeFrontmatter(candidate, targetPath), expected)) return candidate;
  } catch { /* Flow-style mappings cannot accept appended block-style fields. */ }
  const normalized = stringifyYaml(expected).trimEnd().replaceAll("\r\n", "\n").replaceAll("\n", parsed.eol);
  const body = parsed.lines.slice(parsed.closingBoundary + 1).join(parsed.eol);
  const fallback = `${parsed.bom}---${parsed.eol}${normalized}${parsed.eol}---${parsed.eol}${body}`;
  if (!deepEqual(readMergeFrontmatter(fallback, targetPath), expected)) {
    throw new Error(`Cannot safely serialize merge properties: ${targetPath}`);
  }
  return fallback;
}

function parseMergeFrontmatter(source: string, path: string): ParsedMergeFrontmatter {
  const bom = source.startsWith("\uFEFF") ? "\uFEFF" : "";
  const body = source.slice(bom.length);
  const eol = body.includes("\r\n") ? "\r\n" : "\n";
  const lines = body.split(/\r\n|\n/u);
  if (!/^---\s*$/u.test(lines[0] ?? "")) {
    return { bom, closingBoundary: -1, eol, frontmatter: {}, hasFrontmatter: false, lines };
  }
  const relativeEnd = lines.slice(1).findIndex((line) => /^---\s*$/u.test(line));
  if (relativeEnd < 0) throw new Error(`Cannot merge malformed frontmatter: ${path}`);
  const closingBoundary = relativeEnd + 1;
  const yaml = lines.slice(1, closingBoundary).join("\n");
  let parsed: unknown;
  try {
    parsed = yaml.trim() === "" ? {} : parseYaml(yaml);
  } catch (error) {
    throw new Error(`Cannot merge malformed frontmatter: ${path}`, { cause: error });
  }
  if (parsed === null || parsed === undefined) parsed = {};
  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Cannot merge non-object frontmatter: ${path}`);
  }
  return {
    bom,
    closingBoundary,
    eol,
    frontmatter: parsed as Record<string, unknown>,
    hasFrontmatter: true,
    lines,
  };
}

function stripMergeFrontmatter(source: string, path: string): string {
  const parsed = parseMergeFrontmatter(source, path);
  if (!parsed.hasFrontmatter) return source.slice(parsed.bom.length).replaceAll("\r\n", "\n");
  return parsed.lines.slice(parsed.closingBoundary + 1).join("\n");
}
