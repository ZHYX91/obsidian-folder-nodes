import {
  App,
  normalizePath,
  TAbstractFile,
  TFile,
  TFolder,
  type Editor,
  type WorkspaceLeaf,
} from "obsidian";

import { VaultOperationCoordinator, type VaultEventKind } from "./vault-operation-coordinator";
import { matchesFolderExemption, matchesLeafNoteExemption } from "../core/exemptions";
import { createNodeDocument, patchFrontmatterScalar } from "../core/frontmatter";
import { scanMigration, type VaultInventory } from "../core/migration";
import { compareChildren, materializeManualOrder, naturalOrder, planReorder } from "../core/ordering";
import { basename, dirname, isCanonicalNodeNote, isDescendantPath, isSameVaultName, isSameVaultPath, nodeNotePath, normalizeVaultPath, sanitizeNodeName } from "../core/paths";
import { CHILDREN_SORT_PROPERTY, SIBLING_RANK_PROPERTY } from "../core/properties";
import type { ChildOrderRecord, FolderNodesSettings, MigrationScan, NodeDropZone, OrderPatch } from "../core/types";

const STRUCTURAL_PROPERTIES = new Set([CHILDREN_SORT_PROPERTY, SIBLING_RANK_PROPERTY]);
type Undo = () => Promise<void>;

interface OpenMarkdownTarget {
  readonly editor: Editor;
  readonly file: TFile;
  readonly leaf: WorkspaceLeaf;
  readonly requestSave: () => void;
}

export class NodeService {
  private readonly operations = new VaultOperationCoordinator();
  private readonly lifecycle = new AbortController();

  public constructor(private readonly app: App, private readonly getSettings: () => FolderNodesSettings) {}

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
    const candidates = this.canonicalFiles(folderPath);
    return candidates.length === 1 ? candidates[0] ?? null : null;
  }

  public isCanonicalFile(file: TFile): boolean {
    if (file.extension.toLocaleLowerCase() !== "md" || file.parent === null) return false;
    const expectedName = normalizeVaultPath(file.parent.path) === "" ? sanitizeNodeName(this.app.vault.getName()) : file.parent.name;
    return isSameVaultName(file.basename, expectedName);
  }

  public folderForFile(file: TFile | null): TFolder | null { return file?.parent ?? null; }

  public async openFolderNode(folderPath: string, newLeaf = false): Promise<void> {
    const note = this.getCanonicalFile(folderPath);
    if (note !== null) await this.app.workspace.getLeaf(newLeaf).openFile(note);
  }

  public isIgnoredPath(path: string): boolean {
    const settings = this.getSettings();
    return matchesFolderExemption(path, [...settings.ignoredFolders, this.app.vault.configDir], settings.ignoredFolderPrefixes);
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

  public createMissingNodeNote(folder: TFolder): Promise<TFile> {
    return this.exclusive(async () => {
      if (this.isIgnoredPath(folder.path)) throw new Error(`Folder is unmanaged: ${folder.path}`);
      const notePath = this.notePathForFolder(folder.path);
      const existing = this.getCanonicalFile(folder.path);
      if (existing !== null) return existing;
      await this.assertAvailable(notePath);
      this.expectEvent("create", notePath);
      return this.app.vault.create(notePath, "");
    });
  }

  public convertLeafNote(file: TFile): Promise<TFile> { return this.exclusive(() => this.convertLeafNoteUnlocked(file)); }

  public useAsNodeNote(folder: TFolder, file: TFile): Promise<TFile> {
    return this.exclusive(async () => {
      if (file.parent !== folder) throw new Error("The note is not inside the selected folder");
      if (this.isIgnoredPath(folder.path)) throw new Error(`Folder is unmanaged: ${folder.path}`);
      const notePath = this.notePathForFolder(folder.path);
      if (await this.pathExists(notePath)) throw new Error(`Node Note already exists: ${notePath}`);
      this.expectEvent("rename", notePath, file.path);
      await this.app.fileManager.renameFile(file, notePath);
      this.assertEntryIdentity(file, notePath, TFile);
      return file;
    });
  }

  public renameNode(folder: TFolder, rawName: string): Promise<TFolder> {
    return this.exclusive(async () => {
      if (this.isIgnoredPath(folder.path)) throw new Error(`Folder is unmanaged: ${folder.path}`);
      const sourcePath = normalizeVaultPath(folder.path);
      if (sourcePath === "") throw new Error("The Root Node cannot be renamed");
      const noteCandidates = this.canonicalFiles(sourcePath);
      if (noteCandidates.length > 1) throw new Error(`Multiple canonical Node Notes: ${sourcePath}`);
      const note = noteCandidates[0] ?? null;
      const name = sanitizeNodeName(rawName);
      const oldName = folder.name;
      if (name === oldName) return folder;
      const parentPath = normalizeVaultPath(folder.parent?.path ?? "");
      const nextPath = normalizePath(parentPath === "" ? name : `${parentPath}/${name}`);
      const nextNotePath = `${nextPath}/${name}.md`;
      const conflictingNoteBeforeMove = `${sourcePath}/${name}.md`;
      await this.assertAvailable(nextPath, folder);
      if (note !== null && conflictingNoteBeforeMove !== note.path) await this.assertAvailable(conflictingNoteBeforeMove, note);

      const undos: Undo[] = [];
      try {
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
    return this.placeNode(folder, targetParentPath, Number.MAX_SAFE_INTEGER);
  }

  public placeNodeRelative(source: TFolder, target: TFolder, zone: NodeDropZone): Promise<TFolder> {
    return this.exclusive(async () => {
      if (zone === "into") {
        const index = this.children(target.path).filter(({ childPath }) => childPath !== source.path).length;
        return this.placeNodeUnlocked(source, target.path, index);
      }
      const parentPath = normalizeVaultPath(target.parent?.path ?? "");
      const siblings = this.children(parentPath).filter(({ childPath }) => childPath !== source.path);
      const targetIndex = siblings.findIndex(({ childPath }) => childPath === target.path);
      if (targetIndex < 0) throw new Error(`Unknown target node: ${target.path}`);
      return this.placeNodeUnlocked(source, parentPath, targetIndex + (zone === "after" ? 1 : 0));
    });
  }

  public placeNode(folder: TFolder, targetParentPath: string, targetIndex: number): Promise<TFolder> {
    return this.exclusive(() => this.placeNodeUnlocked(folder, targetParentPath, targetIndex));
  }

  public deleteNode(folder: TFolder): Promise<void> {
    return this.exclusive(async () => {
      if (this.isIgnoredPath(folder.path)) throw new Error(`Folder is unmanaged: ${folder.path}`);
      if (normalizeVaultPath(folder.path) === "") throw new Error("The Root Node cannot be deleted");
      this.expectEvent("delete", folder.path, null, true);
      await this.app.fileManager.trashFile(folder);
    });
  }

  public moveFile(file: TFile, targetFolderPath: string): Promise<void> {
    return this.exclusive(async () => {
      targetFolderPath = normalizeVaultPath(targetFolderPath);
      const target = targetFolderPath === "" ? this.app.vault.getRoot() : this.getFolder(targetFolderPath);
      if (target === null) throw new Error(`Unknown target folder: ${targetFolderPath}`);
      const normalizedTarget = normalizeVaultPath(target.path);
      const nextPath = normalizePath(normalizedTarget === "" ? file.name : `${normalizedTarget}/${file.name}`);
      if (nextPath === file.path) return;
      await this.assertAvailable(nextPath, file);
      this.expectEvent("rename", nextPath, file.path);
      await this.app.fileManager.renameFile(file, nextPath);
    });
  }

  public renameFile(file: TFile, rawName: string): Promise<void> {
    return this.exclusive(async () => {
      const name = validateFileName(rawName);
      const parentPath = normalizeVaultPath(file.parent?.path ?? "");
      const nextPath = normalizePath(parentPath === "" ? name : `${parentPath}/${name}`);
      if (nextPath === file.path) return;
      await this.assertAvailable(nextPath, file);
      this.expectEvent("rename", nextPath, file.path);
      await this.app.fileManager.renameFile(file, nextPath);
    });
  }

  public deleteFile(file: TFile): Promise<void> {
    return this.exclusive(async () => {
      this.expectEvent("delete", file.path);
      await this.app.fileManager.trashFile(file);
    });
  }

  public mergeNode(source: TFolder, target: TFolder): Promise<void> {
    return this.exclusive(async () => {
      if (this.isIgnoredPath(source.path) || this.isIgnoredPath(target.path)) throw new Error("An unmanaged folder cannot be merged as a Folder Node");
      if (source.path === target.path || isDescendantPath(target.path, source.path)) throw new Error("A node cannot be merged into itself or a descendant");
      const sourceNote = this.requireCanonicalNote(source);
      const targetNote = this.requireCanonicalNote(target);
      const targetNotePath = targetNote.path;
      const movable = source.children.filter((entry) => entry.path !== sourceNote.path);
      for (const entry of movable) await this.assertAvailable(normalizePath(`${target.path}/${entry.name}`));

      const sourceProperties = this.app.metadataCache.getFileCache(sourceNote)?.frontmatter ?? {};
      const targetProperties = this.app.metadataCache.getFileCache(targetNote)?.frontmatter ?? {};
      for (const [key, value] of Object.entries(sourceProperties)) {
        if (key === "position" || STRUCTURAL_PROPERTIES.has(key)) continue;
        if (key in targetProperties && !deepEqual(targetProperties[key], value)) throw new Error(`Merge property conflict: ${key}`);
      }

      const originalTarget = await this.app.vault.read(targetNote);
      const ownedTargetStates = new Set([originalTarget]);
      const undos: Undo[] = [];
      try {
        for (const entry of movable) {
          const sourcePath = entry.path;
          const destination = normalizePath(`${target.path}/${entry.name}`);
          this.expectEvent("rename", destination, sourcePath, entry instanceof TFolder);
          await this.app.fileManager.renameFile(entry, destination);
          undos.push(async () => {
            this.assertEntryIdentity(
              entry,
              destination,
              entry instanceof TFolder ? TFolder : TFile,
            );
            this.expectEvent("rename", sourcePath, destination, entry instanceof TFolder);
            await this.app.fileManager.renameFile(entry, sourcePath);
          });
        }
        undos.push(async () => {
          await this.applyFileChange(targetNote, targetNotePath, (current) => {
            if (!ownedTargetStates.has(current)) {
              throw new Error(`Cannot safely roll back concurrently modified file: ${targetNotePath}`);
            }
            return originalTarget;
          });
        });
        this.assertEntryIdentity(targetNote, targetNotePath, TFile);
        await this.app.fileManager.processFrontMatter(targetNote, (frontmatter: Record<string, unknown>) => {
          for (const [key, value] of Object.entries(sourceProperties)) {
            if (key !== "position" && !STRUCTURAL_PROPERTIES.has(key) && !(key in frontmatter)) frontmatter[key] = value;
          }
        });
        this.assertEntryIdentity(targetNote, targetNotePath, TFile);
        ownedTargetStates.add(await this.app.vault.read(targetNote));
        const sourceBody = stripFrontmatter(await this.app.vault.read(sourceNote));
        if (/\S/u.test(sourceBody)) {
          this.assertEntryIdentity(targetNote, targetNotePath, TFile);
          await this.app.vault.append(targetNote, `\n\n## Merged from ${source.name}\n\n${sourceBody}`);
          ownedTargetStates.add(await this.app.vault.read(targetNote));
        }
        this.expectEvent("delete", source.path, null, true);
        await this.app.fileManager.trashFile(source);
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
    if (this.getSettings().adoptionState === "managed") {
      result.leafMarkdown = [];
      result.missingNodeNotes = [];
      result.conflicts = result.conflicts.filter(({ reason }) => reason.startsWith("Multiple canonical Node Notes:"));
    }
    const rootCandidates = this.canonicalFiles("");
    if (rootCandidates.length > 1) {
      return {
        ...result,
        conflicts: [{ path: "", reason: `Multiple Root Node Notes: ${rootCandidates.map(({ path }) => path).join(", ")}` }, ...result.conflicts],
      };
    }
    if (rootCandidates.length === 0 && this.getSettings().adoptionState !== "managed") {
      return { ...result, missingNodeNotes: ["", ...result.missingNodeNotes] };
    }
    return result;
  }

  public migrate(expected: MigrationScan, onStep?: (completed: number, total: number) => void): Promise<void> {
    const signal = this.lifecycle.signal;
    return this.exclusive(async () => {
      throwIfAborted(signal);
      const current = this.scan();
      if (scanSignature(current) !== scanSignature(expected)) throw new Error("The Vault changed after preview. Review the structure again before applying changes.");
      await this.migrateUnlocked(current, signal, onStep);
    });
  }

  public repairManagedVault(): Promise<void> {
    const signal = this.lifecycle.signal;
    return this.exclusive(async () => {
      throwIfAborted(signal);
      if (this.getSettings().adoptionState === "managed") {
        const scan = this.scan();
        if (scan.conflicts.length > 0) throw new Error(`Managed Vault contains blocking conflicts: ${scan.conflicts[0]?.reason ?? "unknown conflict"}`);
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
    const frontmatter = note === null ? undefined : this.app.metadataCache.getFileCache(note)?.frontmatter;
    return frontmatter?.[CHILDREN_SORT_PROPERTY] === "manual" ? "manual" : "natural";
  }

  public reorder(folder: TFolder, delta: -1 | 1): Promise<void> {
    return this.exclusive(async () => {
      const parentPath = normalizeVaultPath(folder.parent?.path ?? "");
      const children = this.children(parentPath);
      const index = children.findIndex(({ childPath }) => childPath === folder.path);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= children.length) return;
      const undos: Undo[] = [];
      try { await this.applyPlacementOrder(folder, parentPath, target, undos); }
      catch (error) { await this.rollback(undos, error); }
    });
  }

  public reconcileCreated(path: string): Promise<void> {
    return this.exclusive(async () => {
      // Native creation remains native: a new folder is a folder-only node shell,
      // while a new Markdown file remains an ordinary note until the user invokes
      // an explicit Folder Nodes conversion or creation action.
      void path;
    });
  }

  public reconcileDeleted(path: string): Promise<void> {
    return this.exclusive(async () => {
      // Deleting a Node Note intentionally leaves a folder-only node shell. Never
      // recreate user-deleted content in a background reconciliation pass.
      void path;
    });
  }

  public reconcileRenamed(entry: TAbstractFile, oldPath: string): Promise<void> {
    return this.exclusive(async () => {
      if (this.getSettings().adoptionState !== "managed") return;
      const oldRoot = isSameVaultPath(oldPath, this.rootNotePath());
      const oldCanonical = oldRoot || isCanonicalNodeNote(oldPath);
      const entryScope = entry instanceof TFolder ? entry.path : dirname(entry.path);
      const oldScope = entry instanceof TFolder ? oldPath : dirname(oldPath);
      if (this.isIgnoredPath(entryScope)) return;
      if (entry instanceof TFolder) {
        if (this.isIgnoredPath(oldScope)) return;
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
        return;
      }
      if (entry instanceof TFile && oldCanonical && dirname(entry.path) === dirname(oldPath) && !isCanonicalNodeNote(entry.path)) {
        if (entry.parent !== null) await this.renameNodeUnlockedFromRenamedNote(entry.parent, entry);
      }
    });
  }

  private async placeNodeUnlocked(folder: TFolder, targetParentPath: string, targetIndex: number): Promise<TFolder> {
    targetParentPath = normalizeVaultPath(targetParentPath);
    const sourcePath = normalizeVaultPath(folder.path);
    if (sourcePath === "") throw new Error("The Root Node cannot be moved");
    if (this.isIgnoredPath(sourcePath) || this.isIgnoredPath(targetParentPath)) throw new Error("An unmanaged folder cannot be placed as a Folder Node");
    if (targetParentPath === sourcePath || isDescendantPath(targetParentPath, sourcePath)) throw new Error("A node cannot be moved into itself or a descendant");
    if (targetParentPath !== "" && this.getFolder(targetParentPath) === null) throw new Error(`Unknown target folder: ${targetParentPath}`);
    this.requireCanonicalNote(folder);
    const oldParentPath = normalizeVaultPath(folder.parent?.path ?? "");
    const nextPath = normalizePath(targetParentPath === "" ? folder.name : `${targetParentPath}/${folder.name}`);
    if (oldParentPath !== targetParentPath) await this.assertAvailable(nextPath);

    const undos: Undo[] = [];
    try {
      await this.applyPlacementOrder(folder, targetParentPath, targetIndex, undos);
      if (oldParentPath === targetParentPath) return folder;
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
    if (parts.length === 0) throw new Error("A Node path is required");
    const undos: Undo[] = [];
    let parentPath = "";
    let result: TFile | null = null;
    try {
      for (const [index, part] of parts.entries()) {
        const folderPath = normalizePath(parentPath === "" ? part : `${parentPath}/${part}`);
        if (this.isIgnoredPath(folderPath)) throw new Error(`Folder is unmanaged: ${folderPath}`);
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
    if (this.isIgnoredPath(normalizedParent)) throw new Error(`Folder is unmanaged: ${normalizedParent}`);
    if (normalizedParent !== "" && this.getFolder(normalizedParent) === null) throw new Error(`Unknown parent folder: ${normalizedParent}`);
    const name = sanitizeNodeName(rawName);
    const folderPath = normalizePath(normalizedParent === "" ? name : `${normalizedParent}/${name}`);
    const notePath = `${folderPath}/${name}.md`;
    await this.assertAvailable(folderPath);
    await this.assertAvailable(notePath);
    this.expectEvent("create", folderPath);
    const createdFolder = await this.app.vault.createFolder(folderPath);
    undos.push(() => this.trashCreatedFolder(createdFolder, folderPath));
    this.expectEvent("create", notePath);
    const note = await this.app.vault.create(notePath, createNodeDocument(options.alias?.trim() || null, options.body ?? ""));
    const initialContent = await this.app.vault.read(note);
    undos.push(() => this.trashCreatedFile(note, notePath, initialContent));
    await this.appendRankIfManual(normalizedParent, note, undos);
    return note;
  }

  private async convertLeafNoteUnlocked(file: TFile): Promise<TFile> {
    if (file.extension.toLocaleLowerCase() !== "md") throw new Error(`Not a Markdown note: ${file.path}`);
    if (this.isCanonicalFile(file)) return file;
    const originalPath = file.path;
    const parentPath = normalizeVaultPath(file.parent?.path ?? "");
    const name = sanitizeNodeName(file.basename);
    const folderPath = normalizePath(parentPath === "" ? name : `${parentPath}/${name}`);
    const notePath = `${folderPath}/${name}.md`;
    if (this.isIgnoredPath(folderPath)) throw new Error(`Target belongs to an unmanaged folder: ${folderPath}`);
    const target = this.app.vault.getAbstractFileByPath(folderPath);
    if (target !== null && !(target instanceof TFolder)) throw new Error(`Path already exists: ${folderPath}`);
    if (target === null) await this.assertAvailable(folderPath);
    await this.assertAvailable(notePath, file);
    const undos: Undo[] = [];
    try {
      if (target === null) {
        this.expectEvent("create", folderPath);
        const createdFolder = await this.app.vault.createFolder(folderPath);
        undos.push(() => this.trashCreatedFolder(createdFolder, folderPath));
      }
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
    const name = sanitizeNodeName(renamedNote.basename);
    const sourcePath = folder.path;
    const parentPath = normalizeVaultPath(folder.parent?.path ?? "");
    const nextPath = normalizePath(parentPath === "" ? name : `${parentPath}/${name}`);
    await this.assertAvailable(nextPath);
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

  private async applyPlacementOrder(folder: TFolder, targetParentPath: string, targetIndex: number, undos: Undo[]): Promise<void> {
    const sourcePath = normalizeVaultPath(folder.path);
    const siblings = this.children(targetParentPath).filter(({ childPath }) => childPath !== sourcePath);
    const moved: ChildOrderRecord = { basename: folder.name, childPath: sourcePath, order: this.readRank(this.requireCanonicalNote(folder)) };
    let patches: readonly OrderPatch[];
    if (this.sortMode(targetParentPath) === "natural") {
      const desired = naturalOrder([...siblings, { ...moved, order: null }]);
      const currentIndex = desired.findIndex(({ childPath }) => childPath === sourcePath);
      const [record] = currentIndex < 0 ? [] : desired.splice(currentIndex, 1);
      if (record === undefined) throw new Error(`Unknown child: ${sourcePath}`);
      desired.splice(Math.max(0, Math.min(targetIndex, desired.length)), 0, record);
      patches = desired.flatMap((child, index) => {
        const nextOrder = (index + 1) * 1024;
        return child.order === nextOrder ? [] : [{ childPath: child.childPath, previousOrder: child.order, nextOrder }];
      });
      await this.patchScalarTransactional(this.getCanonicalFile(targetParentPath), CHILDREN_SORT_PROPERTY, "manual", undos);
    } else patches = planReorder([...siblings, moved], sourcePath, targetIndex).patches;
    for (const patch of patches) {
      const note = patch.childPath === sourcePath ? this.requireCanonicalNote(folder) : this.getCanonicalFile(patch.childPath);
      await this.patchScalarTransactional(note, SIBLING_RANK_PROPERTY, patch.nextOrder, undos);
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
    const raw: unknown = note === null ? undefined : this.app.metadataCache.getFileCache(note)?.frontmatter?.[SIBLING_RANK_PROPERTY];
    return typeof raw === "number" && Number.isSafeInteger(raw) && raw > 0 ? raw : null;
  }

  private async appendRankIfManual(parentPath: string, note: TFile, undos: Undo[]): Promise<void> {
    if (this.sortMode(parentPath) !== "manual") return;
    const siblings = this.childRecords(parentPath).filter(({ childPath }) => childPath !== note.parent?.path);
    const max = siblings.reduce((value, child) => Math.max(value, child.order ?? 0), 0);
    if (max > Number.MAX_SAFE_INTEGER - 1024) {
      for (const patch of materializeManualOrder(this.children(parentPath)).patches) await this.patchScalarTransactional(this.getCanonicalFile(patch.childPath), SIBLING_RANK_PROPERTY, patch.nextOrder, undos);
      return;
    }
    await this.patchScalarTransactional(note, SIBLING_RANK_PROPERTY, max + 1024, undos);
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
      const post = this.scan();
      if (post.conflicts.length > 0 || post.leafMarkdown.length > 0 || post.missingNodeNotes.length > 0) throw new Error("Structural validation failed after migration");
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
    return folder.children.filter((entry): entry is TFile => entry instanceof TFile && this.isCanonicalFile(entry));
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

  private async patchScalarTransactional(file: TFile | null, key: string, value: string | number, undos: Undo[]): Promise<void> {
    if (file === null) throw new Error(`Cannot update missing node note: ${key}`);
    const path = file.path;
    const result = await this.applyFileChange(
      file,
      path,
      (current) => patchFrontmatterScalar(current, key, value),
    );
    const { after, before } = result;
    if (after === before) return;
    undos.push(async () => {
      await this.applyFileChange(file, path, (current) => {
        if (current !== after) {
          throw new Error(`Cannot safely roll back concurrently modified file: ${path}`);
        }
        return before;
      });
    });
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

  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    return this.operations.run(operation);
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

function stripFrontmatter(source: string): string {
  const normalized = source.replaceAll("\r\n", "\n");
  if (!normalized.startsWith("---\n")) return normalized;
  const end = normalized.indexOf("\n---\n", 4);
  return end < 0 ? normalized : normalized.slice(end + 5);
}
