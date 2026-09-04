import { App, Notice, PluginSettingTab, Setting, setIcon, type SettingDefinitionItem } from "obsidian";

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
import { PromptModal } from "../ui/prompt-modal";
import { detectInstalledEmojiFonts } from "../ui/emoji-fonts";
import { setLanguage, t } from "../ui/i18n";
import { renderVisual } from "../presentation/render-visual";

type TabId = "general" | "management" | "icons" | "naming" | "nodeGraph";
type ExemptionKind = "leaf" | "folder";

const TABS: TabId[] = ["general", "management", "icons", "naming", "nodeGraph"];

// Declarative settings are intentionally inactive. Obsidian 1.13 bypasses
// display() for non-empty definitions, removing the established top-tab surface
// and degrading the settings experience. Retain dormant definitions for tests only.
const ENABLE_DECLARATIVE_SETTINGS = false;

export class FolderNodesSettingTab extends PluginSettingTab {
  private activeTab: TabId = "general";
  private installedEmojiFonts: EmojiFontFamily[] | null = null;
  private emojiFontScan: Promise<EmojiFontFamily[]> | null = null;
  private emojiFontScanGeneration = 0;

  public constructor(app: App, private readonly plugin: FolderNodesPlugin) { super(app, plugin); }

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
      nodeGraphEnabled: settings.nodeGraph.enabled,
      nodeGraphDefaultDimension: settings.nodeGraph.defaultDimension,
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
    switch (key) {
      case "language":
        if (value !== "auto" && value !== "zh-CN" && value !== "en") throw new Error("Unsupported language");
        settings.language = value;
        setLanguage(value);
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
      case "nodeGraphEnabled": settings.nodeGraph.enabled = Boolean(value); reconcileNodeGraph = true; break;
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
    await this.plugin.saveSettings();
    if (reconcileNodeGraph) await this.plugin.reconcileSettingsChange();
    updateDeclarativeSettingTab(this);
  }

  public override display(): void {
    this.plugin.ensureStyles(this.containerEl.ownerDocument);
    this.containerEl.empty();
    this.containerEl.addClass("folder-nodes-settings");
    const tabs = this.containerEl.createDiv({
      cls: "folder-nodes-tabs",
      attr: { role: "tablist", "aria-label": t("settings"), "aria-orientation": "horizontal" },
    });
    for (const id of TABS) this.addTabButton(tabs, id, this.tabLabel(id));
    const panel = this.containerEl.createDiv({
      cls: "folder-nodes-tab-panel",
      attr: { id: this.panelId(this.activeTab), role: "tabpanel", "aria-labelledby": this.tabId(this.activeTab), tabindex: "0" },
    });
    const compatibility = this.plugin.getSettingsCompatibility();
    renderSettingsPersistenceStatus(
      panel,
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
    this.revealActiveTab(tabs);
  }

  public refreshPersistenceStatus(): void {
    if (this.containerEl.isConnected) this.display();
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
      attr: { id: this.tabId(id), role: "tab", "aria-selected": String(isActive), "aria-controls": this.panelId(id), tabindex: isActive ? "0" : "-1" },
    });
    button.type = "button";
    button.addEventListener("click", () => this.selectTab(id, false));
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

  private revealActiveTab(container: HTMLElement): void {
    container.querySelector<HTMLElement>("[role=tab][aria-selected=true]")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  private tabLabel(id: TabId): string {
    return id === "general" ? t("general")
      : id === "management" ? t("management")
        : id === "icons" ? t("icons")
          : id === "naming" ? t("naming") : t("nodeGraph");
  }
  private tabId(id: TabId): string { return `folder-nodes-settings-tab-${id}`; }
  private panelId(id: TabId): string { return `folder-nodes-settings-panel-${id}`; }

  private generalDefinitions(): SettingDefinitionItem[] {
    return [
      { name: t("language"), desc: t("languageDesc"), control: { type: "dropdown", key: "language", defaultValue: "auto", options: { auto: t("auto"), "zh-CN": t("chinese"), en: t("english") } } },
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
      { name: t("aliases"), desc: t("aliasesDesc"), control: { type: "toggle", key: "addSelectionAlias", defaultValue: true } },
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
      { name: t("nodeGraphDefaultDimension"), control: { type: "dropdown", key: "nodeGraphDefaultDimension", defaultValue: "2d", options: { "2d": "2D", "3d": "3D" } } },
      { name: t("nodeGraphLayoutDirection"), desc: t("nodeGraphLayoutDirectionDesc"), control: { type: "dropdown", key: "nodeGraphLayoutDirection", defaultValue: "left-to-right", options: { "left-to-right": t("nodeGraphLeftToRight"), "top-to-bottom": t("nodeGraphTopToBottom") } } },
    ];
  }

  private unmanagedRuleDefinitions(kind: ExemptionKind): SettingDefinitionItem[] {
    const paths = kind === "leaf" ? this.plugin.settings.leafNoteExemptions : this.plugin.settings.ignoredFolders;
    const prefixes = kind === "leaf" ? this.plugin.settings.leafNotePrefixes : this.plugin.settings.ignoredFolderPrefixes;
    const heading = kind === "leaf" ? t("leafExemptions") : t("folderExemptions");
    const items = [
      ...paths.map((path) => ({ name: path, desc: t("exactPathRule") + " · " + (kind === "leaf" ? t("leafExemptionItemDesc") : t("folderExemptionItemDesc")) })),
      ...prefixes.map((prefix) => ({ name: t("nameStartsWith", { prefix }), desc: t("nameStartRule") + " · " + (kind === "leaf" ? t("leafPrefixItemDesc") : t("folderPrefixItemDesc")) })),
    ];
    return [
      {
        type: "list",
        heading,
        emptyState: t("noUnmanagedRules"),
        items,
        onDelete: (index) => void this.removeUnmanagedRule(kind, index, paths.length),
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
    new Setting(panel).setName(t("language")).setDesc(t("languageDesc")).addDropdown((dropdown) => dropdown
      .addOptions({ auto: t("auto"), "zh-CN": t("chinese"), en: t("english") }).setValue(this.plugin.settings.language).onChange(async (value) => {
        this.plugin.settings.language = value as typeof this.plugin.settings.language;
        setLanguage(this.plugin.settings.language);
        await this.plugin.saveSettings();
        new Notice(t("reloadLanguage"));
        this.display();
      }));
    new Setting(panel).setName(t("applyHiddenNodes")).setDesc(t("applyHiddenNodesDesc")).addToggle((toggle) => toggle
      .setValue(this.plugin.settings.hiddenNodesEnabled).onChange(async (value) => {
        this.plugin.settings.hiddenNodesEnabled = value;
        await this.plugin.saveSettings();
        await this.plugin.reconcileSettingsChange();
      }));
    new Setting(panel).setName(t("enableHomepage")).setDesc(t("enableHomepageDesc")).addToggle((toggle) => toggle.setValue(this.plugin.settings.homepageEnabled).onChange(async (value) => {
      this.plugin.settings.homepageEnabled = value; await this.plugin.saveSettings(); this.plugin.refreshVisuals(); this.display();
    }));
    if (this.plugin.settings.homepageEnabled) new Setting(panel).setName(t("openHomepageOnStartup")).setDesc(t("openHomepageOnStartupDesc")).addToggle((toggle) => toggle.setValue(this.plugin.settings.openHomepageOnStartup).onChange(async (value) => {
      this.plugin.settings.openHomepageOnStartup = value; await this.plugin.saveSettings();
    }));
    new Setting(panel).setName(t("openHomepage")).setDesc(t("openHomepageDesc")).addButton((button) => button.setButtonText(t("openHomepage")).setDisabled(!this.plugin.settings.homepageEnabled).onClick(() => void this.plugin.openHomepage()));
  }

  private renderManagement(panel: HTMLElement): void {
    this.renderUnmanagedGroup(panel, "leaf");
    this.renderUnmanagedGroup(panel, "folder");
    new Setting(panel).setName(t("structureMaintenance")).setDesc(t("structureMaintenanceDesc")).setHeading();
    new Setting(panel)
      .setName(t("batchOrganize"))
      .setDesc(t("batchOrganizeDesc"))
      .addButton((button) => button.setCta().setButtonText(t("previewOrganizePlan")).onClick(() => this.plugin.openBatchOrganize()));
    new Setting(panel)
      .setName(t("propertyMigration"))
      .setDesc(t("propertyMigrationDesc"))
      .addButton((button) => button.setButtonText(t("previewPropertyMigration")).onClick(() => this.plugin.openPropertyMigration()));
    new Setting(panel).setName(t("health")).setDesc(t("healthDesc")).addButton((button) => button.setButtonText(t("health")).onClick(() => this.plugin.showHealth()));
  }

  private renderIcons(panel: HTMLElement): void {
    this.renderIconGuide(panel);
    this.renderEmojiFontSetting(panel);
    new Setting(panel).setName(t("iconInheritance")).setDesc(t("iconInheritanceDesc")).addToggle((toggle) => toggle.setValue(this.plugin.settings.iconInheritance).onChange(async (value) => {
      this.plugin.settings.iconInheritance = value; await this.plugin.saveSettings(); this.plugin.refreshVisuals();
    }));
    new Setting(panel).setName(t("explorerIconPosition")).setDesc(t("explorerIconPositionDesc")).addDropdown((dropdown) => dropdown.addOptions({ before: t("beforeName"), after: t("afterName"), hidden: t("hidden") }).setValue(this.plugin.settings.explorerIconPosition).onChange(async (value) => {
      this.plugin.settings.explorerIconPosition = value as typeof this.plugin.settings.explorerIconPosition; await this.plugin.saveSettings(); this.plugin.refreshVisuals();
    }));
    new Setting(panel).setName(t("showIconInNoteTitle")).setDesc(t("showIconInNoteTitleDesc")).addToggle((toggle) => toggle.setValue(this.plugin.settings.showIconInNoteTitle).onChange(async (value) => {
      this.plugin.settings.showIconInNoteTitle = value; await this.plugin.saveSettings(); this.plugin.refreshVisuals();
    }));
  }

  private renderEmojiFontSetting(panel: HTMLElement): void {
    const current = this.plugin.settings.emojiFont;
    const installed = this.installedEmojiFonts;
    const unavailable = installed !== null && current !== SYSTEM_EMOJI_FONT && !installed.includes(current);
    const options: Record<string, string> = { [SYSTEM_EMOJI_FONT]: t("systemDefault") };
    for (const family of installed ?? []) options[family] = family;
    if (current !== SYSTEM_EMOJI_FONT && options[current] === undefined) {
      options[current] = `${current} · ${t("fontUnavailable")}`;
    }

    const description = unavailable
      ? `${t("emojiFontDesc")} ${t("emojiFontUnavailable")}`
      : installed === null ? `${t("emojiFontDesc")} ${t("detectingFonts")}` : t("emojiFontDesc");
    new Setting(panel)
      .setName(t("emojiFont"))
      .setDesc(description)
      .addDropdown((dropdown) => dropdown
        .addOptions(options)
        .setValue(current)
        .setDisabled(installed === null)
        .onChange(async (value) => {
          if (!isEmojiFontPreference(value)) return;
          this.plugin.settings.emojiFont = value;
          await this.plugin.saveSettings();
          this.plugin.applyEmojiFontSetting();
          this.display();
        }))
      .addExtraButton((button) => button
        .setIcon("refresh-cw")
        .setTooltip(t("redetectFonts"))
        .setDisabled(installed === null)
        .onClick(() => this.restartEmojiFontScan()));

    const preview = panel.createDiv({ cls: "folder-nodes-emoji-font-preview" });
    preview.createSpan({ cls: "folder-nodes-emoji-font-preview-label", text: t("emojiFontPreview") });
    preview.createSpan({
      cls: "folder-nodes-emoji-font-preview-sample",
      text: "📔 🫠 🩷 👨‍👩‍👧‍👦 🏳️‍🌈 🇨🇳",
      attr: { lang: "zxx" },
    });

    if (installed === null) this.startEmojiFontScan(panel);
  }

  private startEmojiFontScan(panel: HTMLElement): void {
    if (this.emojiFontScan !== null) return;
    const generation = ++this.emojiFontScanGeneration;
    const scan = detectInstalledEmojiFonts();
    this.emojiFontScan = scan;
    void scan.then((families) => {
      if (generation === this.emojiFontScanGeneration) this.installedEmojiFonts = families;
    }).finally(() => {
      if (generation !== this.emojiFontScanGeneration) return;
      this.emojiFontScan = null;
      if (panel.isConnected && this.activeTab === "icons") this.display();
    });
  }

  private restartEmojiFontScan(): void {
    this.emojiFontScanGeneration += 1;
    this.emojiFontScan = null;
    this.installedEmojiFonts = null;
    this.display();
  }

  private renderIconGuide(panel: HTMLElement): void {
    const guide = panel.createDiv({ cls: "folder-nodes-settings-guide", attr: { role: "note" } });
    const heading = guide.createDiv({ cls: "folder-nodes-settings-guide-heading" });
    const icon = heading.createSpan({ cls: "folder-nodes-settings-guide-icon", attr: { "aria-hidden": "true" } });
    setIcon(icon, "info");
    heading.createEl("strong", { text: t("iconGuideTitle") });

    const body = guide.createDiv({ cls: "folder-nodes-settings-guide-body" });
    body.createEl("p", { text: t("iconGuideIntro") });
    const example = body.createDiv({ cls: "folder-nodes-settings-guide-example" });
    example.createSpan({ text: t("iconPropertyExampleLabel") });
    example.createEl("code", { text: "icon: 💰" });
    body.createEl("p", { text: t("iconGuideFormats") });
    body.createEl("p", { text: t("iconColorBehavior") });
    body.createEl("p", { text: t("iconDistinctionDesc") });
    const comparison = body.createDiv({ cls: "folder-nodes-icon-comparison", attr: { "aria-label": t("iconDistinctionTitle") } });
    this.renderIconComparisonRow(comparison, t("iconFromProperty"), "A", "Project", true);
    this.renderIconComparisonRow(comparison, t("characterInFilename"), "", "A Project", false);
    this.renderIconComparisonRow(comparison, t("iconFromProperty"), "📓", "Project", true);
    this.renderIconComparisonRow(comparison, t("characterInFilename"), "", "📓 Project", false);
    body.createEl("p", { cls: "folder-nodes-settings-guide-note", text: t("iconGuideRootNote") });
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
    this.renderNamingGuide(panel);
    new Setting(panel).setName(t("aliases")).setDesc(t("aliasesDesc")).addToggle((toggle) => toggle.setValue(this.plugin.settings.addSelectionAlias).onChange(async (value) => {
      this.plugin.settings.addSelectionAlias = value; await this.plugin.saveSettings();
    }));
    this.renderNamingPart(panel, t("prefix"), this.plugin.settings.prefix);
    this.renderNamingPart(panel, t("suffix"), this.plugin.settings.suffix);
    const preview = panel.createDiv({ cls: "folder-nodes-name-preview" });
    preview.createEl("strong", { text: `${t("preview")}: ` });
    preview.createSpan({ cls: "folder-nodes-name-preview-value", text: this.plugin.previewSelectionName(t("sampleSelection")) });
  }

  private renderNodeGraph(panel: HTMLElement): void {
    const settings = this.plugin.settings.nodeGraph;
    new Setting(panel)
      .setName(t("enableNodeGraph"))
      .setDesc(t("enableNodeGraphDesc"))
      .addToggle((toggle) => toggle.setValue(settings.enabled).onChange(async (value) => {
        settings.enabled = value;
        await this.saveNodeGraphSettings(true);
        this.display();
      }));
    if (!settings.enabled) {
      panel.createEl("p", { cls: "setting-item-description", text: t("nodeGraphDisabledDesc") });
      return;
    }

    new Setting(panel).setName(t("nodeGraphDefaults")).setDesc(t("nodeGraphDefaultsDesc")).setHeading();
    new Setting(panel).setName(t("nodeGraphDefaultDimension")).addDropdown((dropdown) => dropdown
      .addOptions({ "2d": "2D", "3d": "3D" })
      .setValue(settings.defaultDimension)
      .onChange(async (value) => {
        if (value !== "2d" && value !== "3d") return;
        settings.defaultDimension = value;
        await this.saveNodeGraphSettings(false);
      }));
    new Setting(panel).setName(t("nodeGraphLayoutDirection")).setDesc(t("nodeGraphLayoutDirectionDesc")).addDropdown((dropdown) => dropdown
      .addOptions({ "left-to-right": t("nodeGraphLeftToRight"), "top-to-bottom": t("nodeGraphTopToBottom") })
      .setValue(settings.layoutDirection)
      .onChange(async (value) => {
        if (value !== "left-to-right" && value !== "top-to-bottom") return;
        settings.layoutDirection = value;
        await this.saveNodeGraphSettings(true);
      }));
    new Setting(panel).setName(t("nodeGraphPerformance")).setDesc(t("nodeGraphPerformanceDesc")).setHeading();
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
    new Setting(panel).setName(name).setDesc(description).addText((text) => {
      text.inputEl.type = "number";
      text.inputEl.min = String(minimum);
      text.inputEl.max = String(maximum);
      text.setValue(String(this.plugin.settings.nodeGraph[key])).onChange(async (value) => {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return;
        this.plugin.settings.nodeGraph[key] = this.graphInteger(parsed, minimum, maximum, this.plugin.settings.nodeGraph[key]);
        await this.saveNodeGraphSettings(true);
      });
    });
  }

  private async saveNodeGraphSettings(refresh: boolean): Promise<void> {
    await this.plugin.saveSettings();
    if (refresh) await this.plugin.reconcileSettingsChange();
    updateDeclarativeSettingTab(this);
  }

  private graphInteger(value: unknown, minimum: number, maximum: number, fallback: number): number {
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, Math.round(parsed))) : fallback;
  }

  private renderNamingGuide(panel: HTMLElement): void {
    const guide = panel.createDiv({ cls: "folder-nodes-settings-guide", attr: { role: "note" } });
    const heading = guide.createDiv({ cls: "folder-nodes-settings-guide-heading" });
    const icon = heading.createSpan({ cls: "folder-nodes-settings-guide-icon", attr: { "aria-hidden": "true" } });
    setIcon(icon, "info");
    heading.createEl("strong", { text: t("creationGuideTitle") });

    const body = guide.createDiv({ cls: "folder-nodes-settings-guide-body" });
    body.createEl("p", { text: t("creationGuideSelection") });
    this.creationExample(body, "[[a]]", "a/a.md", null);
    this.creationExample(body, "[[a|b]]", "a/a.md", t("creationGuideAliasResult"));
    body.createEl("p", { cls: "folder-nodes-settings-guide-note", text: t("creationGuideScope") });
  }

  private creationExample(container: HTMLElement, source: string, target: string, detail: string | null): void {
    const example = container.createDiv({ cls: "folder-nodes-settings-guide-example" });
    example.createEl("code", { text: source });
    example.createSpan({ text: "→" });
    example.createEl("code", { text: target });
    if (detail !== null) example.createSpan({ text: detail });
  }

  private renderNamingPart(panel: HTMLElement, label: string, part: NamingPart): void {
    new Setting(panel).setName(label).setHeading();
    new Setting(panel).setName(`${label}: ${t("enabled")}`).addToggle((toggle) => toggle.setValue(part.enabled).onChange(async (value) => {
      part.enabled = value; await this.plugin.saveSettings(); this.display();
    }));
    if (!part.enabled) return;
    new Setting(panel).setName(`${label}: ${t("source")}`).addDropdown((dropdown) => dropdown.addOptions({
      "current-file": t("currentFile"), "current-node": t("currentNode"), "current-heading": t("currentHeading"), timestamp: t("timestamp"), custom: t("customText"),
    }).setValue(part.source).onChange(async (value) => { part.source = value as NamingPart["source"]; await this.plugin.saveSettings(); this.display(); }));
    new Setting(panel).setName(`${label}: ${t("separator")}`).addText((text) => text.setValue(part.separator).onChange(async (value) => {
      part.separator = value; await this.plugin.saveSettings(); this.updatePreview(panel);
    }));
    if (part.source === "custom") new Setting(panel).setName(`${label}: ${t("customText")}`).addText((text) => text.setValue(part.customText).onChange(async (value) => {
      part.customText = value; await this.plugin.saveSettings(); this.updatePreview(panel);
    }));
    if (part.source === "timestamp") {
      const setting = new Setting(panel).setName(`${label}: ${t("timestampFormat")}`);
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
        text.onChange(async (value) => {
          const valid = updateDescription(value);
          text.inputEl.toggleClass("is-invalid", !valid);
          text.inputEl.setAttr("aria-invalid", String(!valid));
          if (!valid) return;
          part.timestampFormat = value;
          await this.plugin.saveSettings();
          this.updatePreview(panel);
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
    new Setting(panel)
      .setName(kind === "leaf" ? t("leafExemptions") : t("folderExemptions"))
      .setDesc(kind === "leaf" ? t("leafExemptionsDesc") : t("folderExemptionsDesc"))
      .setHeading();
    for (const [index, path] of paths.entries()) new Setting(panel)
      .setName(path)
      .setDesc(t("exactPathRule") + " · " + (kind === "leaf" ? t("leafExemptionItemDesc") : t("folderExemptionItemDesc")))
      .addExtraButton((button) => button.setIcon("trash-2").setTooltip(t("remove")).onClick(() => void this.removeExemption(kind, index)));
    for (const [index, prefix] of prefixes.entries()) new Setting(panel)
      .setName(t("nameStartsWith", { prefix }))
      .setDesc(t("nameStartRule") + " · " + (kind === "leaf" ? t("leafPrefixItemDesc") : t("folderPrefixItemDesc")))
      .addExtraButton((button) => button.setIcon("trash-2").setTooltip(t("remove")).onClick(() => void this.removePrefix(kind, index)));
    if (paths.length + prefixes.length === 0) panel.createEl("p", { cls: "setting-item-description", text: t("noUnmanagedRules") });
    new Setting(panel)
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

  private async removeUnmanagedRule(kind: ExemptionKind, index: number, pathCount: number): Promise<void> {
    if (index < pathCount) await this.removeExemption(kind, index);
    else await this.removePrefix(kind, index - pathCount);
  }

  private async removePrefix(kind: ExemptionKind, index: number): Promise<void> {
    const prefixes = kind === "leaf" ? this.plugin.settings.leafNotePrefixes : this.plugin.settings.ignoredFolderPrefixes;
    prefixes.splice(index, 1);
    await this.plugin.saveSettings();
    await this.plugin.reconcileSettingsChange();
    this.display();
    updateDeclarativeSettingTab(this);
  }

  private async removeExemption(kind: ExemptionKind, index: number): Promise<void> {
    const paths = kind === "leaf" ? this.plugin.settings.leafNoteExemptions : this.plugin.settings.ignoredFolders;
    paths.splice(index, 1);
    await this.plugin.saveSettings();
    await this.plugin.reconcileSettingsChange();
    this.display();
    updateDeclarativeSettingTab(this);
  }

  private updatePreview(panel: HTMLElement): void {
    panel.querySelector<HTMLElement>(".folder-nodes-name-preview-value")?.setText(this.plugin.previewSelectionName(t("sampleSelection")));
  }
}

function updateDeclarativeSettingTab(settingTab: object): void {
  const update: unknown = Reflect.get(settingTab, "update");
  if (typeof update === "function") Reflect.apply(update, settingTab, []);
}
