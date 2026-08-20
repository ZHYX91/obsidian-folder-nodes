import {
  Editor,
  Menu,
  Notice,
  Plugin,
  TAbstractFile,
  TFile,
  TFolder,
} from "obsidian";

import { ExplorerAdapter } from "../adapters/explorer-adapter";
import { NodeService } from "../adapters/node-service";
import { buildNodeName } from "../core/naming";
import type { FolderNodesSettings } from "../core/types";
import { DEFAULT_SETTINGS, normalizeSettings } from "../shared/settings";
import { t } from "./i18n";
import { FolderNodeContentsView, CONTENTS_VIEW_TYPE } from "../ui/contents-view";
import { ConfirmModal, PromptModal } from "../ui/prompt-modal";
import { MigrationModal } from "../ui/migration-modal";
import { FolderNodesSettingTab } from "./settings-tab";

export default class FolderNodesPlugin extends Plugin {
  public override settings: FolderNodesSettings = structuredClone(DEFAULT_SETTINGS);
  public service!: NodeService;
  private explorer!: ExplorerAdapter;
  private reconcileTimers = new Map<string, number>();

  public override async onload(): Promise<void> {
    this.settings = normalizeSettings(await this.loadData());
    this.service = new NodeService(this.app, () => this.settings);
    this.explorer = new ExplorerAdapter(this.app, this.service);
    this.addChild(this.explorer);
    this.registerView(CONTENTS_VIEW_TYPE, (leaf) => new FolderNodeContentsView(leaf, this.service));
    this.addSettingTab(new FolderNodesSettingTab(this.app, this));
    this.registerCommands();
    this.registerEvents();
    this.app.workspace.onLayoutReady(() => this.explorer.start());
  }

  public override onunload(): void {
    for (const timer of this.reconcileTimers.values()) window.clearTimeout(timer);
    this.reconcileTimers.clear();
  }

  public async saveSettings(): Promise<void> { await this.saveData(this.settings); }

  public previewSelectionName(selection: string): string {
    const file = this.app.workspace.getActiveFile();
    return buildNodeName({
      selection,
      currentFile: file?.basename ?? "Current file",
      currentNode: file?.parent?.name ?? this.app.vault.getName(),
      currentHeading: "Current heading",
      now: new Date(),
    }, this.settings.prefix, this.settings.suffix, this.settings.timestampFormat);
  }

  public async initializeManagedVault(): Promise<void> {
    const scan = this.service.scan();
    if (scan.leafMarkdown.length > 0 || scan.conflicts.length > 0) {
      new Notice("This Vault contains leaf Markdown or conflicts. Use migration preview first.", 8000);
      return;
    }
    await this.service.initialize();
    for (const folder of scan.missingNodeNotes.filter((path) => path !== "")) {
      const notePath = this.service.notePathForFolder(folder);
      if (this.service.getNote(notePath) === null) await this.app.vault.create(notePath, "");
    }
    this.settings.adoptionState = "managed";
    await this.saveSettings();
    new Notice("Folder Nodes initialized.");
  }

  public openMigration(): void {
    const scan = this.service.scan();
    new MigrationModal(this.app, scan, async (progress) => {
      this.settings.adoptionState = "migrating";
      await this.saveSettings();
      try {
        await this.service.migrate(scan, progress);
        this.settings.adoptionState = "managed";
        await this.saveSettings();
      } catch (error) {
        this.settings.adoptionState = "unadopted";
        await this.saveSettings();
        throw error;
      }
    }).open();
  }

  public showHealth(): void {
    const scan = this.service.scan();
    const message = [
      `${scan.leafMarkdown.length} leaf Markdown`,
      `${scan.missingNodeNotes.length} missing node notes`,
      `${scan.conflicts.length} conflicts`,
    ].join(" · ");
    new Notice(`Folder Nodes health: ${message}`, 8000);
  }

  private registerCommands(): void {
    this.addCommand({ id: "initialize", name: t("initialize"), callback: () => void this.initializeManagedVault() });
    this.addCommand({ id: "migration", name: t("migration"), callback: () => this.openMigration() });
    this.addCommand({ id: "health", name: t("health"), callback: () => this.showHealth() });
    this.addCommand({ id: "create-child-node", name: t("createChild"), callback: () => this.promptCreateChild() });
    this.addCommand({
      id: "create-from-selection",
      name: t("createSelection"),
      editorCheckCallback: (checking, editor, view) => {
        if (editor.getSelection().trim() === "") return false;
        if (!checking) void this.createFromSelection(editor, view.file);
        return true;
      },
    });
    this.addCommand({ id: "open-contents", name: t("contents"), callback: () => void this.openContents() });
    this.addCommand({ id: "rename-node", name: t("rename"), callback: () => this.promptRenameCurrent() });
    this.addCommand({ id: "move-node", name: "Move node…", callback: () => this.promptMoveCurrent() });
    this.addCommand({ id: "move-node-up", name: t("moveUp"), callback: () => void this.reorderCurrent(-1) });
    this.addCommand({ id: "move-node-down", name: t("moveDown"), callback: () => void this.reorderCurrent(1) });
  }

  private registerEvents(): void {
    this.registerEvent(this.app.vault.on("create", (entry) => this.scheduleReconcile(entry.path, "create")));
    this.registerEvent(this.app.vault.on("delete", (entry) => this.scheduleReconcile(entry.path, "delete")));
    this.registerEvent(this.app.vault.on("rename", (entry, oldPath) => {
      void this.service.reconcileRenamed(entry, oldPath).catch((error) => new Notice(`Folder Nodes rename reconciliation paused: ${String(error)}`, 8000));
    }));
    this.registerEvent(this.app.workspace.on("file-menu", (menu, entry) => this.addContextMenu(menu, entry)));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.updateContentsView()));
  }

  private scheduleReconcile(path: string, kind: "create" | "delete"): void {
    const previous = this.reconcileTimers.get(path);
    if (previous !== undefined) window.clearTimeout(previous);
    const timer = window.setTimeout(() => {
      this.reconcileTimers.delete(path);
      const operation = kind === "create" ? this.service.reconcileCreated(path) : this.service.reconcileDeleted(path);
      void operation.catch((error) => new Notice(`Folder Nodes reconciliation paused: ${String(error)}`, 8000));
    }, 500);
    this.reconcileTimers.set(path, timer);
  }

  private addContextMenu(menu: Menu, entry: TAbstractFile): void {
    if (!(entry instanceof TFile) && !(entry instanceof TFolder)) return;
    const folder = entry instanceof TFolder ? entry : this.service.folderForFile(entry);
    if (folder === null) return;
    menu.addSeparator();
    menu.addItem((item) => item.setTitle(t("createChild")).setIcon("folder-plus").onClick(() => this.promptCreateChild(folder)));
    menu.addItem((item) => item.setTitle(t("contents")).setIcon("layout-grid").onClick(() => void this.openContents(folder)));
    if (folder.path !== "") {
      menu.addItem((item) => item.setTitle(t("rename")).setIcon("pencil").onClick(() => this.promptRename(folder)));
      menu.addItem((item) => item.setTitle("Move node…").setIcon("folder-input").onClick(() => this.promptMove(folder)));
      menu.addItem((item) => item.setTitle(t("moveUp")).setIcon("arrow-up").onClick(() => void this.service.reorder(folder, -1)));
      menu.addItem((item) => item.setTitle(t("moveDown")).setIcon("arrow-down").onClick(() => void this.service.reorder(folder, 1)));
      menu.addItem((item) => item.setTitle(t("delete")).setIcon("trash-2").onClick(() => this.confirmDelete(folder)));
    }
  }

  private currentFolder(): TFolder | null {
    return this.service.folderForFile(this.app.workspace.getActiveFile());
  }

  private promptCreateChild(parent = this.currentFolder()): void {
    const parentPath = parent?.path ?? "";
    new PromptModal(this.app, t("createChild"), "", "Create", async (name) => {
      const note = await this.service.createNode(parentPath, name);
      await this.app.workspace.getLeaf(false).openFile(note);
    }).open();
  }

  private async createFromSelection(editor: Editor, file: TFile | null): Promise<void> {
    const selection = editor.getSelection();
    if (file === null) return;
    const folder = this.service.folderForFile(file);
    const line = editor.getLine(editor.getCursor("from").line).trim();
    const heading = line.startsWith("#") ? line.replace(/^#+\s*/u, "") : "";
    const name = buildNodeName({
      selection,
      currentFile: file.basename,
      currentNode: folder?.name ?? this.app.vault.getName(),
      currentHeading: heading,
      now: new Date(),
    }, this.settings.prefix, this.settings.suffix, this.settings.timestampFormat);
    const options = this.settings.addSelectionAlias ? { alias: selection, body: selection } : { body: selection };
    const note = await this.service.createNode(folder?.path ?? "", name, options);
    editor.replaceSelection(`[[${note.path.slice(0, -3)}|${selection.trim()}]]`);
    await this.app.workspace.getLeaf(false).openFile(note);
  }

  private promptRenameCurrent(): void {
    const folder = this.currentFolder();
    if (folder !== null && folder.path !== "") this.promptRename(folder);
  }

  private promptRename(folder: TFolder): void {
    new PromptModal(this.app, t("rename"), folder.name, "Rename", async (name) => {
      await this.service.renameNode(folder, name);
    }).open();
  }

  private promptMoveCurrent(): void {
    const folder = this.currentFolder();
    if (folder !== null && folder.path !== "") this.promptMove(folder);
  }

  private promptMove(folder: TFolder): void {
    new PromptModal(this.app, "Move node to parent path", folder.parent?.path ?? "", "Move", async (targetPath) => {
      await this.service.moveNode(folder, targetPath === "/" ? "" : targetPath);
    }).open();
  }
  private confirmDelete(folder: TFolder): void {
    new ConfirmModal(
      this.app,
      t("delete"),
      `Move the complete Folder Node “${folder.path}” and all its contents to the system trash?`,
      "Move to trash",
      true,
      () => this.service.deleteNode(folder),
    ).open();
  }

  private async reorderCurrent(delta: -1 | 1): Promise<void> {
    const folder = this.currentFolder();
    if (folder !== null && folder.path !== "") await this.service.reorder(folder, delta);
  }

  private async openContents(folder = this.currentFolder()): Promise<void> {
    const leaf = this.app.workspace.getLeavesOfType(CONTENTS_VIEW_TYPE)[0] ?? this.app.workspace.getRightLeaf(false);
    if (leaf === null) return;
    await leaf.setViewState({ type: CONTENTS_VIEW_TYPE, active: true });
    const view = leaf.view;
    if (view instanceof FolderNodeContentsView) view.setFolder(folder?.path ?? "");
    await this.app.workspace.revealLeaf(leaf);
  }

  private updateContentsView(): void {
    const folder = this.currentFolder();
    for (const leaf of this.app.workspace.getLeavesOfType(CONTENTS_VIEW_TYPE)) {
      if (leaf.view instanceof FolderNodeContentsView) leaf.view.setFolder(folder?.path ?? "");
    }
  }
}
