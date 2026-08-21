import { App, normalizePath, TAbstractFile, TFile, TFolder } from "obsidian";

import { matchesFolderExemption, matchesLeafNoteExemption } from "../core/exemptions";
import { createNodeDocument, patchFrontmatterScalar } from "../core/frontmatter";
import { scanMigration, type VaultInventory } from "../core/migration";
import { compareChildren, materializeManualOrder, planReorder } from "../core/ordering";
import { basename, dirname, isCanonicalNodeNote, isDescendantPath, nodeNotePath, normalizeVaultPath, sanitizeNodeName } from "../core/paths";
import {
  CHILDREN_SORT_PROPERTY,
  SIBLING_RANK_PROPERTY,
} from "../core/properties";
import type { ChildOrderRecord, FolderNodesSettings, MigrationScan, NodeDropZone } from "../core/types";

const STRUCTURAL_PROPERTIES = new Set([
  CHILDREN_SORT_PROPERTY,
  SIBLING_RANK_PROPERTY,
]);

export class NodeService {
  private readonly suppressed = new Set<string>();

  public constructor(
    private readonly app: App,
    private readonly getSettings: () => FolderNodesSettings,
  ) {}

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

  public getNote(path: string): TFile | null {
    const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
    return file instanceof TFile ? file : null;
  }

  public folderForFile(file: TFile | null): TFolder | null { return file?.parent ?? null; }

  public async openFolderNode(folderPath: string, newLeaf = false): Promise<void> {
    const note = this.getNote(this.notePathForFolder(folderPath));
    if (note !== null) await this.app.workspace.getLeaf(newLeaf).openFile(note);
  }

  public async initialize(): Promise<void> {
    const path = this.rootNotePath();
    if (this.getNote(path) === null) await this.app.vault.create(path, "");
  }

  public isIgnoredPath(path: string): boolean {
    const settings = this.getSettings();
    return matchesFolderExemption(path, [...settings.ignoredFolders, this.app.vault.configDir], settings.ignoredFolderPrefixes);
  }

  public isLeafNoteExempt(path: string): boolean {
    const settings = this.getSettings();
    return matchesLeafNoteExemption(path, settings.leafNoteExemptions, settings.leafNotePrefixes);
  }

  public async createNode(
    parentPath: string,
    rawName: string,
    options: { alias?: string; body?: string } = {},
  ): Promise<TFile> {
    const normalizedParent = normalizeVaultPath(parentPath);
    if (this.isIgnoredPath(normalizedParent)) throw new Error(`Folder is unmanaged: ${normalizedParent}`);
    const name = sanitizeNodeName(rawName);
    const folderPath = normalizePath(normalizedParent === "" ? name : `${normalizedParent}/${name}`);
    const notePath = `${folderPath}/${name}.md`;
    if (this.app.vault.getAbstractFileByPath(folderPath) !== null || this.app.vault.getAbstractFileByPath(notePath) !== null) {
      throw new Error(`Path already exists: ${folderPath}`);
    }
    this.suppressed.add(folderPath);
    this.suppressed.add(notePath);
    try {
      await this.app.vault.createFolder(folderPath);
      const note = await this.app.vault.create(notePath, createNodeDocument(options.alias?.trim() || null, options.body ?? ""));
      await this.appendRankIfManual(normalizedParent, note);
      return note;
    } finally {
      this.suppressed.delete(folderPath);
      this.suppressed.delete(notePath);
    }
  }

  public async createMissingNodeNote(folder: TFolder): Promise<TFile> {
    if (this.isIgnoredPath(folder.path)) throw new Error(`Folder is unmanaged: ${folder.path}`);
    const notePath = this.notePathForFolder(folder.path);
    const existing = this.getNote(notePath);
    if (existing !== null) return existing;
    return this.app.vault.create(notePath, "");
  }

  public async convertLeafNote(file: TFile): Promise<TFile> {
    if (file.extension.toLocaleLowerCase() !== "md") throw new Error(`Not a Markdown note: ${file.path}`);
    const parentPath = normalizeVaultPath(file.parent?.path ?? "");
    const name = sanitizeNodeName(file.basename);
    const folderPath = normalizePath(parentPath === "" ? name : `${parentPath}/${name}`);
    const notePath = `${folderPath}/${name}.md`;
    if (this.isIgnoredPath(folderPath)) throw new Error(`Target belongs to an unmanaged folder: ${folderPath}`);
    const target = this.app.vault.getAbstractFileByPath(folderPath);
    if (target !== null && !(target instanceof TFolder)) throw new Error(`Path already exists: ${folderPath}`);
    const targetNote = this.app.vault.getAbstractFileByPath(notePath);
    if (targetNote !== null && targetNote !== file) throw new Error(`Path already exists: ${notePath}`);
    if (target === null) await this.app.vault.createFolder(folderPath);
    await this.app.fileManager.renameFile(file, notePath);
    const result = this.getNote(notePath);
    if (result === null) throw new Error("Converted Node Note was not found");
    return result;
  }

  public async useAsNodeNote(folder: TFolder, file: TFile): Promise<TFile> {
    if (file.parent !== folder) throw new Error("The note is not inside the selected folder");
    if (this.isIgnoredPath(folder.path)) throw new Error(`Folder is unmanaged: ${folder.path}`);
    const notePath = this.notePathForFolder(folder.path);
    if (this.getNote(notePath) !== null) throw new Error(`Node Note already exists: ${notePath}`);
    await this.app.fileManager.renameFile(file, notePath);
    const result = this.getNote(notePath);
    if (result === null) throw new Error("Repaired Node Note was not found");
    return result;
  }

  public async renameNode(folder: TFolder, rawName: string): Promise<TFolder> {
    if (this.isIgnoredPath(folder.path)) throw new Error(`Folder is unmanaged: ${folder.path}`);
    const name = sanitizeNodeName(rawName);
    const oldName = folder.name;
    const parentPath = normalizeVaultPath(folder.parent?.path ?? "");
    const nextPath = normalizePath(parentPath === "" ? name : `${parentPath}/${name}`);
    if (this.app.vault.getAbstractFileByPath(nextPath) !== null) throw new Error(`Path already exists: ${nextPath}`);
    await this.app.vault.rename(folder, nextPath);
    const oldNoteAtNewLocation = this.getNote(`${nextPath}/${oldName}.md`);
    if (oldNoteAtNewLocation !== null) await this.app.fileManager.renameFile(oldNoteAtNewLocation, `${nextPath}/${name}.md`);
    const result = this.getFolder(nextPath);
    if (result === null) throw new Error("Renamed folder was not found");
    return result;
  }

  public async moveNode(folder: TFolder, targetParentPath: string): Promise<TFolder> {
    return this.placeNode(folder, targetParentPath, this.children(targetParentPath).length);
  }

  public async placeNodeRelative(source: TFolder, target: TFolder, zone: NodeDropZone): Promise<TFolder> {
    if (zone === "into") {
      const index = this.children(target.path).filter(({ childPath }) => childPath !== source.path).length;
      return this.placeNode(source, target.path, index);
    }
    const parentPath = normalizeVaultPath(target.parent?.path ?? "");
    const siblings = this.children(parentPath).filter(({ childPath }) => childPath !== source.path);
    const targetIndex = siblings.findIndex(({ childPath }) => childPath === target.path);
    return this.placeNode(source, parentPath, Math.max(0, targetIndex + (zone === "after" ? 1 : 0)));
  }

  public async placeNode(folder: TFolder, targetParentPath: string, targetIndex: number): Promise<TFolder> {
    targetParentPath = normalizeVaultPath(targetParentPath);
    if (this.isIgnoredPath(folder.path) || this.isIgnoredPath(targetParentPath)) throw new Error("An unmanaged folder cannot be placed as a Folder Node");
    if (targetParentPath === folder.path || isDescendantPath(targetParentPath, folder.path)) {
      throw new Error("A node cannot be moved into itself or a descendant");
    }
    const oldParentPath = normalizeVaultPath(folder.parent?.path ?? "");
    await this.ensureManualSort(targetParentPath);
    if (oldParentPath === targetParentPath) {
      await this.applyOrderPatches(planReorder(this.children(targetParentPath), folder.path, targetIndex).patches);
      return folder;
    }
    const nextPath = normalizePath(targetParentPath === "" ? folder.name : `${targetParentPath}/${folder.name}`);
    if (this.app.vault.getAbstractFileByPath(nextPath) !== null) throw new Error(`Path already exists: ${nextPath}`);
    await this.app.vault.rename(folder, nextPath);
    const moved = this.getFolder(nextPath);
    if (moved === null) throw new Error("Moved folder was not found");
    await this.applyOrderPatches(planReorder(this.children(targetParentPath), moved.path, targetIndex).patches);
    return moved;
  }

  public async deleteNode(folder: TFolder): Promise<void> {
    if (this.isIgnoredPath(folder.path)) throw new Error(`Folder is unmanaged: ${folder.path}`);
    await this.app.fileManager.trashFile(folder);
  }

  public async moveFile(file: TFile, targetFolderPath: string): Promise<void> {
    targetFolderPath = normalizeVaultPath(targetFolderPath);
    const target = targetFolderPath === "" ? this.app.vault.getRoot() : this.getFolder(targetFolderPath);
    if (target === null) throw new Error(`Unknown target folder: ${targetFolderPath}`);
    if (file.parent !== null && this.notePathForFolder(file.parent.path) === file.path) {
      throw new Error(`Cannot move canonical Node Note: ${file.path}`);
    }
    const normalizedTarget = normalizeVaultPath(target.path);
    const nextPath = normalizePath(normalizedTarget === "" ? file.name : `${normalizedTarget}/${file.name}`);
    if (nextPath === file.path) return;
    if (this.app.vault.getAbstractFileByPath(nextPath) !== null) throw new Error(`Path already exists: ${nextPath}`);
    await this.app.fileManager.renameFile(file, nextPath);
  }

  public async renameFile(file: TFile, rawName: string): Promise<void> {
    const name = rawName.trim();
    if (name === "" || name.includes("/") || name.includes("\\")) throw new Error(`Invalid file name: ${rawName}`);
    const parentPath = normalizeVaultPath(file.parent?.path ?? "");
    const nextPath = normalizePath(parentPath === "" ? name : `${parentPath}/${name}`);
    if (nextPath === file.path) return;
    if (this.app.vault.getAbstractFileByPath(nextPath) !== null) throw new Error(`Path already exists: ${nextPath}`);
    await this.app.fileManager.renameFile(file, nextPath);
  }

  public async deleteFile(file: TFile): Promise<void> {
    if (file.parent !== null && this.notePathForFolder(file.parent.path) === file.path) {
      throw new Error(`Cannot delete canonical Node Note: ${file.path}`);
    }
    await this.app.fileManager.trashFile(file);
  }

  public async mergeNode(source: TFolder, target: TFolder): Promise<void> {
    if (this.isIgnoredPath(source.path) || this.isIgnoredPath(target.path)) throw new Error("An unmanaged folder cannot be merged as a Folder Node");
    if (source.path === target.path || isDescendantPath(target.path, source.path)) {
      throw new Error("A node cannot be merged into itself or a descendant");
    }
    const sourceNote = this.getNote(this.notePathForFolder(source.path));
    const targetNote = this.getNote(this.notePathForFolder(target.path));
    if (sourceNote === null || targetNote === null) throw new Error("Both nodes must have canonical notes");
    const movable = source.children.filter((entry) => entry.path !== sourceNote.path);
    for (const entry of movable) {
      const destination = normalizePath(`${target.path}/${entry.name}`);
      if (this.app.vault.getAbstractFileByPath(destination) !== null) throw new Error(`Merge conflict: ${destination}`);
    }
    const sourceProperties = this.app.metadataCache.getFileCache(sourceNote)?.frontmatter ?? {};
    const targetProperties = this.app.metadataCache.getFileCache(targetNote)?.frontmatter ?? {};
    for (const [key, value] of Object.entries(sourceProperties)) {
      if (key === "position" || STRUCTURAL_PROPERTIES.has(key)) continue;
      if (key in targetProperties && JSON.stringify(targetProperties[key]) !== JSON.stringify(value)) {
        throw new Error(`Merge property conflict: ${key}`);
      }
    }
    await this.app.fileManager.processFrontMatter(targetNote, (frontmatter: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(sourceProperties)) {
        if (key !== "position" && !STRUCTURAL_PROPERTIES.has(key) && !(key in frontmatter)) frontmatter[key] = value;
      }
    });
    const sourceBody = stripFrontmatter(await this.app.vault.read(sourceNote)).trim();
    if (sourceBody !== "") {
      await this.app.vault.append(targetNote, `\n\n## Merged from ${source.name}\n\n${sourceBody}\n`);
    }
    for (const entry of movable) await this.app.vault.rename(entry, normalizePath(`${target.path}/${entry.name}`));
    await this.app.fileManager.trashFile(source);
  }

  public inventory(): VaultInventory {
    const folders: string[] = [];
    const markdown: string[] = [];
    for (const file of this.app.vault.getAllLoadedFiles()) {
      if (file.path === this.app.vault.configDir || file.path.startsWith(`${this.app.vault.configDir}/`)) continue;
      if (file instanceof TFolder && normalizeVaultPath(file.path) !== "") folders.push(normalizeVaultPath(file.path));
      if (file instanceof TFile && file.extension.toLocaleLowerCase() === "md" && file.path !== this.rootNotePath()) markdown.push(file.path);
    }
    return { folders, markdown };
  }

  public scan(): MigrationScan {
    const result = scanMigration(this.inventory(), {
      folders: this.getSettings().ignoredFolders,
      folderPrefixes: this.getSettings().ignoredFolderPrefixes,
      leafMarkdown: this.getSettings().leafNoteExemptions,
      leafMarkdownPrefixes: this.getSettings().leafNotePrefixes,
    });
    const rootExists = this.getNote(this.rootNotePath()) !== null;
    return rootExists ? result : { ...result, missingNodeNotes: ["", ...result.missingNodeNotes] };
  }

  public async migrate(scan: MigrationScan, onStep?: (completed: number, total: number) => void): Promise<void> {
    if (scan.conflicts.length > 0) throw new Error("Migration contains blocking conflicts");
    const total = scan.leafMarkdown.length + scan.missingNodeNotes.length;
    let completed = 0;
    for (const path of scan.leafMarkdown) {
      const note = this.getNote(path);
      if (note !== null) {
        const parent = dirname(path);
        const name = basename(path).slice(0, -3);
        const folderPath = normalizePath(parent === "" ? name : `${parent}/${name}`);
        if (this.getFolder(folderPath) === null) await this.app.vault.createFolder(folderPath);
        await this.app.fileManager.renameFile(note, `${folderPath}/${name}.md`);
      }
      onStep?.(++completed, total);
    }
    for (const folderPath of scan.missingNodeNotes) {
      const notePath = this.notePathForFolder(folderPath);
      if (this.getNote(notePath) === null) await this.app.vault.create(notePath, "");
      onStep?.(++completed, total);
    }
  }

  public children(parentPath: string): ChildOrderRecord[] {
    parentPath = normalizeVaultPath(parentPath);
    const parent = parentPath === "" ? this.app.vault.getRoot() : this.getFolder(parentPath);
    if (parent === null) return [];
    return parent.children.filter((child): child is TFolder => child instanceof TFolder && !this.isIgnoredPath(child.path)).map((child) => {
      const note = this.getNote(nodeNotePath(child.path));
      const frontmatter = note === null ? undefined : this.app.metadataCache.getFileCache(note)?.frontmatter;
      const rawRank: unknown = frontmatter?.[SIBLING_RANK_PROPERTY] as unknown;
      return {
        basename: child.name,
        childPath: child.path,
        order: typeof rawRank === "number" && Number.isSafeInteger(rawRank) && rawRank > 0 ? rawRank : null,
      };
    }).sort(compareChildren);
  }

  public sortMode(parentPath: string): "natural" | "manual" {
    const note = this.getNote(this.notePathForFolder(parentPath));
    const frontmatter = note === null ? undefined : this.app.metadataCache.getFileCache(note)?.frontmatter;
    const raw: unknown = frontmatter?.[CHILDREN_SORT_PROPERTY];
    return raw === "manual" ? "manual" : "natural";
  }

  public async reorder(folder: TFolder, delta: -1 | 1): Promise<void> {
    const parentPath = normalizeVaultPath(folder.parent?.path ?? "");
    const children = this.children(parentPath);
    const index = children.findIndex(({ childPath }) => childPath === folder.path);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= children.length) return;
    await this.ensureManualSort(parentPath);
    await this.applyOrderPatches(planReorder(this.children(parentPath), folder.path, target).patches);
  }

  public async reconcileCreated(path: string): Promise<void> {
    if (this.getSettings().adoptionState !== "managed" || this.suppressed.has(path)) return;
    const entry = this.app.vault.getAbstractFileByPath(path);
    if (this.isIgnoredPath(entry instanceof TFolder ? path : dirname(path))) return;
    if (entry instanceof TFolder) {
      const notePath = nodeNotePath(entry.path);
      if (this.getNote(notePath) === null) await this.app.vault.create(notePath, "");
      return;
    }
    if (entry instanceof TFile && entry.extension.toLocaleLowerCase() === "md" && !isCanonicalNodeNote(entry.path) && entry.path !== this.rootNotePath() && !this.isLeafNoteExempt(entry.path)) {
      await this.convertLeafNote(entry);
    }
  }

  public async reconcileDeleted(path: string): Promise<void> {
    if (this.getSettings().adoptionState !== "managed" || this.isIgnoredPath(dirname(path)) || !isCanonicalNodeNote(path)) return;
    const folderPath = dirname(path);
    if (this.getFolder(folderPath) !== null && this.getNote(path) === null) await this.app.vault.create(path, "");
  }

  public async reconcileRenamed(entry: TAbstractFile, oldPath: string): Promise<void> {
    const entryScope = entry instanceof TFolder ? entry.path : dirname(entry.path);
    const oldScope = entry instanceof TFolder ? oldPath : dirname(oldPath);
    if (this.getSettings().adoptionState !== "managed" || this.isIgnoredPath(entryScope)) return;
    if (this.isIgnoredPath(oldScope)) {
      if (entry instanceof TFolder) {
        const notePath = nodeNotePath(entry.path);
        if (this.getNote(notePath) === null) await this.app.vault.create(notePath, "");
      } else {
        await this.reconcileCreated(entry.path);
      }
      return;
    }
    if (entry instanceof TFolder) {
      const oldName = basename(oldPath);
      const staleNote = this.getNote(`${entry.path}/${oldName}.md`);
      const canonicalPath = nodeNotePath(entry.path);
      if (staleNote !== null && this.getNote(canonicalPath) === null) await this.app.fileManager.renameFile(staleNote, canonicalPath);
      return;
    }
    if (entry instanceof TFile && isCanonicalNodeNote(oldPath) && entry.parent !== null && dirname(entry.path) === dirname(oldPath) && !isCanonicalNodeNote(entry.path)) {
      await this.renameNode(entry.parent, entry.basename);
      return;
    }
    if (entry instanceof TFile && entry.extension.toLocaleLowerCase() === "md" && !isCanonicalNodeNote(entry.path) && entry.path !== this.rootNotePath() && !this.isLeafNoteExempt(entry.path)) {
      await this.reconcileCreated(entry.path);
    }
  }

  private async ensureManualSort(parentPath: string): Promise<void> {
    if (this.sortMode(parentPath) === "manual") return;
    await this.patchScalar(this.getNote(this.notePathForFolder(parentPath)), CHILDREN_SORT_PROPERTY, "manual");
    await this.applyOrderPatches(materializeManualOrder(this.children(parentPath)).patches);
  }

  private async appendRankIfManual(parentPath: string, note: TFile): Promise<void> {
    if (this.sortMode(parentPath) !== "manual") return;
    const max = this.children(parentPath).reduce((value, child) => Math.max(value, child.order ?? 0), 0);
    await this.patchScalar(note, SIBLING_RANK_PROPERTY, Math.min(max + 1024, Number.MAX_SAFE_INTEGER));
  }

  private async applyOrderPatches(patches: readonly { childPath: string; nextOrder: number }[]): Promise<void> {
    for (const patch of patches) await this.patchScalar(this.getNote(nodeNotePath(patch.childPath)), SIBLING_RANK_PROPERTY, patch.nextOrder);
  }

  private async patchScalar(file: TFile | null, key: string, value: string | number): Promise<void> {
    if (file === null) throw new Error(`Cannot update missing node note: ${key}`);
    await this.app.vault.process(file, (source) => patchFrontmatterScalar(source, key, value));
  }
}

function stripFrontmatter(source: string): string {
  const normalized = source.replaceAll("\r\n", "\n");
  if (!normalized.startsWith("---\n")) return normalized;
  const end = normalized.indexOf("\n---\n", 4);
  return end < 0 ? normalized : normalized.slice(end + 5);
}
