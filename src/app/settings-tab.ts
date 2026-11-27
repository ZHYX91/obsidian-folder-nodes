import { App, Notice, PluginSettingTab, type DropdownComponent, type ExtraButtonComponent, type Setting, type SettingDefinitionItem } from "obsidian";

import type FolderNodesPlugin from "./plugin";
import { isEmojiFontPreference, SYSTEM_EMOJI_FONT, type EmojiFontFamily } from "../core/emoji-font";
import { isValidMomentTimestampFormat } from "../core/naming";
import type { NamingPart } from "../core/types";
import { formatObsidianTimestamp } from "../adapters/obsidian-timestamp-formatter";
import {
  assertSettingsWritable,
  lockSettingsPanel,
  renderSettingsPersistenceStatus,
} from "./settings-persistence-status";
import { LabeledSetting } from "../ui/labeled-setting";
import { PromptModal } from "../ui/prompt-modal";
import { addSettingsTabArrows } from "../ui/settings-tab-arrows";
import { detectInstalledEmojiFonts } from "../ui/emoji-fonts";
import { formatError, interfaceTextDirection, resolvedLanguage, t } from "../ui/i18n";
import { isInterfaceLanguage, languageOptions } from "../core/interface-languages";
import { renderVisual } from "../presentation/render-visual";

type TabId = "general" | "management" | "icons" | "naming" | "nodeGraph";
type ExemptionKind = "leaf" | "folder";

const TABS: TabId[] = ["general", "management", "icons", "naming", "nodeGraph"];

// Declarative settings are intentionally inactive. Obsidian 1.13 bypasses
// display() for non-empty definitions, removing the established top-tab surface
// and degrading the settings experience. Retain dormant definitions for tests only.
const ENABLE_DECLARATIVE_SETTINGS = false;
const PANEL_ID = "folder-nodes-settings-panel";

export class FolderNodesSettingTab extends PluginSettingTab {
  private removeTabArrows?: () => void;
  private activeTab: TabId = "general";
  private readonly expandedGuides = new Set<TabId>();
  private currentGuide: { tab: TabId; element: HTMLDetailsElement } | null = null;
  private installedEmojiFonts: EmojiFontFamily[] | null = null;
  private emojiFontScan: Promise<EmojiFontFamily[]> | null = null;

  public constructor(app: App, private readonly plugin: FolderNodesPlugin) { super(app, plugin); }

  public showManagement(): void { this.selectTab("management", true); }

  public override getSettingDefinitions(): SettingDefinitionItem[] {
    return ENABLE_DECLARATIVE_SETTINGS ? this.getDeclarativeSettingDefinitions() : [];
  }

  public getDeclarativeSettingDefinitions(): SettingDefinitionItem[] {
    return [
      { type: "page", name: t("general"), items: this.generalDefinitions() },
      { type: "page", name: t("management"), items: this.managementDefinitions() },
      { type: "page", name: t("icons"), items: this.iconDefinitions() },
      { type: "page", name: t("naming"), items: this.namingDefinitions() },
      { type: "page", name: t("nodeGraph"), items: this.nodeGraphDefinitions() },
    ];
  }

  public override getControlValue(key: string): unknown {
    const settings = this.plugin.settings;
    const values: Record<string, unknown> = {
      language: settings.language,
      homepageEnabled: settings.homepageEnabled,
      openHomepageOnStartup: settings.openHomepageOnStartup,
      hiddenNodesEnabled: settings.hiddenNodesEnabled,
      iconInheritance: settings.iconInheritance,
      emojiFont: settings.emojiFont,
      explorerIconPosition: settings.explorerIconPosition,
      showIconInNoteTitle: settings.showIconInNoteTitle,
      addSelectionAlias: settings.addSelectionAlias,
      createNodesFromLinks: settings.createNodesFromLinks,
      confirmSelectionCreation: settings.confirmSelectionCreation,
      nodeGraphEnabled: settings.nodeGraph.enabled,
      nodeGraphDefaultDimension: settings.nodeGraph.defaultDimension,
      allowNodeReparenting: settings.nodeGraph.allowNodeReparenting,
      nodeGraphLayoutDirection: settings.nodeGraph.layoutDirection,
      prefixEnabled: settings.prefix.enabled,
      prefixSource: settings.prefix.source,
      prefixSeparator: settings.prefix.separator,
      prefixCustomText: settings.prefix.customText,
      prefixTimestampFormat: settings.prefix.timestampFormat,
      suffixEnabled: settings.suffix.enabled,
      suffixSource: settings.suffix.source,
      suffixSeparator: settings.suffix.separator,
      suffixCustomText: settings.suffix.customText,
      suffixTimestampFormat: settings.suffix.timestampFormat,
    };
    return values[key];
  }

  public override async setControlValue(key: string, value: unknown): Promise<void> {
    assertSettingsWritable(this.plugin.getSettingsCompatibility());
    const settings = this.plugin.settings;
    let reconcileNodeGraph = false;
    let languageChanged = false;
    switch (key) {
      case "language":
        if (!isInterfaceLanguage(value)) throw new Error("Unsupported language");
        settings.language = value;
        languageChanged = true;
        new Notice(t("reloadLanguage"));
        break;
      case "homepageEnabled": settings.homepageEnabled = Boolean(value); this.plugin.refreshVisuals(); break;
      case "openHomepageOnStartup": settings.openHomepageOnStartup = Boolean(value); break;
      case "hiddenNodesEnabled": settings.hiddenNodesEnabled = Boolean(value); reconcileNodeGraph = true; break;
      case "iconInheritance": settings.iconInheritance = Boolean(value); this.plugin.refreshVisuals(); break;
      case "emojiFont":
        if (!isEmojiFontPreference(value)) throw new Error("Unsupported Emoji font");
        settings.emojiFont = value;
        this.plugin.applyEmojiFontSetting();
        break;
      case "explorerIconPosition":
        if (value !== "before" && value !== "after" && value !== "hidden") throw new Error("Unsupported icon position");
        settings.explorerIconPosition = value;
        this.plugin.refreshVisuals();
        break;
      case "showIconInNoteTitle": settings.showIconInNoteTitle = Boolean(value); this.plugin.refreshVisuals(); break;
      case "addSelectionAlias": settings.addSelectionAlias = Boolean(value); break;
      case "createNodesFromLinks": settings.createNodesFromLinks = Boolean(value); break;
      case "confirmSelectionCreation": settings.confirmSelectionCreation = Boolean(value); break;
      case "nodeGraphEnabled": settings.nodeGraph.enabled = Boolean(value); reconcileNodeGraph = true; break;
      case "allowNodeReparenting":
        if (typeof value !== "boolean") throw new Error("Expected a boolean for Node Graph reparenting");
        settings.nodeGraph.allowNodeReparenting = value;
        break;
      case "nodeGraphDefaultDimension":
        if (value !== "2d" && value !== "3d") throw new Error("Unsupported Node Graph dimension");
        settings.nodeGraph.defaultDimension = value;
        break;
      case "nodeGraphLayoutDirection":
        if (value !== "left-to-right" && value !== "top-to-bottom") throw new Error("Unsupported Node Graph layout direction");
        settings.nodeGraph.layoutDirection = value;
        reconcileNodeGraph = true;
        break;
      case "prefixEnabled": settings.prefix.enabled = Boolean(value); break;
      case "prefixSource": settings.prefix.source = this.namingSource(value); break;
      case "prefixSeparator": settings.prefix.separator = String(value); break;
      case "prefixCustomText": settings.prefix.customText = String(value); break;
      case "prefixTimestampFormat": settings.prefix.timestampFormat = this.timestampFormat(value); break;
      case "suffixEnabled": settings.suffix.enabled = Boolean(value); break;
      case "suffixSource": settings.suffix.source = this.namingSource(value); break;
      case "suffixSeparator": settings.suffix.separator = String(value); break;
      case "suffixCustomText": settings.suffix.customText = String(value); break;
      case "suffixTimestampFormat": settings.suffix.timestampFormat = this.timestampFormat(value); break;
      default: throw new Error(`Unsupported Folder Nodes setting: ${key}`);
    }
    if (languageChanged) await this.plugin.applyLanguageSetting();
    else await this.plugin.saveSettings();
    if (reconcileNodeGraph) await this.plugin.reconcileSettingsChange();
    updateDeclarativeSettingTab(this);
  }

  public override hide(): void {
    this.removeTabArrows?.();
    delete this.removeTabArrows;
    this.expandedGuides.clear();
    this.currentGuide = null;
    this.plugin.setSettingsDocument(null);
    super.hide();
  }

  public override display(): void {
    const active = this.containerEl.ownerDocument.activeElement;
    const focusKey = active && this.containerEl.contains(active)
      ? active.closest<HTMLElement>("[data-folder-nodes-setting-key]")?.dataset.folderNodesSettingKey
      : undefined;
    const scrollTop = this.containerEl.scrollTop;
    if (this.currentGuide) {
      const { tab, element } = this.currentGuide;
      if (element.open) this.expandedGuides.add(tab);
      else this.expandedGuides.delete(tab);
      this.currentGuide = null;
    }
    this.removeTabArrows?.();
    this.plugin.setSettingsDocument(this.containerEl.ownerDocument);
    this.containerEl.empty();
    this.containerEl.addClass("folder-nodes-settings");
    this.containerEl.dir = interfaceTextDirection();
    this.containerEl.lang = resolvedLanguage();
    const tabs = this.containerEl.createDiv({
      cls: "folder-nodes-tabs",
      attr: { role: "tablist", "aria-label": t("settings"), "aria-orientation": "horizontal" },
    });
    for (const id of TABS) this.addTabButton(tabs, id, this.tabLabel(id));
    this.removeTabArrows = addSettingsTabArrows(tabs, interfaceTextDirection(), t("showEarlierTabs"), t("showMoreTabs"));
    const panel = this.containerEl.createDiv({
      cls: "folder-nodes-tab-panel",
      attr: { id: PANEL_ID, role: "tabpanel", "aria-labelledby": this.tabId(this.activeTab), tabindex: "0" },
    });
    const compatibility = this.plugin.getSettingsCompatibility();
    if (compatibility.status === "incompatible") panel.setAttribute("aria-disabled", "true");
    const status = panel.createDiv({ cls: "folder-nodes-settings-persistence-status" });
    renderSettingsPersistenceStatus(
      status,
      compatibility,
      this.plugin.getSettingsSaveState(),
      () => this.retrySettingsSave(),
    );
    if (this.activeTab === "general") this.renderGeneral(panel);
    else if (this.activeTab === "management") this.renderManagement(panel);
    else if (this.activeTab === "icons") this.renderIcons(panel);
    else if (this.activeTab === "naming") this.renderNaming(panel);
    else this.renderNodeGraph(panel);
    lockSettingsPanel(panel, compatibility.status === "incompatible");
    if (focusKey !== undefined) {
      const rows = panel.querySelectorAll<HTMLElement>("[data-folder-nodes-setting-key]");
      const row = Array.from(rows).find((element) => element.dataset.folderNodesSettingKey === focusKey);
      row?.querySelector<HTMLElement>('select:not(:disabled), input:not(:disabled), [role="switch"]:not([aria-disabled="true"])')
        ?.focus({ preventScroll: true });
      this.containerEl.scrollTop = scrollTop;
    }
  }

  public refreshPersistenceStatus(): void {
    if (!this.containerEl.isConnected) return;
    const status = this.containerEl.querySelector<HTMLElement>(".folder-nodes-settings-persistence-status");
    if (status === null) return;
    status.empty();
    renderSettingsPersistenceStatus(
      status,
      this.plugin.getSettingsCompatibility(),
      this.plugin.getSettingsSaveState(),
      () => this.retrySettingsSave(),
    );
    const panel = status.closest<HTMLElement>("[role=tabpanel]");
    if (panel !== null) lockSettingsPanel(panel, this.plugin.getSettingsCompatibility().status === "incompatible");
  }

  private async retrySettingsSave(): Promise<void> {
    try {
      await this.plugin.retrySettingsSave();
    } catch {
      // The retained snapshot and visible pending state remain available.
    }
    this.refreshPersistenceStatus();
  }

  private addTabButton(container: HTMLElement, id: TabId, label: string): void {
    const isActive = this.activeTab === id;
    const button = container.createEl("button", {
      text: label,
      cls: `folder-nodes-tab${isActive ? " is-active" : ""}`,
      attr: { id: this.tabId(id), role: "tab", "aria-selected": String(isActive), "aria-controls": PANEL_ID, tabindex: isActive ? "0" : "-1" },
    });
    button.type = "button";
    button.addEventListener("click", () => this.selectTab(id, button.ownerDocument.activeElement === button));
    button.addEventListener("keydown", (event) => {
      const currentIndex = TABS.indexOf(id);
      let targetIndex: number | null = null;
      const isRtl = getComputedStyle(container).direction === "rtl";
      if (event.key === "ArrowRight") targetIndex = (currentIndex + (isRtl ? -1 : 1) + TABS.length) % TABS.length;
      else if (event.key === "ArrowLeft") targetIndex = (currentIndex + (isRtl ? 1 : -1) + TABS.length) % TABS.length;
      else if (event.key === "Home") targetIndex = 0;
      else if (event.key === "End") targetIndex = TABS.length - 1;
      if (targetIndex === null) return;
      event.preventDefault();
      const target = TABS[targetIndex];
      if (target !== undefined) this.selectTab(target, true);
    });
  }

  private selectTab(id: TabId, focus: boolean): void {
    if (this.activeTab !== id) { this.activeTab = id; this.display(); }
    if (focus) this.containerEl.querySelector<HTMLElement>(`#${this.tabId(id)}`)?.focus({ preventScroll: true });
  }

  private tabLabel(id: TabId): string {
    return id === "general" ? t("general")
      : id === "management" ? t("management")
        : id === "icons" ? t("icons")
          : id === "naming" ? t("naming") : t("nodeGraph");
  }
  private tabId(id: TabId): string { return `folder-nodes-settings-tab-${id}`; }

  private generalDefinitions(): SettingDefinitionItem[] {
    return [
      { name: t("language"), desc: t("languageDesc"), control: { type: "dropdown", key: "language", defaultValue: "auto", options: languageOptions(t("auto")) } },
      { name: t("applyHiddenNodes"), desc: t("applyHiddenNodesDesc"), control: { type: "toggle", key: "hiddenNodesEnabled", defaultValue: true } },
      { name: t("enableHomepage"), desc: t("enableHomepageDesc"), control: { type: "toggle", key: "homepageEnabled", defaultValue: false } },
      { name: t("openHomepageOnStartup"), desc: t("openHomepageOnStartupDesc"), visible: this.plugin.settings.homepageEnabled, control: { type: "toggle", key: "openHomepageOnStartup", defaultValue: false } },
      this.actionDefinition(t("openHomepage"), t("openHomepageDesc"), (setting) => {
        setting.addButton((button) => { button.setButtonText(t("openHomepage")).setDisabled(!this.plugin.settings.homepageEnabled).onClick(() => void this.plugin.openHomepage()); });
      }),
    ];
  }

  private managementDefinitions(): SettingDefinitionItem[] {
    return [
      ...this.unmanagedRuleDefinitions("leaf"),
      ...this.unmanagedRuleDefinitions("folder"),
      this.actionDefinition(t("batchOrganize"), t("batchOrganizeDesc"), (setting) => {
        setting.addButton((button) => { button.setCta().setButtonText(t("previewOrganizePlan")).onClick(() => { this.plugin.openBatchOrganize(); }); });
      }),
      this.actionDefinition(t("propertyMigration"), t("propertyMigrationDesc"), (setting) => {
        setting.addButton((button) => { button.setButtonText(t("previewPropertyMigration")).onClick(() => { this.plugin.openPropertyMigration(); }); });
      }),
      this.actionDefinition(t("health"), t("healthDesc"), (setting) => {
        setting.addButton((button) => { button.setButtonText(t("health")).onClick(() => { this.plugin.showHealth(); }); });
      }),
    ];
  }

  private iconDefinitions(): SettingDefinitionItem[] {
    return [
      { name: t("iconInheritance"), desc: t("iconInheritanceDesc"), control: { type: "toggle", key: "iconInheritance", defaultValue: true } },
      { name: t("explorerIconPosition"), desc: t("explorerIconPositionDesc"), control: { type: "dropdown", key: "explorerIconPosition", defaultValue: "before", options: { before: t("beforeName"), after: t("afterName"), hidden: t("hidden") } } },
      { name: t("showIconInNoteTitle"), desc: t("showIconInNoteTitleDesc"), control: { type: "toggle", key: "showIconInNoteTitle", defaultValue: false } },
    ];
  }

  private namingDefinitions(): SettingDefinitionItem[] {
    const settings = this.plugin.settings;
    const sourceOptions = { "current-file": t("currentFile"), "current-node": t("currentNode"), "current-heading": t("currentHeading"), timestamp: t("timestamp"), custom: t("customText") };
    return [
      { name: t("confirmSelectionCreation"), desc: t("confirmSelectionCreationDesc"), control: { type: "toggle", key: "confirmSelectionCreation", defaultValue: true } },
      { name: t("aliases"), desc: t("aliasesDesc"), control: { type: "toggle", key: "addSelectionAlias", defaultValue: true } },
      { name: t("createNodesFromLinks"), desc: t("createNodesFromLinksDesc"), control: { type: "toggle", key: "createNodesFromLinks", defaultValue: false } },
      { name: `${t("prefix")}: ${t("enabled")}`, control: { type: "toggle", key: "prefixEnabled", defaultValue: false } },
      { name: `${t("prefix")}: ${t("source")}`, visible: settings.prefix.enabled, control: { type: "dropdown", key: "prefixSource", defaultValue: "current-file", options: sourceOptions } },
      { name: `${t("prefix")}: ${t("separator")}`, visible: settings.prefix.enabled, control: { type: "text", key: "prefixSeparator" } },
      { name: `${t("prefix")}: ${t("customText")}`, visible: settings.prefix.enabled && settings.prefix.source === "custom", control: { type: "text", key: "prefixCustomText" } },
      { name: `${t("prefix")}: ${t("timestampFormat")}`, desc: t("timestampFormatDesc"), visible: settings.prefix.enabled && settings.prefix.source === "timestamp", control: { type: "text", key: "prefixTimestampFormat" } },
      { name: `${t("suffix")}: ${t("enabled")}`, control: { type: "toggle", key: "suffixEnabled", defaultValue: false } },
      { name: `${t("suffix")}: ${t("source")}`, visible: settings.suffix.enabled, control: { type: "dropdown", key: "suffixSource", defaultValue: "timestamp", options: sourceOptions } },
      { name: `${t("suffix")}: ${t("separator")}`, visible: settings.suffix.enabled, control: { type: "text", key: "suffixSeparator" } },
      { name: `${t("suffix")}: ${t("customText")}`, visible: settings.suffix.enabled && settings.suffix.source === "custom", control: { type: "text", key: "suffixCustomText" } },
      { name: `${t("suffix")}: ${t("timestampFormat")}`, desc: t("timestampFormatDesc"), visible: settings.suffix.enabled && settings.suffix.source === "timestamp", control: { type: "text", key: "suffixTimestampFormat" } },
      { name: t("preview"), desc: this.plugin.previewSelectionName(t("sampleSelection")), searchable: false },
    ];
  }

  private nodeGraphDefinitions(): SettingDefinitionItem[] {
    return [
      { name: t("enableNodeGraph"), desc: t("enableNodeGraphDesc"), control: { type: "toggle", key: "nodeGraphEnabled", defaultValue: true } },
      { name: t("allowNodeReparenting"), desc: t("allowNodeReparentingDesc"), control: { type: "toggle", key: "allowNodeReparenting", defaultValue: false } },
      { name: t("nodeGraphDefaultDimension"), control: { type: "dropdown", key: "nodeGraphDefaultDimension", defaultValue: "2d", options: { "2d": "2D", "3d": "3D" } } },
      { name: t("nodeGraphLayoutDirection"), desc: t("nodeGraphLayoutDirectionDesc"), control: { type: "dropdown", key: "nodeGraphLayoutDirection", defaultValue: "left-to-right", options: { "left-to-right": t("nodeGraphLeftToRight"), "top-to-bottom": t("nodeGraphTopToBottom") } } },
    ];
  }

  private unmanagedRuleDefinitions(kind: ExemptionKind): SettingDefinitionItem[] {
    const paths = kind === "leaf" ? this.plugin.settings.leafNoteExemptions : this.plugin.settings.ignoredFolders;
    const prefixes = kind === "leaf" ? this.plugin.settings.leafNotePrefixes : this.plugin.settings.ignoredFolderPrefixes;
    const heading = kind === "leaf" ? t("leafExemptions") : t("folderExemptions");
    const rules = [
      ...paths.map((value) => ({ type: "path" as const, value })),
      ...prefixes.map((value) => ({ type: "prefix" as const, value })),
    ];
    const items = [
      ...paths.map((path) => ({ name: path, desc: t("exactPathRule") })),
      ...prefixes.map((prefix) => ({ name: t("nameStartsWith", { prefix }), desc: t("nameStartRule") })),
    ];
    return [
      {
        type: "list",
        heading,
        emptyState: t("noUnmanagedRules"),
        items,
        onDelete: (index) => {
          const rule = rules[index];
          if (rule !== undefined) void this.removeUnmanagedRule(kind, rule.type, rule.value);
        },
      },
      this.actionDefinition(t("addRule"), t("addRuleDesc"), (setting) => {
        setting.addButton((button) => button.setButtonText(t("addPathRule")).onClick(() => this.promptExemption(kind)));
        setting.addButton((button) => button.setButtonText(t("addNameStartRule")).onClick(() => this.promptPrefix(kind)));
      }),
    ];
  }

  private actionDefinition(name: string, desc: string, render: (setting: Setting) => void): SettingDefinitionItem {
    return { name, desc, searchable: false, render };
  }

  private namingSource(value: unknown): NamingPart["source"] {
    if (value === "current-file" || value === "current-node" || value === "current-heading" || value === "timestamp" || value === "custom") return value;
    throw new Error("Unsupported naming source");
  }

  private renderGeneral(panel: HTMLElement): void {
    new LabeledSetting(panel).setFocusKey("language").setName(t("language")).setDesc(t("languageDesc")).addDropdown((dropdown) => dropdown
      .addOptions(languageOptions(t("auto"))).setValue(this.plugin.settings.language).onChange(async (value) => {
        this.plugin.settings.language = value as typeof this.plugin.settings.language;
        await this.plugin.applyLanguageSetting();
        new Notice(t("reloadLanguage"));
        this.display();
      }));
    new LabeledSetting(panel).setName(t("applyHiddenNodes")).setDesc(t("applyHiddenNodesDesc")).addSwitch(this.plugin.settings.hiddenNodesEnabled, async (value) => {
        this.plugin.settings.hiddenNodesEnabled = value;
        await this.plugin.saveSettings();
        await this.plugin.reconcileSettingsChange();
      });
    new LabeledSetting(panel).setFocusKey("homepageEnabled").setName(t("enableHomepage")).setDesc(t("enableHomepageDesc")).addSwitch(this.plugin.settings.homepageEnabled, async (value) => {
      this.plugin.settings.homepageEnabled = value; await this.plugin.saveSettings(); this.plugin.refreshVisuals(); this.display();
    });
    if (this.plugin.settings.homepageEnabled) new LabeledSetting(panel).setName(t("openHomepageOnStartup")).setDesc(t("openHomepageOnStartupDesc")).addSwitch(this.plugin.settings.openHomepageOnStartup, async (value) => {
      this.plugin.settings.openHomepageOnStartup = value; await this.plugin.saveSettings();
    });
    new LabeledSetting(panel).setName(t("openHomepage")).setDesc(t("openHomepageDesc")).addButton((button) => button.setButtonText(t("openHomepage")).setDisabled(!this.plugin.settings.homepageEnabled).onClick(() => void this.plugin.openHomepage()));
    const support = new LabeledSetting(panel).setName(t("helpAndSupport")).setClass("folder-nodes-settings-support");
    const locale = resolvedLanguage();
    const guide = locale === "en" ? "README.md" : `docs/i18n/README.${locale}.md`;
    support.controlEl.createEl("a", {
      text: t("userGuide"),
      attr: { href: `https://github.com/ZHYX91/obsidian-folder-nodes/blob/main/${guide}` },
      cls: "external-link",
    });
    support.controlEl.createEl("a", {
      text: t("reportIssue"),
      attr: { href: "https://github.com/ZHYX91/obsidian-folder-nodes/issues/new/choose" },
      cls: "external-link",
    });
  }

  private createGuide(panel: HTMLElement, title: string): HTMLDivElement {
    const element = panel.createEl("details", { cls: "folder-nodes-settings-guide" });
    element.open = this.expandedGuides.has(this.activeTab);
    element.createEl("summary", { text: title });
    this.currentGuide = { tab: this.activeTab, element };
    return element.createDiv({ cls: "folder-nodes-settings-guide-body" });
  }

  private renderManagement(panel: HTMLElement): void {
    // This distinction is required before running any structural operation.
    panel.createEl("p", { cls: "folder-nodes-settings-guide-brief", text: t("managementGuideBoundary") });
    this.renderUnmanagedGroup(panel, "leaf");
    this.renderUnmanagedGroup(panel, "folder");
    new LabeledSetting(panel).setName(t("structureMaintenance")).setDesc(t("structureMaintenanceDesc")).setHeading();
    new LabeledSetting(panel)
      .setName(t("batchOrganize"))
      .setDesc(t("batchOrganizeDesc"))
      .addButton((button) => button.setCta().setButtonText(t("previewOrganizePlan")).onClick(() => this.plugin.openBatchOrganize()));
    new LabeledSetting(panel)
      .setName(t("propertyMigration"))
      .setDesc(t("propertyMigrationDesc"))
      .addButton((button) => button.setButtonText(t("previewPropertyMigration")).onClick(() => this.plugin.openPropertyMigration()));
    new LabeledSetting(panel).setName(t("health")).setDesc(t("healthDesc")).addButton((button) => button.setButtonText(t("health")).onClick(() => this.plugin.showHealth()));
    const body = this.createGuide(panel, t("managementGuideTitle"));
    body.createEl("p", { text: t("managementGuideStructure") });
    body.createEl("p", { text: t("managementGuideActions") });
  }

  private renderIcons(panel: HTMLElement): void {
    panel.createEl("p", { cls: "folder-nodes-settings-guide-brief", text: t("iconGuideIntro") });
    panel.createEl("p", { cls: "folder-nodes-settings-guide-brief", text: t("iconGuideRootNote") });
    this.renderEmojiFontSetting(panel);
    new LabeledSetting(panel).setName(t("iconInheritance")).setDesc(t("iconInheritanceDesc")).addSwitch(this.plugin.settings.iconInheritance, async (value) => {
      this.plugin.settings.iconInheritance = value; await this.plugin.saveSettings(); this.plugin.refreshVisuals();
    });
    new LabeledSetting(panel).setName(t("explorerIconPosition")).setDesc(t("explorerIconPositionDesc")).addDropdown((dropdown) => dropdown.addOptions({ before: t("beforeName"), after: t("afterName"), hidden: t("hidden") }).setValue(this.plugin.settings.explorerIconPosition).onChange(async (value) => {
      this.plugin.settings.explorerIconPosition = value as typeof this.plugin.settings.explorerIconPosition; await this.plugin.saveSettings(); this.plugin.refreshVisuals();
    }));
    new LabeledSetting(panel).setName(t("showIconInNoteTitle")).setDesc(t("showIconInNoteTitleDesc")).addSwitch(this.plugin.settings.showIconInNoteTitle, async (value) => {
      this.plugin.settings.showIconInNoteTitle = value; await this.plugin.saveSettings(); this.plugin.refreshVisuals();
    });
    this.renderIconGuide(panel);
  }

  private renderEmojiFontSetting(panel: HTMLElement): void {
    const row = new LabeledSetting(panel).setName(t("emojiFont"));
    let dropdown: DropdownComponent;
    let refresh: ExtraButtonComponent;
    const update = (): void => {
      const installed = this.installedEmojiFonts;
      const current = this.plugin.settings.emojiFont;
      const unavailable = installed !== null && current !== SYSTEM_EMOJI_FONT && !installed.includes(current);
      const options: Record<string, string> = { [SYSTEM_EMOJI_FONT]: t("systemDefault") };
      for (const family of installed ?? []) options[family] = family;
      if (current !== SYSTEM_EMOJI_FONT && options[current] === undefined) {
        options[current] = unavailable ? `${current} · ${t("fontUnavailable")}` : current;
      }
      const status = installed === null ? t("detectingFonts") : unavailable ? t("emojiFontUnavailable") : "";
      row.setDesc([t("emojiFontDesc"), status].filter(Boolean).join(" "));
      const readOnly = this.plugin.getSettingsCompatibility().status === "incompatible";
      const disabled = installed === null || readOnly;
      dropdown.selectEl.replaceChildren();
      dropdown.addOptions(options).setValue(current).setDisabled(disabled);
      // The host removes tabindex from disabled icon buttons. Keep keyboard focus
      // on a rescan already in progress while exposing its unavailable state.
      refresh.setDisabled(readOnly);
      refresh.extraSettingsEl.classList.toggle("is-disabled", disabled);
      refresh.extraSettingsEl.setAttribute("aria-disabled", String(disabled));
    };
    const scan = async (): Promise<void> => {
      if (this.emojiFontScan === null) {
        this.installedEmojiFonts = null;
        this.emojiFontScan = detectInstalledEmojiFonts().then((families) => {
          this.installedEmojiFonts = families;
          this.emojiFontScan = null;
          return families;
        });
      }
      update();
      await this.emojiFontScan;
      if (this.containerEl.contains(row.settingEl)) update();
    };
    row.addDropdown((control) => {
      dropdown = control;
      control.onChange(async (value) => {
        if (!isEmojiFontPreference(value)) return;
        this.plugin.settings.emojiFont = value;
        await this.plugin.saveSettings();
        this.plugin.applyEmojiFontSetting();
        if (this.containerEl.contains(row.settingEl)) update();
      });
    }).addNamedAction(t("redetectFonts"), (button) => {
      refresh = button;
      button.setIcon("refresh-cw").onClick(() => {
        if (this.emojiFontScan === null) void scan();
      });
    });

    const preview = panel.createDiv({ cls: "folder-nodes-emoji-font-preview" });
    preview.createSpan({ cls: "folder-nodes-emoji-font-preview-label", text: t("emojiFontPreview") });
    preview.createSpan({
      cls: "folder-nodes-emoji-font-preview-sample",
      text: "📔 🫠 🩷 👨‍👩‍👧‍👦 🏳️‍🌈 🇨🇳",
      attr: { lang: "zxx" },
    });

    if (this.installedEmojiFonts === null) void scan();
    else update();
  }

  private renderIconGuide(panel: HTMLElement): void {
    const body = this.createGuide(panel, t("iconGuideTitle"));
    const format = body.createEl("section", { cls: "folder-nodes-icon-guide-section" });
    new LabeledSetting(format).setName(t("iconGuideFormatTitle")).setHeading();
    format.createEl("p", { text: t("iconGuideFormats") });
    const example = format.createDiv({ cls: "folder-nodes-settings-guide-example" });
    example.createSpan({ text: t("iconPropertyExampleLabel") });
    example.createEl("code", { text: "icon: 💰", attr: { dir: "ltr" } });
    format.createEl("p", { text: t("iconDistinctionDesc") });
    const comparison = format.createDiv({ cls: "folder-nodes-icon-comparison", attr: { "aria-label": t("iconDistinctionTitle") } });
    this.renderIconComparisonRow(comparison, t("iconFromProperty"), "A", "Project", true);
    this.renderIconComparisonRow(comparison, t("characterInFilename"), "", "A Project", false);
    this.renderIconComparisonRow(comparison, t("iconFromProperty"), "📓", "Project", true);
    this.renderIconComparisonRow(comparison, t("characterInFilename"), "", "📓 Project", false);

    const order = body.createEl("section", { cls: "folder-nodes-icon-guide-section" });
    new LabeledSetting(order).setName(t("iconGuideOrderTitle")).setHeading();
    order.createEl("p", { text: t("iconGuideOrder") });

    const color = body.createEl("section", { cls: "folder-nodes-icon-guide-section" });
    new LabeledSetting(color).setName(t("iconGuideColorTitle")).setHeading();
    color.createEl("p", { text: t("iconColorBehavior") });
  }

  private renderIconComparisonRow(container: HTMLElement, label: string, iconValue: string, name: string, propertyIcon: boolean): void {
    const row = container.createDiv({ cls: "folder-nodes-icon-comparison-row" });
    row.createSpan({ cls: "folder-nodes-icon-comparison-label", text: label });
    const example = row.createSpan({ cls: "folder-nodes-icon-comparison-example" });
    if (propertyIcon) {
      const icon = example.createSpan({ cls: "folder-nodes-settings-icon-demo-slot" });
      renderVisual(icon, { kind: /\p{Extended_Pictographic}/u.test(iconValue) ? "emoji" : "glyph", value: iconValue, accent: null, inheritedFrom: null }, label);
    }
    example.createSpan({ text: name });
  }

  private renderNaming(panel: HTMLElement): void {
    panel.createEl("p", { cls: "folder-nodes-settings-guide-brief", text: t("creationGuideSelection") });
    panel.createEl("p", { cls: "folder-nodes-settings-guide-brief", text: t("creationGuideScope") });
    new LabeledSetting(panel).setName(t("confirmSelectionCreation")).setDesc(t("confirmSelectionCreationDesc")).addSwitch(this.plugin.settings.confirmSelectionCreation, async (value) => {
      this.plugin.settings.confirmSelectionCreation = value; await this.plugin.saveSettings();
    });
    new LabeledSetting(panel).setName(t("createNodesFromLinks")).setDesc(t("createNodesFromLinksDesc")).addSwitch(this.plugin.settings.createNodesFromLinks, async (value) => {
      this.plugin.settings.createNodesFromLinks = value; await this.plugin.saveSettings();
    });
    new LabeledSetting(panel).setName(t("aliases")).setDesc(t("aliasesDesc")).addSwitch(this.plugin.settings.addSelectionAlias, async (value) => {
      this.plugin.settings.addSelectionAlias = value; await this.plugin.saveSettings();
    });
    this.renderNamingGuide(panel);
    this.renderNamingPart(panel, t("prefix"), this.plugin.settings.prefix);
    this.renderNamingPart(panel, t("suffix"), this.plugin.settings.suffix);
    const preview = panel.createDiv({ cls: "folder-nodes-name-preview" });
    preview.createEl("strong", { text: `${t("preview")}: ` });
    preview.createSpan({ cls: "folder-nodes-name-preview-value", text: this.plugin.previewSelectionName(t("sampleSelection")) });
  }

  private renderNodeGraph(panel: HTMLElement): void {
    const settings = this.plugin.settings.nodeGraph;
    new LabeledSetting(panel)
      .setFocusKey("nodeGraphEnabled")
      .setName(t("enableNodeGraph"))
      .setDesc(t("enableNodeGraphDesc"))
      .addSwitch(settings.enabled, async (value) => {
        settings.enabled = value;
        await this.saveNodeGraphSettings(true);
        this.display();
      });
    if (!settings.enabled) {
      panel.createEl("p", { cls: "setting-item-description", text: t("nodeGraphDisabledDesc") });
      return;
    }

    new LabeledSetting(panel).setName(t("nodeGraphDefaults")).setDesc(t("nodeGraphDefaultsDesc")).setHeading();
    new LabeledSetting(panel).setName(t("nodeGraphDefaultDimension")).addDropdown((dropdown) => dropdown
      .addOptions({ "2d": "2D", "3d": "3D" })
      .setValue(settings.defaultDimension)
      .onChange(async (value) => {
        if (value !== "2d" && value !== "3d") return;
        settings.defaultDimension = value;
        await this.saveNodeGraphSettings(false);
      }));
    new LabeledSetting(panel).setName(t("nodeGraphLayoutDirection")).setDesc(t("nodeGraphLayoutDirectionDesc")).addDropdown((dropdown) => dropdown
      .addOptions({ "left-to-right": t("nodeGraphLeftToRight"), "top-to-bottom": t("nodeGraphTopToBottom") })
      .setValue(settings.layoutDirection)
      .onChange(async (value) => {
        if (value !== "left-to-right" && value !== "top-to-bottom") return;
        settings.layoutDirection = value;
        await this.saveNodeGraphSettings(true);
      }));
    new LabeledSetting(panel)
      .setFocusKey("allowNodeReparenting")
      .setName(t("allowNodeReparenting"))
      .setDesc(t("allowNodeReparentingDesc"))
      .addSwitch(settings.allowNodeReparenting, (value) => this.setControlValue("allowNodeReparenting", value));
    new LabeledSetting(panel).setName(t("nodeGraphPerformance")).setDesc(t("nodeGraphPerformanceDesc")).setHeading();
    this.renderGraphNumberSetting(panel, "largeGraphThreshold", t("nodeGraphCanvasThreshold"), t("nodeGraphCanvasThresholdDesc"), 50, 10_000);
    this.renderGraphNumberSetting(panel, "overviewEdgeLimit", t("nodeGraphEdgeLimit"), t("nodeGraphEdgeLimitDesc"), 100, 100_000);

  }

  private renderGraphNumberSetting(
    panel: HTMLElement,
    key: "largeGraphThreshold" | "overviewEdgeLimit",
    name: string,
    description: string,
    minimum: number,
    maximum: number,
  ): void {
    const setting = new LabeledSetting(panel).setName(name).setDesc(description);
    setting.addText((text) => {
      const input = text.inputEl;
      input.type = "number";
      input.dir = "ltr";
      input.min = String(minimum);
      input.max = String(maximum);
      input.step = "1";
      text.setValue(String(this.plugin.settings.nodeGraph[key]));
      const validate = (showMessage: boolean): number | null => {
        const raw = input.value.trim();
        const numeric = raw === "" ? NaN : Number(raw);
        const valid = Number.isInteger(numeric) && numeric >= minimum && numeric <= maximum;
        input.toggleClass("is-invalid", !valid);
        input.setAttr("aria-invalid", String(!valid));
        setting.setDesc(valid || !showMessage
          ? description
          : description + " " + t("nodeGraphNumberInvalid", { minimum, maximum }));
        return valid ? numeric : null;
      };
      const commit = (): void => {
        const value = validate(true);
        if (value === null || value === this.plugin.settings.nodeGraph[key]) return;
        this.plugin.settings.nodeGraph[key] = value;
        void this.saveNodeGraphSettings(true).catch(() => {
          // SettingsSaveCoordinator retains the snapshot and shows Retry in place.
        });
      };
      text.onChange(() => { validate(false); });
      input.addEventListener("blur", commit);
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        } else if (event.key === "Escape") {
          event.preventDefault();
          input.value = String(this.plugin.settings.nodeGraph[key]);
          validate(false);
        }
      });
    });
  }

  private async saveNodeGraphSettings(refresh: boolean): Promise<void> {
    await this.plugin.saveSettings();
    if (refresh) await this.plugin.reconcileSettingsChange();
    updateDeclarativeSettingTab(this);
  }

  private renderNamingGuide(panel: HTMLElement): void {
    const body = this.createGuide(panel, t("creationGuideTitle"));
    this.creationExample(body, "[[a]]", "a/a.md", null);
    this.creationExample(body, "[[a|b]]", "a/a.md", t("creationGuideAliasResult"));
  }

  private creationExample(container: HTMLElement, source: string, target: string, detail: string | null): void {
    const example = container.createDiv({ cls: "folder-nodes-settings-guide-example" });
    const mapping = example.createSpan({ cls: "folder-nodes-settings-guide-mapping", attr: { dir: "ltr" } });
    mapping.createEl("code", { text: source });
    mapping.createSpan({ text: "→" });
    mapping.createEl("code", { text: target });
    if (detail !== null) example.createSpan({ text: detail });
  }

  private renderNamingPart(panel: HTMLElement, label: string, part: NamingPart): void {
    new LabeledSetting(panel).setName(label).setHeading();
    const enabled = new LabeledSetting(panel).setName(`${label}: ${t("enabled")}`);
    const options = panel.createDiv();
    enabled.addSwitch(part.enabled, (value) => {
      part.enabled = value;
      options.empty();
      if (value) this.renderNamingOptions(panel, options, label, part);
      this.updatePreview(panel);
      return this.plugin.saveSettings();
    });
    if (part.enabled) this.renderNamingOptions(panel, options, label, part);
  }

  private renderNamingOptions(panel: HTMLElement, options: HTMLElement, label: string, part: NamingPart): void {
    const source = new LabeledSetting(options).setName(`${label}: ${t("source")}`);
    new LabeledSetting(options).setName(`${label}: ${t("separator")}`).addText((text) => text.setValue(part.separator).onChange((value) => {
      part.separator = value;
      this.updatePreview(panel);
      return this.plugin.saveSettings();
    }));
    const fields = options.createDiv();
    source.addDropdown((dropdown) => dropdown.addOptions({
      "current-file": t("currentFile"), "current-node": t("currentNode"), "current-heading": t("currentHeading"), timestamp: t("timestamp"), custom: t("customText"),
    }).setValue(part.source).onChange((value) => {
      part.source = value as NamingPart["source"];
      fields.empty();
      this.renderNamingSourceInput(panel, fields, label, part);
      this.updatePreview(panel);
      return this.plugin.saveSettings();
    }));
    this.renderNamingSourceInput(panel, fields, label, part);
  }

  private renderNamingSourceInput(panel: HTMLElement, fields: HTMLElement, label: string, part: NamingPart): void {
    if (part.source === "custom") new LabeledSetting(fields).setName(`${label}: ${t("customText")}`).addText((text) => text.setValue(part.customText).onChange((value) => {
      part.customText = value;
      this.updatePreview(panel);
      return this.plugin.saveSettings();
    }));
    if (part.source === "timestamp") {
      const setting = new LabeledSetting(fields).setName(`${label}: ${t("timestampFormat")}`);
      const updateDescription = (value: string) => {
        const valid = isValidMomentTimestampFormat(value);
        setting.setDesc(valid
          ? `${t("timestampFormatDesc")} · ${t("preview")}: ${formatObsidianTimestamp(new Date(), value)}`
          : t("invalidTimestampFormat"));
        return valid;
      };
      setting.addText((text) => {
        text.setValue(part.timestampFormat);
        updateDescription(part.timestampFormat);
        text.onChange((value) => {
          const valid = updateDescription(value);
          text.inputEl.toggleClass("is-invalid", !valid);
          text.inputEl.setAttr("aria-invalid", String(!valid));
          if (!valid) return;
          part.timestampFormat = value;
          this.updatePreview(panel);
          return this.plugin.saveSettings();
        });
      });
    }
  }

  private timestampFormat(value: unknown): string {
    const format = String(value);
    if (!isValidMomentTimestampFormat(format)) throw new Error("Unsupported Obsidian/Moment timestamp format");
    return format;
  }

  private renderUnmanagedGroup(panel: HTMLElement, kind: ExemptionKind): void {
    const paths = kind === "leaf" ? this.plugin.settings.leafNoteExemptions : this.plugin.settings.ignoredFolders;
    const prefixes = kind === "leaf" ? this.plugin.settings.leafNotePrefixes : this.plugin.settings.ignoredFolderPrefixes;
    new LabeledSetting(panel)
      .setName(kind === "leaf" ? t("leafExemptions") : t("folderExemptions"))
      .setDesc(kind === "leaf" ? t("leafExemptionsDesc") : t("folderExemptionsDesc"))
      .setHeading();
    for (const path of paths) new LabeledSetting(panel)
      .setName(path)
      .setDesc(t("exactPathRule"))
      .addNamedAction(t("remove"), (button) => button.setIcon("trash-2").onClick(() => {
        button.setDisabled(true);
        void this.removeUnmanagedRule(kind, "path", path);
      }));
    for (const prefix of prefixes) new LabeledSetting(panel)
      .setName(t("nameStartsWith", { prefix }))
      .setDesc(t("nameStartRule"))
      .addNamedAction(t("remove"), (button) => button.setIcon("trash-2").onClick(() => {
        button.setDisabled(true);
        void this.removeUnmanagedRule(kind, "prefix", prefix);
      }));
    if (paths.length + prefixes.length === 0) panel.createEl("p", { cls: "setting-item-description", text: t("noUnmanagedRules") });
    new LabeledSetting(panel)
      .setName(t("addRule"))
      .setDesc(t("addRuleDesc"))
      .addButton((button) => button.setButtonText(t("addPathRule")).onClick(() => this.promptExemption(kind)))
      .addButton((button) => button.setButtonText(t("addNameStartRule")).onClick(() => this.promptPrefix(kind)));
  }

  private promptExemption(kind: ExemptionKind): void {
    new PromptModal(this.app, kind === "leaf" ? t("addLeafExemption") : t("addFolderExemption"), "", t("add"), async (value) => {
      const path = value.trim().replaceAll("\\", "/").replace(/^\/+|\/+$/gu, "");
      if (path === "") return;
      const paths = kind === "leaf" ? this.plugin.settings.leafNoteExemptions : this.plugin.settings.ignoredFolders;
      if (!paths.includes(path)) paths.push(path);
      paths.sort((a, b) => a.localeCompare(b));
      await this.plugin.saveSettings();
      await this.plugin.reconcileSettingsChange();
      this.display();
      updateDeclarativeSettingTab(this);
    }).open();
  }

  private promptPrefix(kind: ExemptionKind): void {
    new PromptModal(this.app, kind === "leaf" ? t("addLeafPrefix") : t("addFolderPrefix"), "", t("add"), async (value) => {
      const prefix = value.trim();
      if (prefix === "" || prefix.includes("/") || prefix.includes("\\")) return;
      const prefixes = kind === "leaf" ? this.plugin.settings.leafNotePrefixes : this.plugin.settings.ignoredFolderPrefixes;
      if (!prefixes.includes(prefix)) prefixes.push(prefix);
      prefixes.sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
      await this.plugin.saveSettings();
      await this.plugin.reconcileSettingsChange();
      this.display();
      updateDeclarativeSettingTab(this);
    }).open();
  }

  private async removeUnmanagedRule(kind: ExemptionKind, type: "path" | "prefix", value: string): Promise<void> {
    const rules = type === "path"
      ? kind === "leaf" ? this.plugin.settings.leafNoteExemptions : this.plugin.settings.ignoredFolders
      : kind === "leaf" ? this.plugin.settings.leafNotePrefixes : this.plugin.settings.ignoredFolderPrefixes;
    // Rows can outlive an earlier deletion while its save is pending. Resolve
    // the clicked value against current settings instead of using its old index.
    const index = rules.indexOf(value);
    if (index < 0) return;
    rules.splice(index, 1);
    try {
      await this.plugin.saveSettings();
      await this.plugin.reconcileSettingsChange();
    } catch (error) {
      new Notice(formatError(error), 8000);
    } finally {
      this.display();
      updateDeclarativeSettingTab(this);
    }
  }

  private updatePreview(panel: HTMLElement): void {
    panel.querySelector<HTMLElement>(".folder-nodes-name-preview-value")?.setText(this.plugin.previewSelectionName(t("sampleSelection")));
  }
}

function updateDeclarativeSettingTab(settingTab: object): void {
  const update: unknown = Reflect.get(settingTab, "update");
  if (typeof update === "function") Reflect.apply(update, settingTab, []);
}
