import { Editor, getLinkpath, Keymap, MarkdownView, Menu, Notice, Platform, Plugin, setIcon, TAbstractFile, TFile, TFolder } from "obsidian";

import BASE_STYLES from "../ui/styles.css";
import NODE_GRAPH_STYLES from "../ui/node-graph.css";

import { ExplorerAdapter } from "../adapters/explorer-adapter";
import { NodeService } from "../adapters/node-service";
import { ReferenceIndex } from "../core/reference-index";
import { VisualService } from "../adapters/visual-service";
import { buildNodeName } from "../core/naming";
import { configuredEmojiFontStack } from "../core/emoji-font";
import { classifyFileIdentity, classifyFolderIdentity } from "../core/identity";
import { isWithin, remapNodeGraphSettingPaths } from "../core/node-graph-scope";
import { isCanonicalNodeNote, normalizeVaultPath, sanitizeNodeName } from "../core/paths";
import { buildSelectionWikiLink, classifySelectionTableContext } from "../core/selection-link";
import { aliasFromLinkDisplay, planUnresolvedNode, type LinkAliasCandidate } from "../core/unresolved-link";
import type { FolderNodesSettings } from "../core/types";
import {
  CURRENT_SETTINGS_SCHEMA_VERSION,
  createSettingsSnapshot,
  DEFAULT_SETTINGS,
  loadSettingsData,
  SettingsSchemaIncompatibleError,
  type PersistedFolderNodesSettings,
  type SettingsCompatibility,
} from "../shared/settings";
import {
  SettingsSaveCoordinator,
  type SettingsSaveState,
} from "../shared/settings-save-coordinator";
import { FolderNodeContentsView, CONTENTS_VIEW_TYPE, type ContentsMenuAnchor } from "../ui/contents-view";
import { CONTENTS_MENU_SOURCE } from "../ui/contents-interactions";
import { MigrationModal } from "../ui/migration-modal";
import { ScanProgressModal } from "../ui/scan-progress-modal";
import { ConfirmModal, PromptModal } from "../ui/prompt-modal";
import { SelectionCreateModal } from "../ui/selection-create-modal";
import { VisualPickerModal } from "../ui/visual-picker-modal";
import { formatError, setLanguage, t } from "../ui/i18n";
import { RuntimeStyles } from "../ui/runtime-styles";
import { onLayoutReadyOnce } from "./layout-ready";
import { FolderNodesSettingTab } from "./settings-tab";
import { RefreshScheduler, type RefreshBatch, type RefreshReason } from "./refresh-scheduler";

type NodeMenuSurface = "owned" | "native-folder" | "native-note";
const PLUGIN_STYLES = `${BASE_STYLES}\n${NODE_GRAPH_STYLES}`;

export default class FolderNodesPlugin extends Plugin {
  public override settings: FolderNodesSettings = structuredClone(DEFAULT_SETTINGS);
  public service!: NodeService;
  public visuals!: VisualService;
  private explorer!: ExplorerAdapter;
  protected readonly references = new ReferenceIndex();
  private refreshScheduler: RefreshScheduler | null = null;
  private reconcileBatches = new Map<string, { timer: number; entries: Map<string, "create" | "delete"> }>();
  private reconciliationReady = false;
  private reconcileNoticeTimer: number | null = null;
  private reconcileErrorCount = 0;
  private reconcileErrorMessages = new Set<string>();
  private readonly unresolvedLinkDocuments = new Set<Document>();
  private unloaded = false;
  private initialized = false;
  private settingsLoaded = false;
  private lifecycleGeneration = 0;
  private readonly runtimeStyles = new RuntimeStyles(PLUGIN_STYLES);
  private settingsTab: FolderNodesSettingTab | null = null;
  private settingsSaveWasPending = false;
  private showHiddenNodesThisSession = false;
  private hiddenNodesRibbon: HTMLElement | null = null;
  private readonly settingsSaver = new SettingsSaveCoordinator<PersistedFolderNodesSettings>(
    (snapshot) => this.saveData(snapshot),
    (state) => {
      if (state === "pending") {
        this.settingsSaveWasPending = true;
        this.settingsTab?.refreshPersistenceStatus();
      } else if (state === "saved" && this.settingsSaveWasPending) {
        this.settingsSaveWasPending = false;
        this.settingsTab?.refreshPersistenceStatus();
      }
    },
  );
  private settingsCompatibility: SettingsCompatibility = {
    status: "compatible",
    currentSchemaVersion: CURRENT_SETTINGS_SCHEMA_VERSION,
    storedSchemaVersion: 0,
  };

  public override async onload(): Promise<void> {
    const generation = ++this.lifecycleGeneration;
    this.unloaded = false;
    this.initialized = false;
    this.settingsLoaded = false;
    const stored: unknown = await this.loadData();
    if (this.unloaded || generation !== this.lifecycleGeneration) return;
    const loaded = loadSettingsData(stored);
    this.settings = loaded.settings;
    this.settingsCompatibility = loaded.compatibility;
    this.settingsLoaded = true;
    if (loaded.migration !== null) {
      void this.settingsSaver.save(loaded.migration).catch(() => undefined);
    }
    this.updateEmojiFontStyle();
    setLanguage(this.settings.language);
    this.showHiddenNodesThisSession = false;
    this.service = new NodeService(this.app, () => this.settings, () => this.showHiddenNodesThisSession);
    this.visuals = new VisualService(this.app, this.service, () => this.settings.iconInheritance);
    this.explorer = new ExplorerAdapter(
      this.app,
      this.service,
      this.visuals,
      () => this.settings,
      () => ({
        createNode: t("createNode"), incompleteNode: t("incompleteNode"), missingNodeFolder: t("missingNodeFolder"), missingNodeNote: t("missingNodeNote"),
        node: t("node"), nodeConflict: t("nodeConflict"), root: t("root"), unmanaged: t("unmanaged"),
        hiddenNode: t("hiddenNode"), hiddenByNode: (path) => t("hiddenByNode", { path }),
      }),
      (parentPath) => {
        const parent = parentPath === "" ? this.app.vault.getRoot() : this.service.getFolder(parentPath);
        if (parent !== null) this.promptCreateChild(parent);
      },
      (entry) => {
        if (entry instanceof TFolder) this.runAction(this.createAndOpenMissingNote(entry));
        else this.runAction(this.service.convertLeafNote(entry).then(() => this.refreshVisuals()));
      },
      () => this.refreshVisuals(),
      (error) => new Notice(formatError(error), 8000),
      Platform.isDesktopApp,
    );
    this.refreshScheduler = new RefreshScheduler((batch) => this.applyRefresh(batch));
    this.addChild(this.explorer);
    this.registerView(CONTENTS_VIEW_TYPE, (leaf) => new FolderNodeContentsView(leaf, this.service, this.visuals, this.references, {
      createChild: (folder) => this.promptCreateChild(folder),
      createMissingNote: (folder) => this.runAction(this.createAndOpenMissingNote(folder)),
      nodeMenu: (event, folder) => this.openNodeMenu(event, folder),
      entryMenu: (anchor, entry, sourceFolder) => this.openEntryMenu(anchor, entry, sourceFolder),
      problemMenu: (anchor, entry) => this.openProblemMenu(anchor, entry),
      editVisual: (folder) => this.promptVisual(folder),
      openHomepage: () => this.runAction(this.openHomepage()),
      homepageEnabled: () => this.settings.homepageEnabled,
      refresh: () => this.refreshVisuals(),
      reportError: (error) => new Notice(formatError(error), 8000),
    }, Platform.isDesktopApp));
    this.settingsTab = new FolderNodesSettingTab(this.app, this);
    this.addSettingTab(this.settingsTab);
    this.addRibbonIcon("layout-grid", t("contents"), () => this.runAction(this.openContents()));
    this.hiddenNodesRibbon = this.addRibbonIcon("eye-off", t("showHiddenNodesThisSession"), () => void this.toggleHiddenNodesThisSession());
    this.syncHiddenNodesRibbon();
    this.registerCommands();
    this.registerEvents();
    onLayoutReadyOnce(this.app.workspace, () => {
      if (this.unloaded || generation !== this.lifecycleGeneration) return;
      this.registerUnresolvedLinkDocument(this.app.workspace.rootSplit.win.document);
      this.ensureWorkspaceStyles();
      this.explorer.start();
      this.reconciliationReady = true;
      this.references.rebuild(this.app.metadataCache.resolvedLinks);
      this.app.workspace.iterateAllLeaves((leaf) => this.registerUnresolvedLinkDocument(leaf.view.containerEl.ownerDocument));
      if (this.settings.homepageEnabled && this.settings.openHomepageOnStartup) this.runAction(this.openHomepage());
    });
    this.initialized = true;
  }

  public override onunload(): void {
    if (this.settingsLoaded && this.settingsCompatibility.status === "compatible") {
      void this.settingsSaver.flush(createSettingsSnapshot(this.settings)).catch(() => undefined);
    }
    this.lifecycleGeneration += 1;
    this.unloaded = true;
    this.initialized = false;
    this.settingsLoaded = false;
    this.settingsTab = null;
    this.hiddenNodesRibbon = null;
    this.reconciliationReady = false;
    this.service?.dispose();
    this.refreshScheduler?.cancel();
    this.refreshScheduler = null;
    for (const batch of this.reconcileBatches.values()) window.clearTimeout(batch.timer);
    this.reconcileBatches.clear();
    this.unresolvedLinkDocuments.clear();
    this.runtimeStyles.removeAll();
    if (this.reconcileNoticeTimer !== null) window.clearTimeout(this.reconcileNoticeTimer);
    this.reconcileNoticeTimer = null;
    for (const leaf of this.app.workspace.getLeavesOfType(CONTENTS_VIEW_TYPE)) leaf.detach();
  }

  public async saveSettings(): Promise<void> {
    if (this.settingsCompatibility.status === "incompatible") {
      throw new SettingsSchemaIncompatibleError(this.settingsCompatibility);
    }
    await this.settingsSaver.save(createSettingsSnapshot(this.settings));
  }

  public getSettingsCompatibility(): SettingsCompatibility {
    return this.settingsCompatibility;
  }

  public getSettingsSaveState(): SettingsSaveState | "blocked" {
    if (this.settingsCompatibility.status === "incompatible") return "blocked";
    return this.settingsSaver.getState();
  }

  public retrySettingsSave(): Promise<void> {
    if (this.settingsCompatibility.status === "incompatible") {
      return Promise.reject(new SettingsSchemaIncompatibleError(this.settingsCompatibility));
    }
    return this.settingsSaver.retry();
  }

  public ensureStyles(document: Document): void {
    this.runtimeStyles.install(document);
  }

  public applyEmojiFontSetting(): void {
    this.updateEmojiFontStyle();
    this.refreshVisuals();
  }

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

  public refreshVisuals(path?: string, reason?: RefreshReason): void {
    if (!this.unloaded) this.refreshScheduler?.request(path, reason);
  }

  protected get pluginLifecycleActive(): boolean {
    return this.initialized && !this.unloaded;
  }

  public async reconcileSettingsChange(): Promise<void> {
    if (!this.settings.hiddenNodesEnabled) this.showHiddenNodesThisSession = false;
    this.syncHiddenNodesRibbon();
    this.refreshVisuals();
  }

  public async toggleHiddenNodesThisSession(): Promise<void> {
    if (!this.settings.hiddenNodesEnabled) return;
    this.showHiddenNodesThisSession = !this.showHiddenNodesThisSession;
    this.syncHiddenNodesRibbon();
    await this.reconcileSettingsChange();
  }

  private syncHiddenNodesRibbon(): void {
    const ribbon = this.hiddenNodesRibbon;
    if (ribbon === null) return;
    const label = this.showHiddenNodesThisSession ? t("hideHiddenNodesThisSession") : t("showHiddenNodesThisSession");
    ribbon.setAttr("aria-label", label);
    ribbon.setAttr("title", label);
    ribbon.toggleClass("is-active", this.showHiddenNodesThisSession);
    ribbon.toggleClass("is-disabled", !this.settings.hiddenNodesEnabled);
    ribbon.setAttr("aria-disabled", String(!this.settings.hiddenNodesEnabled));
    ribbon.empty();
    setIcon(ribbon, this.showHiddenNodesThisSession ? "eye" : "eye-off");
  }

  public openBatchOrganize(): void { this.showScan(false); }
  public showHealth(): void { this.showScan(true); }

  public async openHomepage(): Promise<void> {
    if (!this.settings.homepageEnabled) {
      new Notice(t("homepageDisabled"));
      return;
    }
    const note = this.service.getCanonicalFile("");
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
    menu.addItem((item) => item.setTitle(t("revealInExplorer")).setIcon("folder-search").onClick(() => this.runAction(this.revealEntry(entry))));
    this.showMenu(menu, anchor);
  }

  private addProblemMenuItems(menu: Menu, entry: TFolder | TFile): void {
    if (entry instanceof TFolder) {
      menu.addItem((item) => item.setTitle(t("createMissingNodeNote")).setIcon("file-plus").onClick(() => {
        void this.runRepair(async () => { await this.service.completeFolder(entry); });
      }));
      menu.addItem((item) => item.setTitle(t("contents")).setIcon("layout-grid").onClick(() => this.runAction(this.openContents(entry))));
      menu.addItem((item) => item.setTitle(t("setUnmanaged")).setIcon("shield-off").onClick(() => void this.setFolderUnmanaged(entry.path)));
    } else {
      menu.addItem((item) => item.setTitle(t("open")).setIcon("file").onClick(() => this.runAction(this.app.workspace.getLeaf(false).openFile(entry))));
      menu.addItem((item) => item.setTitle(t("convertToNode")).setIcon("folder-plus").onClick(() => {
        void this.runRepair(async () => { await this.service.convertLeafNote(entry); });
      }));
      menu.addItem((item) => item.setTitle(t("setUnmanaged")).setIcon("shield-off").onClick(() => void this.setLeafUnmanaged(entry.path)));
    }
  }

  private async createAndOpenMissingNote(folder: TFolder): Promise<void> {
    await this.runRepair(async () => {
      const note = await this.service.completeFolder(folder);
      await this.app.workspace.getLeaf(false).openFile(note);
    });
  }

  public openNodeMenu(anchor: ContentsMenuAnchor, folder: TFolder): void {
    const menu = new Menu();
    menu.addItem((item) => item.setTitle(t("open")).setIcon("file-text").onClick(() => this.runAction(this.service.openFolderNode(folder.path))));
    menu.addItem((item) => item.setTitle(t("openNewTab")).setIcon("file-plus").onClick(() => this.runAction(this.service.openFolderNode(folder.path, true))));
    menu.addItem((item) => item.setTitle(t("contents")).setIcon("layout-grid").onClick(() => this.runAction(this.openContents(folder))));
    menu.addItem((item) => item.setTitle(t("revealInExplorer")).setIcon("folder-search").onClick(() => this.runAction(this.revealEntry(folder))));
    this.addOwnedNodeMenuItems(menu, folder);
    menu.addSeparator();
    this.addNodeMenuItems(menu, folder, false, "owned");
    this.showMenu(menu, anchor);
  }

  protected addOwnedNodeMenuItems(menu: Menu, folder: TFolder): void {
    void menu;
    void folder;
  }

  public promptVisual(folder: TFolder): void {
    try {
      new VisualPickerModal(this.app, folder, this.visuals.candidates(folder),
        (values) => this.visuals.preview(folder, values), (values) => this.visuals.diagnostics(values), async (values) => {
        await this.visuals.set(folder, values);
        this.refreshVisuals();
      }).open();
    } catch (error) {
      new Notice(formatError(error), 8000);
    }
  }

  private showScan(healthMode: boolean): void {
    const controller = new AbortController();
    const progressModal = new ScanProgressModal(this.app, () => controller.abort(new Error("Folder Nodes scan cancelled")));
    progressModal.open();
    void this.service.scanAsync((completed, total) => progressModal.update(completed, total), controller.signal)
      .then((scan) => {
        progressModal.finish();
        if (this.unloaded) return;
        new MigrationModal(this.app, scan, async (progress) => {
          await this.service.migrate(scan, progress);
          this.refreshVisuals();
        }, healthMode).open();
      })
      .catch((error) => {
        if (!controller.signal.aborted) progressModal.finish();
        if (!this.unloaded && !controller.signal.aborted) new Notice(formatError(error), 8000);
      });
  }

  private registerCommands(): void {
    this.addCommand({ id: "review-vault-changes", name: t("batchOrganize"), callback: () => this.openBatchOrganize() });
    this.addCommand({ id: "health", name: t("health"), callback: () => this.showHealth() });
    this.addCommand({ id: "open-homepage", name: t("openHomepage"), callback: () => this.runAction(this.openHomepage()) });
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
    this.addCommand({ id: "open-contents", name: t("contents"), callback: () => this.runAction(this.openContents()) });
    this.addCommand({
      id: "toggle-hidden-nodes",
      name: t("showHiddenNodesThisSession"),
      checkCallback: (checking) => {
        if (!this.settings.hiddenNodesEnabled) return false;
        if (!checking) void this.toggleHiddenNodesThisSession();
        return true;
      },
    });
    this.addCommand({ id: "rename-node", name: t("renameCurrentNode"), callback: () => this.promptRenameCurrent() });
    this.addCommand({ id: "move-node", name: t("moveContainingNode"), callback: () => this.promptMoveCurrent() });
    this.addCommand({ id: "merge-node", name: t("mergeContainingNode"), callback: () => this.promptMergeCurrent() });
    this.addCommand({ id: "move-node-up", name: t("moveUp"), callback: () => this.runAction(this.reorderCurrent(-1)) });
    this.addCommand({ id: "move-node-down", name: t("moveDown"), callback: () => this.runAction(this.reorderCurrent(1)) });
  }

  private registerEvents(): void {
    this.registerEvent(this.app.vault.on("create", (entry) => {
      if (this.service.consumeExpectedEvent("create", entry.path)) { this.refreshVisuals(entry.path); return; }
      this.scheduleReconcile(entry.path, "create");
    }));
    this.registerEvent(this.app.vault.on("delete", (entry) => {
      if (entry instanceof TFolder) this.removeDeletedNodeGraphPaths(entry.path);
      const affected = this.references.removeSource(entry.path);
      for (const path of affected) this.refreshVisuals(path, "reference");
      if (this.service.consumeExpectedEvent("delete", entry.path)) { this.refreshVisuals(entry.path); return; }
      this.scheduleReconcile(entry.path, "delete");
    }));
    this.registerEvent(this.app.vault.on("rename", (entry, oldPath) => {
      this.remapUnmanagedPaths(entry, oldPath);
      const affected = this.references.removeSource(oldPath);
      for (const path of affected) this.refreshVisuals(path, "reference");
      if (this.service.consumeExpectedEvent("rename", entry.path, oldPath)) {
        this.refreshVisuals(oldPath);
        this.refreshVisuals(entry.path);
        return;
      }
      if (this.reconciliationReady) void this.service.reconcileRenamed(entry, oldPath)
        .then(() => this.refreshVisuals())
        .catch((error) => this.reportReconcileError(error));
    }));
    this.registerEvent(this.app.workspace.on("file-menu", (menu, entry, source) => {
      if (source !== CONTENTS_MENU_SOURCE) this.addContextMenu(menu, entry);
    }));
    this.registerEvent(this.app.workspace.on("editor-menu", (menu, editor, info) => {
      if (editor.getSelection().trim() === "" || info.file === null) return;
      menu.addItem((item) => item.setTitle(t("createSelection")).setIcon("folder-plus").onClick(() => this.previewSelectionCreation(editor, info.file)));
    }));
    this.registerEvent(this.app.workspace.on("window-open", (_workspaceWindow, window) => {
      this.ensureStyles(window.document);
      this.registerUnresolvedLinkDocument(window.document);
    }));
    this.registerEvent(this.app.workspace.on("css-change", () => this.ensureWorkspaceStyles()));
    this.registerEvent(this.app.workspace.on("layout-change", () => {
      this.ensureWorkspaceStyles();
      this.explorer.refresh();
    }));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => {
      this.updateContentsView();
      this.refreshVisuals(undefined, "active-leaf");
    }));
    this.registerEvent(this.app.metadataCache.on("changed", (file) => {
      const affected = this.references.updateSource(file.path, this.app.metadataCache.resolvedLinks[file.path] ?? {});
      this.refreshVisuals(file.path, "metadata");
      for (const path of affected) this.refreshVisuals(path, "reference");
    }));
    this.registerEvent(this.app.metadataCache.on("resolved", () => {
      this.references.rebuild(this.app.metadataCache.resolvedLinks);
      this.refreshVisuals();
    }));
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

  private registerUnresolvedLinkDocument(document: Document): void {
    if (this.unresolvedLinkDocuments.has(document)) return;
    this.unresolvedLinkDocuments.add(document);
    const handle = (event: MouseEvent) => this.interceptUnresolvedLink(event);
    this.registerDomEvent(document, "click", handle, { capture: true });
    this.registerDomEvent(document, "auxclick", handle, { capture: true });
  }

  private ensureWorkspaceStyles(): void {
    const documents = new Set<Document>([this.app.workspace.rootSplit.win.document]);
    this.app.workspace.iterateAllLeaves((leaf) => documents.add(leaf.view.containerEl.ownerDocument));
    for (const document of documents) this.ensureStyles(document);
  }

  private updateEmojiFontStyle(): void {
    this.runtimeStyles.setBodyProperty(
      "--folder-nodes-configured-emoji-font",
      configuredEmojiFontStack(this.settings.emojiFont),
    );
  }

  private interceptUnresolvedLink(event: MouseEvent): void {
    if (event.defaultPrevented || (event.button !== 0 && event.button !== 1)) return;
    const target = event.target as { closest?: (selector: string) => Element | null } | null;
    const link = target?.closest?.("a.internal-link.is-unresolved");
    const rawLinkText = link?.getAttribute("data-href")?.trim();
    if (link === null || link === undefined || rawLinkText === undefined || rawLinkText === "") return;
    const source = this.sourceFileForLink(link);
    if (source === null) return;
    const linkPath = getLinkpath(rawLinkText).trim();
    if (linkPath === "" || this.app.metadataCache.getFirstLinkpathDest(linkPath, source.path) !== null) return;
    const requestedFile = linkPath.toLocaleLowerCase().endsWith(".md") ? linkPath : `${linkPath}.md`;
    const defaultParent = this.app.fileManager.getNewFileParent(source.path, requestedFile);
    const plan = planUnresolvedNode(linkPath, defaultParent.path);
    if (plan === null || this.service.isIgnoredPath(plan.nodePath) || this.service.isLeafNoteExempt(plan.leafPath)) return;

    const visibleText = link.textContent ?? "";
    const cacheLinks = this.app.metadataCache.getFileCache(source)?.links ?? [];
    const candidates: LinkAliasCandidate[] = cacheLinks.map((candidate) => ({
      linkPath: getLinkpath(candidate.link),
      original: candidate.original,
      ...(candidate.displayText === undefined ? {} : { displayText: candidate.displayText }),
    }));
    const alias = this.settings.addSelectionAlias
      ? aliasFromLinkDisplay(linkPath, visibleText, candidates, rawLinkText === linkPath)
      : null;
    const pane = event.button === 1 ? "tab" : Keymap.isModEvent(event);
    event.preventDefault();
    event.stopImmediatePropagation();
    this.runAction(this.createAndOpenUnresolvedNode(plan.nodePath, alias, pane));
  }

  private sourceFileForLink(link: Element): TFile | null {
    let source: TFile | null = null;
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (source === null && leaf.view instanceof MarkdownView && leaf.view.containerEl.contains(link)) source = leaf.view.file;
    });
    return source;
  }

  private async createAndOpenUnresolvedNode(nodePath: string, alias: string | null, pane: ReturnType<typeof Keymap.isModEvent>): Promise<void> {
    const note = await this.service.createNodePath(nodePath, alias === null ? {} : { alias });
    if (this.unloaded) return;
    await this.app.workspace.getLeaf(pane).openFile(note);
    this.refreshVisuals();
  }

  private reportReconcileError(error: unknown): void {
    if (this.unloaded) return;
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
        this.service.isIgnoredRootPath(entry.path),
        this.service.getCanonicalFile(entry.path) !== null,
      );
      if (identity === "ordinary") return;
      menu.addSeparator();
      if (identity === "unmanaged") menu.addItem((item) => item.setTitle(t("manageAgain")).setIcon("shield-check").onClick(() => void this.manageFolder(entry.path)));
      else if (identity === "incomplete") this.addProblemMenuItems(menu, entry);
      else this.addNodeMenuItems(menu, entry, true, "native-folder");
      return;
    }
    const folder = this.service.folderForFile(entry);
    if (folder === null) return;
    const counterpartPath = folder.path === "" ? entry.basename : `${folder.path}/${entry.basename}`;
    const counterpart = this.service.getFolder(counterpartPath);
    const identity = classifyFileIdentity({
      canonicalNodeNote: this.service.isCanonicalFile(entry),
      counterpartNodeExists: counterpart !== null && this.service.getCanonicalFile(counterpart.path) !== null,
      parentUnmanaged: this.service.isIgnoredPath(folder.path),
      leafExempt: this.service.isLeafNoteExempt(entry.path),
      markdown: entry.extension.toLocaleLowerCase() === "md",
    });
    if (identity === "node-note") {
      menu.addSeparator();
      this.addNodeMenuItems(menu, folder, true, "native-note");
      return;
    }
    if (identity === "unmanaged") {
      menu.addSeparator();
      menu.addItem((item) => item.setTitle(t("manageAgain")).setIcon("shield-check").onClick(() => void this.manageLeaf(entry.path)));
      return;
    }
    if (identity === "incomplete" || identity === "conflict") {
      menu.addSeparator();
      this.addProblemMenuItems(menu, entry);
      return;
    }
    if (entry.extension.toLocaleLowerCase() === "md" && !this.service.isIgnoredPath(folder.path) && !this.service.isLeafNoteExempt(entry.path)) {
      menu.addSeparator();
      menu.addItem((item) => item.setTitle(t("convertToNode")).setIcon("folder-plus").onClick(() => {
        void this.runRepair(async () => { await this.service.convertLeafNote(entry); });
      }));
    }
  }

  private addNodeMenuItems(menu: Menu, folder: TFolder, includeContents: boolean, surface: NodeMenuSurface): void {
    menu.addItem((item) => item.setTitle(t("createChild")).setIcon("folder-plus").onClick(() => this.promptCreateChild(folder)));
    if (includeContents) menu.addItem((item) => item.setTitle(t("contents")).setIcon("layout-grid").onClick(() => this.runAction(this.openContents(folder))));
    menu.addItem((item) => item.setTitle(t("editVisual")).setIcon("palette").onClick(() => this.promptVisual(folder)));
    if (normalizeVaultPath(folder.path) === "") return;
    const hiddenState = this.service.hiddenState(folder.path);
    if (hiddenState.explicit) {
      menu.addItem((item) => item.setTitle(t("unhideNode")).setIcon("eye").onClick(() => void this.runRepair(async () => {
        await this.service.setNodeHidden(folder, false);
        await this.reconcileSettingsChange();
      })));
    } else if (hiddenState.sourcePath !== null) {
      const sourcePath = hiddenState.sourcePath;
      menu.addItem((item) => item.setTitle(t("hiddenByNode", { path: sourcePath })).setIcon("eye-off").setDisabled(true));
    } else {
      menu.addItem((item) => item.setTitle(t("hideNode")).setIcon("eye-off").onClick(() => void this.runRepair(async () => {
        await this.service.setNodeHidden(folder, true);
        await this.reconcileSettingsChange();
      })));
    }
    menu.addSeparator();
    if (surface === "owned") {
      menu.addItem((item) => item.setTitle(t("rename")).setIcon("pencil").onClick(() => this.promptRename(folder)));
      menu.addItem((item) => item.setTitle(t("move")).setIcon("folder-input").onClick(() => this.promptMove(folder)));
    } else if (surface === "native-note") {
      menu.addItem((item) => item.setTitle(t("moveContainingNode")).setIcon("folder-input").onClick(() => this.promptMove(folder)));
    }
    menu.addItem((item) => item.setTitle(surface === "native-note" ? t("mergeContainingNode") : t("merge")).setIcon("combine").onClick(() => this.promptMerge(folder)));
    menu.addItem((item) => item.setTitle(t("moveUp")).setIcon("arrow-up").onClick(() => void this.runRepair(() => this.service.reorder(folder, -1))));
    menu.addItem((item) => item.setTitle(t("moveDown")).setIcon("arrow-down").onClick(() => void this.runRepair(() => this.service.reorder(folder, 1))));
    menu.addItem((item) => item.setTitle(t("setUnmanaged")).setIcon("shield-off").onClick(() => void this.setFolderUnmanaged(folder.path)));
    if (surface !== "native-folder") menu.addItem((item) => item.setTitle(surface === "native-note" ? t("deleteContainingNode") : t("delete")).setIcon("trash-2").setWarning(true).onClick(() => this.confirmDelete(folder)));
  }

  private openEntryMenu(anchor: ContentsMenuAnchor, entry: TAbstractFile, sourceFolder: TFolder): void {
    const menu = new Menu();
    if (entry instanceof TFolder) {
      menu.addItem((item) => item.setTitle(t("contents")).setIcon("layout-grid").onClick(() => this.runAction(this.openContents(entry))));
      menu.addItem((item) => item.setTitle(t("revealInExplorer")).setIcon("folder-search").onClick(() => this.runAction(this.revealEntry(entry))));
      if (this.service.isIgnoredRootPath(entry.path)) menu.addItem((item) => item.setTitle(t("manageAgain")).setIcon("shield-check").onClick(() => void this.manageFolder(entry.path)));
    } else if (entry instanceof TFile) {
      menu.addItem((item) => item.setTitle(t("open")).setIcon("file").onClick(() => this.runAction(this.app.workspace.getLeaf(false).openFile(entry))));
      menu.addItem((item) => item.setTitle(t("openNewTab")).setIcon("file-plus").onClick(() => this.runAction(this.app.workspace.getLeaf(true).openFile(entry))));
      menu.addItem((item) => item.setTitle(t("revealInExplorer")).setIcon("folder-search").onClick(() => this.runAction(this.revealEntry(entry))));
      menu.addItem((item) => item.setTitle(t("copyLink")).setIcon("copy").onClick(() => {
        const sourcePath = this.service.getCanonicalFile(sourceFolder.path)?.path ?? "";
        this.runAction(this.copyFileLink(entry, sourcePath));
      }));
      if (
        !this.service.isIgnoredPath(sourceFolder.path) &&
        this.service.getCanonicalFile(sourceFolder.path) !== null &&
        ["avif", "bmp", "gif", "jpeg", "jpg", "png", "svg", "webp"].includes(entry.extension.toLocaleLowerCase())
      ) {
        menu.addItem((item) => item.setTitle(t("setAsVisual")).setIcon("image").onClick(() => this.runAction(this.setFileAsVisual(entry, sourceFolder))));
      }
      if (entry.extension.toLocaleLowerCase() === "md" && !this.service.isIgnoredPath(sourceFolder.path) && !this.service.isLeafNoteExempt(entry.path)) {
        menu.addItem((item) => item.setTitle(t("convertToNode")).setIcon("folder-plus").onClick(() => {
          void this.runRepair(async () => { await this.service.convertLeafNote(entry); });
        }));
        menu.addItem((item) => item.setTitle(t("setUnmanaged")).setIcon("shield-off").onClick(() => void this.setLeafUnmanaged(entry.path)));
      } else if (entry.extension.toLocaleLowerCase() === "md" && this.service.isLeafNoteExempt(entry.path)) {
        menu.addItem((item) => item.setTitle(t("manageAgain")).setIcon("shield-check").onClick(() => void this.manageLeaf(entry.path)));
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

  private runAction(operation: Promise<unknown>): void {
    void operation.catch((error) => new Notice(formatError(error), 8000));
  }

  private async setLeafUnmanaged(path: string): Promise<void> {
    if (!this.settings.leafNoteExemptions.includes(path)) this.settings.leafNoteExemptions.push(path);
    this.settings.leafNoteExemptions.sort((a, b) => a.localeCompare(b));
    await this.saveSettings();
    await this.reconcileSettingsChange();
  }

  private setFolderUnmanaged(path: string): void {
    const normalized = normalizeVaultPath(path);
    if (normalized === "" || this.settings.ignoredFolders.includes(normalized)) return;
    new ConfirmModal(this.app, t("setUnmanaged"), t("unmanageFolderConfirm", { path: normalized }), t("setUnmanaged"), false, async () => {
      if (!this.settings.ignoredFolders.includes(normalized)) this.settings.ignoredFolders.push(normalized);
      this.settings.ignoredFolders.sort((a, b) => a.localeCompare(b));
      await this.saveSettings();
      await this.reconcileSettingsChange();
    }).open();
  }

  private async manageLeaf(path: string): Promise<void> {
    const index = this.settings.leafNoteExemptions.indexOf(path);
    if (index < 0) { new Notice(t("unmanagedByRule"), 8000); return; }
    this.settings.leafNoteExemptions.splice(index, 1);
    await this.saveSettings();
    await this.reconcileSettingsChange();
  }

  private async manageFolder(path: string): Promise<void> {
    const normalized = normalizeVaultPath(path);
    const index = this.settings.ignoredFolders.indexOf(normalized);
    if (index < 0) { new Notice(t("unmanagedByRule"), 8000); return; }
    const apply = async (): Promise<void> => {
      const currentIndex = this.settings.ignoredFolders.indexOf(normalized);
      if (currentIndex >= 0) this.settings.ignoredFolders.splice(currentIndex, 1);
      await this.saveSettings();
      await this.reconcileSettingsChange();
    };
    const hiddenState = this.service.hiddenState(normalized);
    if (hiddenState.sourcePath !== null) {
      new ConfirmModal(this.app, t("manageAgain"), t("hiddenAgainOnManage", { path: hiddenState.sourcePath }), t("manageAgain"), false, apply).open();
      return;
    }
    await apply();
  }

  private remapUnmanagedPaths(entry: TAbstractFile, oldPath: string): void {
    const previous = normalizeVaultPath(oldPath);
    const next = normalizeVaultPath(entry.path);
    const recursive = entry instanceof TFolder;
    let changed = false;
    const remap = (paths: string[]): void => {
      for (const [index, path] of paths.entries()) {
        const normalized = normalizeVaultPath(path);
        if (normalized !== previous && !(recursive && normalized.startsWith(`${previous}/`))) continue;
        paths[index] = normalized === previous ? next : `${next}${normalized.slice(previous.length)}`;
        changed = true;
      }
      if (changed) paths.sort((a, b) => a.localeCompare(b));
    };
    remap(this.settings.ignoredFolders);
    remap(this.settings.leafNoteExemptions);
    changed = remapNodeGraphSettingPaths(this.settings.nodeGraph, previous, next, recursive) || changed;
    if (changed) void this.saveSettings().catch((error) => this.reportReconcileError(error));
  }

  private removeDeletedNodeGraphPaths(path: string): void {
    const normalized = normalizeVaultPath(path);
    let changed = false;
    for (const paths of [
      this.settings.nodeGraph.includedSubtrees,
      this.settings.nodeGraph.excludedNodes,
      this.settings.nodeGraph.excludedSubtrees,
    ]) {
      const retained = paths.filter((candidate) => !isWithin(candidate, normalized));
      if (retained.length === paths.length) continue;
      paths.splice(0, paths.length, ...retained);
      changed = true;
    }
    if (changed) void this.saveSettings().catch((error) => this.reportReconcileError(error));
  }

  private showMenu(menu: Menu, anchor: ContentsMenuAnchor): void {
    if (isMouseEventAnchor(anchor)) {
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
      const sourcePath = this.service.notePathForFolder(folder.path);
      const linkText = this.app.metadataCache.fileToLinktext(file, sourcePath);
      await this.visuals.set(folder, [`[[${linkText}]]`]);
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
    const sourcePath = file.path;
    const from = editor.getCursor("from");
    const to = editor.getCursor("to");
    const tableContext = classifySelectionTableContext(from, to, (line) => editor.getLine(line));
    if (tableContext === "cross-cell") {
      new Notice(t("selectionCrossesTableCells"), 8000);
      return;
    }
    const folder = this.service.folderForFile(file) ?? this.app.vault.getRoot();
    const cursorLine = from.line;
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
    const wikiLink = buildSelectionWikiLink(notePath.slice(0, -3), selection, tableContext);
    new SelectionCreateModal(this.app, { parentPath, nodeName: name, notePath, alias, wikiLink }, async () => {
      if (editor.getSelection() !== selection) throw new Error("Selection changed after preview");
      if (file.path !== sourcePath || this.app.vault.getAbstractFileByPath(sourcePath) !== file) throw new Error("Source note changed after preview");
      const currentFrom = editor.getCursor("from");
      const currentTo = editor.getCursor("to");
      if (currentFrom.line !== from.line || currentFrom.ch !== from.ch || currentTo.line !== to.line || currentTo.ch !== to.ch) throw new Error("Selection changed after preview");
      if (classifySelectionTableContext(currentFrom, currentTo, (line) => editor.getLine(line)) !== tableContext) throw new Error("Table structure changed after preview");
      const options = alias === null ? { body: selection } : { alias, body: selection };
      const note = await this.service.createNode(parentPath, name, options);
      try {
        editor.replaceSelection(wikiLink);
      } catch (error) {
        if (note.parent !== null) {
          try { await this.service.deleteNode(note.parent); }
          catch (rollbackError) {
            throw new AggregateError([error, rollbackError], "Selection replacement failed and the new node could not be rolled back", { cause: error });
          }
        }
        throw error;
      }
      try { await this.app.workspace.getLeaf(false).openFile(note); }
      catch (error) { new Notice(formatError(error), 8000); }
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
    if (this.app.workspace.getActiveViewOfType(FolderNodeContentsView) !== null) return;
    const folder = this.currentFolder();
    for (const leaf of this.app.workspace.getLeavesOfType(CONTENTS_VIEW_TYPE)) {
      if (leaf.view instanceof FolderNodeContentsView) leaf.view.setFolder(folder?.path ?? "");
    }
  }

  private applyRefresh(batch: RefreshBatch): void {
    const explorerAffected = batch.full || [...batch.paths].some((path) =>
      normalizeVaultPath(path) === normalizeVaultPath(this.service.rootNotePath()) ||
      isCanonicalNodeNote(path) || this.service.getFolder(path) !== null);
    if (explorerAffected) this.explorer.refresh();
    for (const leaf of this.app.workspace.getLeavesOfType(CONTENTS_VIEW_TYPE)) {
      if (leaf.view instanceof FolderNodeContentsView) leaf.view.refresh(batch.full ? undefined : batch.paths);
    }
    this.refreshExtensionViews(batch);
  }

  protected refreshExtensionViews(batch: RefreshBatch): void {
    void batch;
  }
}

function isMouseEventAnchor(anchor: ContentsMenuAnchor): anchor is MouseEvent {
  return typeof (anchor as MouseEvent).clientX === "number" && typeof (anchor as MouseEvent).preventDefault === "function";
}
