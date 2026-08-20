import { App, normalizePath, TAbstractFile, TFile, TFolder } from "obsidian";

import { createNodeDocument, patchFrontmatterScalar } from "../core/frontmatter";
import { scanMigration, type VaultInventory } from "../core/migration";
import { basename, dirname, isCanonicalNodeNote, isDescendantPath, nodeNotePath, sanitizeNodeName } from "../core/paths";
import { compareChildren, materializeManualOrder, planReorder } from "../core/ordering";
import type { ChildOrderRecord, FolderNodesSettings, MigrationScan } from "../core/types";

export class NodeService {
  private readonly suppressed = new Set<string>();

  public constructor(
    private readonly app: App,
    private readonly getSettings: () => FolderNodesSettings,
  ) {}

  public rootNotePath(): string {
    return `${sanitizeNodeName(this.app.vault.getName())}.md`;
  }

  public notePathForFolder(folderPath: string): string {
    return folderPath === "" ? this.rootNotePath() : nodeNotePath(folderPath);
  }

  public getFolder(path: string): TFolder | null {
    const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
    return file instanceof TFolder ? file : null;
  }

  public getNote(path: string): TFile | null {
    const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
    return file instanceof TFile ? file : null;
  }

  public folderForFile(file: TFile | null): TFolder | null {
    if (file === null) return null;
    if (isCanonicalNodeNote(file.path)) return file.parent;
    return file.parent;
  }

  public async openFolderNode(folderPath: string, newLeaf = false): Promise<void> {
    const note = this.getNote(this.notePathForFolder(folderPath));
    if (note === null) return;
    await this.app.workspace.getLeaf(newLeaf).openFile(note);
  }

  public async initialize(): Promise<void> {
    const path = this.rootNotePath();
    if (this.getNote(path) === null) await this.app.vault.create(path, "");
  }

  public async createNode(
    parentPath: string,
    rawName: string,
    options: { alias?: string; body?: string } = {},
  ): Promise<TFile> {
    const name = sanitizeNodeName(rawName);
    const folderPath = normalizePath(parentPath === "" ? name : `${parentPath}/${name}`);
    const notePath = `${folderPath}/${name}.md`;
    if (this.app.vault.getAbstractFileByPath(folderPath) !== null || this.app.vault.getAbstractFileByPath(notePath) !== null) {
      throw new Error(`Path already exists: ${folderPath}`);
    }
    this.suppressed.add(folderPath);
    this.suppressed.add(notePath);
    try {
      await this.app.vault.createFolder(folderPath);
      let body = options.body ?? "";
      const templatePath = this.getSettings().defaultNodeTemplatePath.trim();
      const template = templatePath === "" ? null : this.getNote(templatePath);
      if (template !== null && body === "") body = await this.app.vault.read(template);
      const note = await this.app.vault.create(
        notePath,
        createNodeDocument(options.alias?.trim() || null, body),
      );
      await this.appendOrderIfManual(parentPath, note);
      return note;
    } finally {
      this.suppressed.delete(folderPath);
      this.suppressed.delete(notePath);
    }
  }

  public async renameNode(folder: TFolder, rawName: string): Promise<TFolder> {
    const name = sanitizeNodeName(rawName);
    const oldName = folder.name;
    const parentPath = folder.parent?.path ?? "";
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
    if (targetParentPath === folder.path || isDescendantPath(targetParentPath, folder.path)) {
      throw new Error("A node cannot be moved into itself or a descendant");
    }
    const nextPath = normalizePath(targetParentPath === "" ? folder.name : `${targetParentPath}/${folder.name}`);
    if (this.app.vault.getAbstractFileByPath(nextPath) !== null) throw new Error(`Path already exists: ${nextPath}`);
    await this.app.vault.rename(folder, nextPath);
    const moved = this.getFolder(nextPath);
    if (moved === null) throw new Error("Moved folder was not found");
    const note = this.getNote(nodeNotePath(nextPath));
    if (note !== null) await this.appendOrderIfManual(targetParentPath, note);
    return moved;
  }

  public async deleteNode(folder: TFolder): Promise<void> {
    await this.app.fileManager.trashFile(folder);
  }

  public inventory(): VaultInventory {
    const folders: string[] = [];
    const markdown: string[] = [];
    for (const file of this.app.vault.getAllLoadedFiles()) {
      if (file.path === this.app.vault.configDir || file.path.startsWith(`${this.app.vault.configDir}/`)) continue;
      if (file instanceof TFolder && file.path !== "") folders.push(file.path);
      if (file instanceof TFile && file.extension.toLocaleLowerCase() === "md" && file.path !== this.rootNotePath()) markdown.push(file.path);
    }
    return { folders, markdown };
  }

  public scan(): MigrationScan {
    const result = scanMigration(this.inventory());
    const root = this.rootNotePath();
    const rootExists = this.getNote(root) !== null;
    return rootExists ? result : { ...result, missingNodeNotes: ["", ...result.missingNodeNotes] };
  }

  public async migrate(scan: MigrationScan, onStep?: (completed: number, total: number) => void): Promise<void> {
    if (scan.conflicts.length > 0) throw new Error("Migration contains blocking conflicts");
    const total = scan.leafMarkdown.length + scan.missingNodeNotes.length;
    let completed = 0;
    for (const path of scan.leafMarkdown) {
      const note = this.getNote(path);
      if (note === null) continue;
      const parent = dirname(path);
      const name = basename(path).slice(0, -3);
      const folderPath = normalizePath(parent === "" ? name : `${parent}/${name}`);
      if (this.getFolder(folderPath) === null) await this.app.vault.createFolder(folderPath);
      await this.app.fileManager.renameFile(note, `${folderPath}/${name}.md`);
      onStep?.(++completed, total);
    }
    const folders = ["", ...this.inventory().folders];
    for (const folderPath of folders) {
      const notePath = this.notePathForFolder(folderPath);
      if (this.getNote(notePath) === null) await this.app.vault.create(notePath, "");
      if (scan.missingNodeNotes.includes(folderPath)) onStep?.(++completed, total);
    }
  }

  public children(parentPath: string): ChildOrderRecord[] {
    const parent = parentPath === "" ? this.app.vault.getRoot() : this.getFolder(parentPath);
    if (parent === null) return [];
    return parent.children.filter((child): child is TFolder => child instanceof TFolder).map((child) => {
      const note = this.getNote(nodeNotePath(child.path));
      const cache = note === null ? null : this.app.metadataCache.getFileCache(note);
      const rawOrder = cache?.frontmatter?.folderNodeOrder as unknown;
      return {
        basename: child.name,
        childPath: child.path,
        order: typeof rawOrder === "number" && Number.isSafeInteger(rawOrder) ? rawOrder : null,
      };
    }).sort(compareChildren);
  }

  public sortMode(parentPath: string): "natural" | "manual" {
    const note = this.getNote(this.notePathForFolder(parentPath));
    const raw: unknown = note === null ? null : this.app.metadataCache.getFileCache(note)?.frontmatter?.folderNodeSort;
    return raw === "manual" ? "manual" : "natural";
  }

  public async reorder(folder: TFolder, delta: -1 | 1): Promise<void> {
    const parentPath = folder.parent?.path ?? "";
    const children = this.children(parentPath);
    const index = children.findIndex(({ childPath }) => childPath === folder.path);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= children.length) return;
    if (this.sortMode(parentPath) !== "manual") {
      await this.patchScalar(this.getNote(this.notePathForFolder(parentPath)), "folderNodeSort", "manual");
      await this.applyOrderPatches(materializeManualOrder(children).patches);
    }
    await this.applyOrderPatches(planReorder(this.children(parentPath), folder.path, target).patches);
  }

  public async reconcileCreated(path: string): Promise<void> {
    if (this.getSettings().adoptionState !== "managed" || this.suppressed.has(path)) return;
    const entry = this.app.vault.getAbstractFileByPath(path);
    if (entry instanceof TFolder) {
      const notePath = nodeNotePath(entry.path);
      if (this.getNote(notePath) === null) await this.app.vault.create(notePath, "");
      return;
    }
    if (entry instanceof TFile && entry.extension.toLocaleLowerCase() === "md" && !isCanonicalNodeNote(entry.path) && entry.path !== this.rootNotePath()) {
      const parent = dirname(entry.path);
      const name = entry.basename;
      const targetFolder = normalizePath(parent === "" ? name : `${parent}/${name}`);
      if (this.app.vault.getAbstractFileByPath(targetFolder) === null) {
        await this.app.vault.createFolder(targetFolder);
        await this.app.fileManager.renameFile(entry, `${targetFolder}/${name}.md`);
      }
    }
  }

  public async reconcileDeleted(path: string): Promise<void> {
    if (this.getSettings().adoptionState !== "managed" || !isCanonicalNodeNote(path)) return;
    const folderPath = dirname(path);
    if (this.getFolder(folderPath) !== null && this.getNote(path) === null) await this.app.vault.create(path, "");
  }

  public async reconcileRenamed(entry: TAbstractFile, oldPath: string): Promise<void> {
    if (this.getSettings().adoptionState !== "managed") return;
    if (entry instanceof TFolder) {
      const oldName = basename(oldPath);
      const staleNote = this.getNote(`${entry.path}/${oldName}.md`);
      const canonicalPath = nodeNotePath(entry.path);
      if (staleNote !== null && this.getNote(canonicalPath) === null) {
        await this.app.fileManager.renameFile(staleNote, canonicalPath);
      }
      return;
    }
    if (entry instanceof TFile && isCanonicalNodeNote(oldPath) && entry.parent !== null && dirname(entry.path) === dirname(oldPath) && !isCanonicalNodeNote(entry.path)) {
      await this.renameNode(entry.parent, entry.basename);
    }
  }
  private async appendOrderIfManual(parentPath: string, note: TFile): Promise<void> {
    if (this.sortMode(parentPath) !== "manual") return;
    const max = this.children(parentPath).reduce((value, child) => Math.max(value, child.order ?? 0), 0);
    await this.patchScalar(note, "folderNodeOrder", Math.min(max + 1024, Number.MAX_SAFE_INTEGER));
  }

  private async applyOrderPatches(patches: readonly { childPath: string; nextOrder: number }[]): Promise<void> {
    for (const patch of patches) {
      await this.patchScalar(this.getNote(nodeNotePath(patch.childPath)), "folderNodeOrder", patch.nextOrder);
    }
  }

  private async patchScalar(file: TFile | null, key: string, value: string | number): Promise<void> {
    if (file === null) throw new Error(`Cannot update missing node note: ${key}`);
    await this.app.vault.process(file, (source) => patchFrontmatterScalar(source, key, value));
  }
}
