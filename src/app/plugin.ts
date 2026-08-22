import { Editor, Menu, Notice, Plugin, TAbstractFile, TFile, TFolder } from "obsidian";

import { ExplorerAdapter } from "../adapters/explorer-adapter";
import { NodeService } from "../adapters/node-service";
import { VisualService } from "../adapters/visual-service";
import { buildNodeName } from "../core/naming";
import { classifyFileIdentity, classifyFolderIdentity } from "../core/identity";
import { normalizeVaultPath, sanitizeNodeName } from "../core/paths";
import type { FolderNodesSettings } from "../core/types";
import { DEFAULT_SETTINGS, normalizeSettings } from "../shared/settings";
import { FolderNodeContentsView, CONTENTS_VIEW_TYPE, type ContentsMenuAnchor } from "../ui/contents-view";
import { CONTENTS_MENU_SOURCE } from "../ui/contents-interactions";
import { MigrationModal } from "../ui/migration-modal";
import { ConfirmModal, PromptModal } from "../ui/prompt-modal";
import { SelectionCreateModal } from "../ui/selection-create-modal";
import { VisualPickerModal } from "../ui/visual-picker-modal";
import { formatError, setLanguage, t } from "../ui/i18n";
import { FolderNodesSettingTab } from "./settings-tab";

export default class FolderNodesPlugin extends Plugin {
  public override settings: FolderNodesSettings = structuredClone(DEFAULT_SETTINGS);
  public service!: NodeService;
  public visuals!: VisualService;
  private explorer!: ExplorerAdapter;
  private reconcileBatches = new Map<string, { timer: number; entries: Map<string, "create" | "delete"> }>();
  private reconciliationReady = false;
  private reconcileNoticeTimer: number | null = null;
  private reconcileErrorCount = 0;
  private reconcileErrorMessages = new Set<string>();

  public override async onload(): Promise<void> {
    this.settings = normalizeSettings(await this.loadData());
    setLanguage(this.settings.language);
    this.service = new NodeService(this.app, () => this.settings);
    this.visuals = new VisualService(this.app, this.service, () => this.settings.iconInheritance);
    this.explorer = new ExplorerAdapter(
      this.app,
      this.service,
      this.visuals,
      () => this.settings,
      () => ({ root: t("root"), node: t("node"), nodeConflict: t("nodeConflict"), missingNodeNote: t("missingNodeNote"), missingNodeFolder: t("missingNodeFolder") }),
      () => this.refreshVisuals(),
      (error) => new Notice(formatError(error), 8000),
    );
    this.addChild(this.explorer);
    this.registerView(CONTENTS_VIEW_TYPE, (leaf) => new FolderNodeContentsView(leaf, this.service, this.visuals, {
      createChild: (folder) => this.promptCreateChild(folder),
      createMissingNote: (folder) => void this.createAndOpenMissingNote(folder),
      nodeMenu: (event, folder) => this.openNodeMenu(event, folder),
      entryMenu: (anchor, entry, sourceFolder) => this.openEntryMenu(anchor, entry, sourceFolder),
      problemMenu: (anchor, entry) => this.openProblemMenu(anchor, entry),
      editVisual: (folder) => this.promptVisual(folder),
      openHomepage: () => void this.openHomepage(),
      homepageEnabled: () => this.settings.homepageEnabled,
      initialized: () => this.settings.adoptionState === "managed",
      initialize: () => this.openMaintenance(),
      refresh: () => this.refreshVisuals(),
      reportError: (error) => new Notice(formatError(error), 8000),
    }));
    this.addSettingTab(new FolderNodesSettingTab(this.app, this));
    this.addRibbonIcon("layout-grid", t("contents"), () => void this.openContents());
    this.registerCommands();
    this.registerEvents();
    this.app.workspace.onLayoutReady(() => {
      this.explorer.start();
      this.reconciliationReady = true;
      if (this.settings.homepageEnabled && this.settings.openHomepageOnStartup) void this.openHomepage();
    });
  }

  public override onunload(): void {
    for (const batch of this.reconcileBatches.values()) window.clearTimeout(batch.timer);
    this.reconcileBatches.clear();
    if (this.reconcileNoticeTimer !== null) window.clearTimeout(this.reconcileNoticeTimer);
    this.reconcileNoticeTimer = null;
  }

  public async saveSettings(): Promise<void> { await this.saveData(this.settings); }

  public previewSelectionName(selection: string): string {
    const file = this.app.workspace.getActiveFile();
    return sanitizeNodeName(buildNodeName({
      selection,
      currentFile: file?.basename ?? t("currentFile"),
      currentNode: file?.parent?.name ?? this.app.vault.getName(),
      currentHeading: t("currentHeading"),
      now: new Date(),
    }, this.settings.prefix, this.settings.suffix, this.settings.timestampFormat));
  }

  public refreshVisuals(): void {
    this.explorer.refresh();
    for (const leaf of this.app.workspace.getLeavesOfType(CONTENTS_VIEW_TYPE)) {
      if (leaf.view instanceof FolderNodeContentsView) leaf.view.refresh();
    }
  }

  public openMaintenance(): void { this.showScan(false); }
  public showHealth(): void { this.showScan(true); }

  public async openHomepage(): Promise<void> {
    if (!this.settings.homepageEnabled) {
      new Notice(t("homepageDisabled"));
      return;
    }
    const note = this.service.getNote(this.service.rootNotePath());
    if (note === null) {
      new Notice(t("homepageMissing"), 8000);
      return;
    }
    await this.app.workspace.getLeaf(false).openFile(note);
  }

  public promptCreateChild(parent = this.currentFolder()): void {
    const target = parent ?? this.app.vault.getRoot();
    new PromptModal(this.app, t("createChild"), "", t("create"), async (name) => {
      const note = await this.service.createNode(target.path, name);
      await this.app.workspace.getLeaf(false).openFile(note);
      this.refreshVisuals();
    }).open();
  }

  public openProblemMenu(anchor: ContentsMenuAnchor, entry: TFolder | TFile): void {
    const menu = new Menu();
    this.addProblemMenuItems(menu, entry);
    this.app.workspace.trigger("file-menu", menu, entry, CONTENTS_MENU_SOURCE);
    this.showMenu(menu, anchor);
  }

  private addProblemMenuItems(menu: Menu, entry: TFolder | TFile): void {
    if (entry instanceof TFolder) {
      menu.addItem((item) => item.setTitle(t("createMissingNodeNote")).setIcon("file-plus").onClick(() => {
        void this.runRepair(async () => { await this.service.createMissingNodeNote(entry); });
      }));
      menu.addItem((item) => item.setTitle(t("renameFolderToMatch")).setIcon("pencil").onClick(() => this.promptRename(entry)));
      menu.addItem((item) => item.setTitle(t("contents")).setIcon("layout-grid").onClick(() => void this.openContents(entry)));
    } else {
      menu.addItem((item) => item.setTitle(t("open")).setIcon("file").onClick(() => void this.app.workspace.getLeaf(false).openFile(entry)));
      menu.addItem((item) => item.setTitle(t("convertToNode")).setIcon("folder-plus").onClick(() => {
        void this.runRepair(async () => { await this.service.convertLeafNote(entry); });
      }));
      const parent = entry.parent;
      if (parent !== null && this.service.getNote(this.service.notePathForFolder(parent.path)) === null) {
        menu.addItem((item) => item.setTitle(t("useAsNodeNote")).setIcon("file-check").onClick(() => {
          void this.runRepair(async () => { await this.service.useAsNodeNote(parent, entry); });
        }));
        if (normalizeVaultPath(parent.path) !== "") menu.addItem((item) => item.setTitle(t("renameFolderToMatch")).setIcon("folder-cog").onClick(() => {
          void this.runRepair(async () => { await this.service.renameNode(parent, entry.basename); });
        }));
      }
      menu.addItem((item) => item.setTitle(t("keepAsLeafNote")).setIcon("shield-check").onClick(() => {
        void this.addLeafExemption(entry.path);
      }));
    }
  }

  private async createAndOpenMissingNote(folder: TFolder): Promise<void> {
    await this.runRepair(async () => {
      const note = await this.service.createMissingNodeNote(folder);
      await this.app.workspace.getLeaf(false).openFile(note);
    });
  }

  public openNodeMenu(anchor: ContentsMenuAnchor, folder: TFolder): void {
    const menu = new Menu();
    menu.addItem((item) => item.setTitle(t("open")).setIcon("file-text").onClick(() => void this.service.openFolderNode(folder.path)));
    menu.addItem((item) => item.setTitle(t("openNewTab")).setIcon("file-plus").onClick(() => void this.service.openFolderNode(folder.path, true)));
    menu.addItem((item) => item.setTitle(t("contents")).setIcon("layout-grid").onClick(() => void this.openContents(folder)));
    menu.addSeparator();
    this.addNodeMenuItems(menu, folder, false);
    this.app.workspace.trigger("file-menu", menu, folder, CONTENTS_MENU_SOURCE);
    this.showMenu(menu, anchor);
  }

  public promptVisual(folder: TFolder): void {
    new VisualPickerModal(this.app, folder, async (value) => {
      await this.visuals.set(folder, value);
      this.refreshVisuals();
    }).open();
  }

  private showScan(healthMode: boolean): void {
    const scan = this.service.scan();
    new MigrationModal(this.app, scan, async (progress) => {
      this.settings.adoptionState = "migrating";
      await this.saveSettings();
      try {
        await this.service.migrate(scan, progress);
        this.settings.adoptionState = "managed";
        await this.saveSettings();
        this.refreshVisuals();
      } catch (error) {
        this.settings.adoptionState = "unadopted";
        await this.saveSettings();
        throw error;
      }
    }, healthMode, this.settings.adoptionState !== "managed").open();
  }

  private registerCommands(): void {
    this.addCommand({ id: "review-vault-changes", name: t("maintenance"), callback: () => this.openMaintenance() });
    this.addCommand({ id: "health", name: t("health"), callback: () => this.showHealth() });
    this.addCommand({ id: "open-homepage", name: t("openHomepage"), callback: () => void this.openHomepage() });
    this.addCommand({ id: "create-child-node", name: t("createChild"), callback: () => this.promptCreateChild() });
    this.addCommand({
      id: "create-from-selection",
      name: t("createSelection"),
      editorCheckCallback: (checking, editor, view) => {
        if (editor.getSelection().trim() === "") return false;
        if (!checking) this.previewSelectionCreation(editor, view.file);
        return true;
      },
    });
    this.addCommand({ id: "open-contents", name: t("contents"), callback: () => void this.openContents() });
    this.addCommand({ id: "rename-node", name: t("rename"), callback: () => this.promptRenameCurrent() });
    this.addCommand({ id: "move-node", name: t("move"), callback: () => this.promptMoveCurrent() });
    this.addCommand({ id: "merge-node", name: t("merge"), callback: () => this.promptMergeCurrent() });
    this.addCommand({ id: "move-node-up", name: t("moveUp"), callback: () => void this.reorderCurrent(-1) });
    this.addCommand({ id: "move-node-down", name: t("moveDown"), callback: () => void this.reorderCurrent(1) });
  }

  private registerEvents(): void {
    this.registerEvent(this.app.vault.on("create", (entry) => this.scheduleReconcile(entry.path, "create")));
    this.registerEvent(this.app.vault.on("delete", (entry) => this.scheduleReconcile(entry.path, "delete")));
    this.registerEvent(this.app.vault.on("rename", (entry, oldPath) => {
      if (this.reconciliationReady) void this.service.reconcileRenamed(entry, oldPath).catch((error) => this.reportReconcileError(error));
    }));
    this.registerEvent(this.app.workspace.on("file-menu", (menu, entry, source) => {
      if (source !== CONTENTS_MENU_SOURCE) this.addContextMenu(menu, entry);
    }));
    this.registerEvent(this.app.workspace.on("editor-menu", (menu, editor, info) => {
      if (editor.getSelection().trim() === "" || info.file === null) return;
      menu.addItem((item) => item.setTitle(t("createSelection")).setIcon("folder-plus").onClick(() => this.previewSelectionCreation(editor, info.file)));
    }));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => {
      this.updateContentsView();
      this.explorer.refresh();
    }));
    this.registerEvent(this.app.metadataCache.on("changed", () => this.refreshVisuals()));
  }

  private scheduleReconcile(path: string, kind: "create" | "delete"): void {
    if (!this.reconciliationReady) return;
    const key = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : path;
    const existing = this.reconcileBatches.get(key);
    if (existing !== undefined) window.clearTimeout(existing.timer);
    const entries = existing?.entries ?? new Map<string, "create" | "delete">();
    entries.set(path, kind);
    const timer = window.setTimeout(() => {
      this.reconcileBatches.delete(key);
      void (async () => {
        for (const [entryPath, entryKind] of entries) {
          try {
            if (entryKind === "create") await this.service.reconcileCreated(entryPath);
            else await this.service.reconcileDeleted(entryPath);
          } catch (error) {
            this.reportReconcileError(error);
          }
        }
        this.refreshVisuals();
      })();
    }, 750);
    this.reconcileBatches.set(key, { timer, entries });
  }

  private reportReconcileError(error: unknown): void {
    this.reconcileErrorCount += 1;
    this.reconcileErrorMessages.add(formatError(error));
    if (this.reconcileNoticeTimer !== null) window.clearTimeout(this.reconcileNoticeTimer);
    this.reconcileNoticeTimer = window.setTimeout(() => {
      const messages = [...this.reconcileErrorMessages];
      const message = this.reconcileErrorCount === 1
        ? messages[0] ?? t("errorGeneric", { message: "Unknown reconciliation error" })
        : t("reconcileErrorsSummary", { count: this.reconcileErrorCount, message: messages[0] ?? "" });
      new Notice(message, 8000);
      this.reconcileErrorCount = 0;
      this.reconcileErrorMessages.clear();
      this.reconcileNoticeTimer = null;
    }, 1000);
  }

  private addContextMenu(menu: Menu, entry: TAbstractFile): void {
    if (!(entry instanceof TFile) && !(entry instanceof TFolder)) return;
    if (entry instanceof TFolder) {
      const identity = classifyFolderIdentity(
        this.service.isIgnoredPath(entry.path),
        this.service.getNote(this.service.notePathForFolder(entry.path)) !== null,
      );
      if (identity === "ordinary") return;
      menu.addSeparator();
      if (identity === "missing-note") this.addProblemMenuItems(menu, entry);
      else this.addNodeMenuItems(menu, entry, true);
      return;
    }
    const folder = this.service.folderForFile(entry);
    if (folder === null) return;
    const counterpartPath = folder.path === "" ? entry.basename : `${folder.path}/${entry.basename}`;
    const counterpart = this.service.getFolder(counterpartPath);
    const identity = classifyFileIdentity({
      canonicalNodeNote: entry.path === this.service.notePathForFolder(folder.path),
      counterpartNodeExists: counterpart !== null && this.service.getNote(this.service.notePathForFolder(counterpart.path)) !== null,
      ignored: this.service.isIgnoredPath(folder.path),
      leafExempt: this.service.isLeafNoteExempt(entry.path),
      markdown: entry.extension.toLocaleLowerCase() === "md",
    });
    if (identity === "node-note") {
      menu.addSeparator();
      this.addNodeMenuItems(menu, folder, true);
      return;
    }
    if (identity === "missing-folder" || identity === "conflict") {
      menu.addSeparator();
      this.addProblemMenuItems(menu, entry);
    }
  }

  private addNodeMenuItems(menu: Menu, folder: TFolder, includeContents: boolean): void {
    menu.addItem((item) => item.setTitle(t("createChild")).setIcon("folder-plus").onClick(() => this.promptCreateChild(folder)));
    if (includeContents) menu.addItem((item) => item.setTitle(t("contents")).setIcon("layout-grid").onClick(() => void this.openContents(folder)));
    menu.addItem((item) => item.setTitle(t("editVisual")).setIcon("palette").onClick(() => this.promptVisual(folder)));
    if (normalizeVaultPath(folder.path) === "") return;
    menu.addItem((item) => item.setTitle(t("rename")).setIcon("pencil").onClick(() => this.promptRename(folder)));
    menu.addItem((item) => item.setTitle(t("move")).setIcon("folder-input").onClick(() => this.promptMove(folder)));
    menu.addItem((item) => item.setTitle(t("merge")).setIcon("combine").onClick(() => this.promptMerge(folder)));
    menu.addItem((item) => item.setTitle(t("moveUp")).setIcon("arrow-up").onClick(() => void this.service.reorder(folder, -1)));
    menu.addItem((item) => item.setTitle(t("moveDown")).setIcon("arrow-down").onClick(() => void this.service.reorder(folder, 1)));
    menu.addItem((item) => item.setTitle(t("delete")).setIcon("trash-2").setWarning(true).onClick(() => this.confirmDelete(folder)));
  }

  private openEntryMenu(anchor: ContentsMenuAnchor, entry: TAbstractFile, sourceFolder: TFolder): void {
    const menu = new Menu();
    if (entry instanceof TFolder) {
      menu.addItem((item) => item.setTitle(t("contents")).setIcon("layout-grid").onClick(() => void this.openContents(entry)));
      menu.addItem((item) => item.setTitle(t("revealInExplorer")).setIcon("folder-search").onClick(() => void this.revealEntry(entry)));
    } else if (entry instanceof TFile) {
      menu.addItem((item) => item.setTitle(t("open")).setIcon("file").onClick(() => void this.app.workspace.getLeaf(false).openFile(entry)));
      menu.addItem((item) => item.setTitle(t("openNewTab")).setIcon("file-plus").onClick(() => void this.app.workspace.getLeaf(true).openFile(entry)));
      menu.addItem((item) => item.setTitle(t("revealInExplorer")).setIcon("folder-search").onClick(() => void this.revealEntry(entry)));
      menu.addItem((item) => item.setTitle(t("copyLink")).setIcon("copy").onClick(() => {
        const sourcePath = this.service.getNote(this.service.notePathForFolder(sourceFolder.path))?.path ?? "";
        void this.copyFileLink(entry, sourcePath);
      }));
      if (
        !this.service.isIgnoredPath(sourceFolder.path) &&
        this.service.getNote(this.service.notePathForFolder(sourceFolder.path)) !== null &&
        ["avif", "bmp", "gif", "jpeg", "jpg", "png", "svg", "webp"].includes(entry.extension.toLocaleLowerCase())
      ) {
        menu.addItem((item) => item.setTitle(t("setAsVisual")).setIcon("image").onClick(() => void this.setFileAsVisual(entry, sourceFolder)));
      }
      menu.addSeparator();
      menu.addItem((item) => item.setTitle(t("renameFile")).setIcon("pencil").onClick(() => this.promptRenameFile(entry)));
      menu.addItem((item) => item.setTitle(t("moveFile")).setIcon("folder-input").onClick(() => this.promptMoveFile(entry)));
      menu.addItem((item) => item.setTitle(t("deleteFile")).setIcon("trash-2").setWarning(true).onClick(() => this.confirmDeleteFile(entry)));
    }
    this.app.workspace.trigger("file-menu", menu, entry, CONTENTS_MENU_SOURCE);
    this.showMenu(menu, anchor);
  }

  private async runRepair(action: () => Promise<void>): Promise<void> {
    try {
      await action();
      this.refreshVisuals();
    } catch (error) {
      new Notice(formatError(error), 8000);
    }
  }

  private async addLeafExemption(path: string): Promise<void> {
    if (!this.settings.leafNoteExemptions.includes(path)) this.settings.leafNoteExemptions.push(path);
    this.settings.leafNoteExemptions.sort((a, b) => a.localeCompare(b));
    await this.saveSettings();
    this.refreshVisuals();
  }

  private showMenu(menu: Menu, anchor: ContentsMenuAnchor): void {
    if (anchor instanceof MouseEvent) {
      anchor.preventDefault();
      anchor.stopPropagation();
      menu.showAtMouseEvent(anchor);
      return;
    }
    const rect = anchor.getBoundingClientRect();
    menu.showAtPosition({ x: rect.left, y: rect.bottom, width: rect.width }, anchor.ownerDocument);
  }

  private async revealEntry(entry: TAbstractFile): Promise<void> {
    try {
      if (!await this.explorer.reveal(entry)) new Notice(t("revealUnavailable"));
    } catch (error) {
      new Notice(formatError(error), 8000);
    }
  }

  private async copyFileLink(file: TFile, sourcePath: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.app.fileManager.generateMarkdownLink(file, sourcePath));
      new Notice(t("copiedLink"));
    } catch (error) {
      new Notice(formatError(error), 8000);
    }
  }

  private async setFileAsVisual(file: TFile, folder: TFolder): Promise<void> {
    try {
      await this.visuals.set(folder, `[[${file.path}]]`);
      this.refreshVisuals();
    } catch (error) {
      new Notice(formatError(error), 8000);
    }
  }

  private promptRenameFile(file: TFile): void {
    new PromptModal(this.app, t("renameFile"), file.name, t("renameFile"), async (name) => {
      await this.service.renameFile(file, name);
      this.refreshVisuals();
    }).open();
  }

  private promptMoveFile(file: TFile): void {
    new PromptModal(this.app, t("moveFile"), file.parent?.path ?? "", t("moveFile"), async (targetPath) => {
      await this.service.moveFile(file, targetPath === "/" ? "" : targetPath);
      this.refreshVisuals();
    }).open();
  }

  private confirmDeleteFile(file: TFile): void {
    new ConfirmModal(this.app, t("deleteFile"), `${t("moveToTrash")}: ${file.path}`, t("moveToTrash"), true, async () => {
      await this.service.deleteFile(file);
      this.refreshVisuals();
    }).open();
  }

  private currentFolder(): TFolder | null { return this.service.folderForFile(this.app.workspace.getActiveFile()); }

  private previewSelectionCreation(editor: Editor, file: TFile | null): void {
    const selection = editor.getSelection();
    if (file === null || selection.trim() === "") return;
    const folder = this.service.folderForFile(file) ?? this.app.vault.getRoot();
    const cursorLine = editor.getCursor("from").line;
    const heading = this.app.metadataCache.getFileCache(file)?.headings
      ?.filter((item) => item.position.start.line <= cursorLine)
      .at(-1)?.heading ?? "";
    const name = sanitizeNodeName(buildNodeName({
      selection,
      currentFile: file.basename,
      currentNode: normalizeVaultPath(folder.path) === "" ? this.app.vault.getName() : folder.name,
      currentHeading: heading,
      now: new Date(),
    }, this.settings.prefix, this.settings.suffix, this.settings.timestampFormat));
    const parentPath = normalizeVaultPath(folder.path);
    const nodePath = parentPath === "" ? name : `${parentPath}/${name}`;
    const notePath = `${nodePath}/${name}.md`;
    const alias = this.settings.addSelectionAlias ? selection.trim() : null;
    const linkLabel = selection.trim().replace(/\s+/gu, " ");
    const wikiLink = `[[${notePath.slice(0, -3)}|${linkLabel}]]`;
    new SelectionCreateModal(this.app, { parentPath, nodeName: name, notePath, alias, wikiLink }, async () => {
      if (editor.getSelection() !== selection) throw new Error("Selection changed after preview");
      const options = alias === null ? { body: selection } : { alias, body: selection };
      const note = await this.service.createNode(parentPath, name, options);
      editor.replaceSelection(wikiLink);
      await this.app.workspace.getLeaf(false).openFile(note);
      this.refreshVisuals();
    }).open();
  }

  private promptRenameCurrent(): void { const folder = this.currentFolder(); if (folder !== null && normalizeVaultPath(folder.path) !== "") this.promptRename(folder); }
  private promptMoveCurrent(): void { const folder = this.currentFolder(); if (folder !== null && normalizeVaultPath(folder.path) !== "") this.promptMove(folder); }
  private promptMergeCurrent(): void { const folder = this.currentFolder(); if (folder !== null && normalizeVaultPath(folder.path) !== "") this.promptMerge(folder); }

  private promptRename(folder: TFolder): void {
    new PromptModal(this.app, t("rename"), folder.name, t("rename"), async (name) => {
      await this.service.renameNode(folder, name);
      this.refreshVisuals();
    }).open();
  }

  private promptMove(folder: TFolder): void {
    new PromptModal(this.app, t("move"), folder.parent?.path ?? "", t("move"), async (targetPath) => {
      await this.service.moveNode(folder, targetPath === "/" ? "" : targetPath);
      this.refreshVisuals();
    }).open();
  }

  private promptMerge(folder: TFolder): void {
    new PromptModal(this.app, t("merge"), "", t("merge"), async (targetPath) => {
      const target = this.service.getFolder(targetPath === "/" ? "" : targetPath);
      if (target === null) throw new Error(`Unknown target node: ${targetPath}`);
      await this.service.mergeNode(folder, target);
      this.refreshVisuals();
    }).open();
  }

  private confirmDelete(folder: TFolder): void {
    new ConfirmModal(this.app, t("delete"), `${t("moveToTrash")}: ${folder.path}`, t("moveToTrash"), true, async () => {
      await this.service.deleteNode(folder);
      this.refreshVisuals();
    }).open();
  }

  private async reorderCurrent(delta: -1 | 1): Promise<void> {
    const folder = this.currentFolder();
    if (folder !== null && normalizeVaultPath(folder.path) !== "") {
      await this.service.reorder(folder, delta);
      this.refreshVisuals();
    }
  }

  private async openContents(folder = this.currentFolder()): Promise<void> {
    const leaf = this.app.workspace.getLeavesOfType(CONTENTS_VIEW_TYPE)[0] ?? this.app.workspace.getRightLeaf(false);
    if (leaf === null) return;
    await leaf.setViewState({ type: CONTENTS_VIEW_TYPE, active: true });
    if (leaf.view instanceof FolderNodeContentsView) leaf.view.setFolder(folder?.path ?? "");
    await this.app.workspace.revealLeaf(leaf);
  }

  private updateContentsView(): void {
    const folder = this.currentFolder();
    for (const leaf of this.app.workspace.getLeavesOfType(CONTENTS_VIEW_TYPE)) {
      if (leaf.view instanceof FolderNodeContentsView) leaf.view.setFolder(folder?.path ?? "");
    }
  }
}
