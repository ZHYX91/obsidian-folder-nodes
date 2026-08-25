import { App, Notice, PluginSettingTab, Setting, setIcon, type SettingDefinitionItem } from "obsidian";

import type FolderNodesPlugin from "./plugin";
import type { NamingPart } from "../core/types";
import { PromptModal } from "../ui/prompt-modal";
import { setLanguage, t } from "../ui/i18n";
import { renderVisual } from "../presentation/render-visual";

type TabId = "general" | "homepage" | "icons" | "naming";
type ExemptionKind = "leaf" | "folder";

const TABS: TabId[] = ["general", "homepage", "icons", "naming"];

// Obsidian 1.13 bypasses display() for non-empty definitions. Temporarily keep
// the established top-tab settings surface while retaining the definitions.
const ENABLE_DECLARATIVE_SETTINGS = false;

export class FolderNodesSettingTab extends PluginSettingTab {
  private activeTab: TabId = "general";

  public constructor(app: App, private readonly plugin: FolderNodesPlugin) { super(app, plugin); }

  public override getSettingDefinitions(): SettingDefinitionItem[] {
    return ENABLE_DECLARATIVE_SETTINGS ? this.getDeclarativeSettingDefinitions() : [];
  }

  public getDeclarativeSettingDefinitions(): SettingDefinitionItem[] {
    return [
      { type: "page", name: t("general"), items: this.generalDefinitions() },
      { type: "page", name: t("homepage"), items: this.homepageDefinitions() },
      { type: "page", name: t("icons"), items: this.iconDefinitions() },
      { type: "page", name: t("naming"), items: this.namingDefinitions() },
    ];
  }

  public override getControlValue(key: string): unknown {
    const settings = this.plugin.settings;
    const values: Record<string, unknown> = {
      language: settings.language,
      homepageEnabled: settings.homepageEnabled,
      openHomepageOnStartup: settings.openHomepageOnStartup,
      iconInheritance: settings.iconInheritance,
      explorerIconPosition: settings.explorerIconPosition,
      showIconInNoteTitle: settings.showIconInNoteTitle,
      addSelectionAlias: settings.addSelectionAlias,
      prefixEnabled: settings.prefix.enabled,
      prefixSource: settings.prefix.source,
      prefixSeparator: settings.prefix.separator,
      prefixCustomText: settings.prefix.customText,
      suffixEnabled: settings.suffix.enabled,
      suffixSource: settings.suffix.source,
      suffixSeparator: settings.suffix.separator,
      suffixCustomText: settings.suffix.customText,
      timestampFormat: settings.timestampFormat,
    };
    return values[key];
  }

  public override async setControlValue(key: string, value: unknown): Promise<void> {
    const settings = this.plugin.settings;
    switch (key) {
      case "language":
        if (value !== "auto" && value !== "zh-CN" && value !== "en") throw new Error("Unsupported language");
        settings.language = value;
        setLanguage(value);
        new Notice(t("reloadLanguage"));
        break;
      case "homepageEnabled": settings.homepageEnabled = Boolean(value); this.plugin.refreshVisuals(); break;
      case "openHomepageOnStartup": settings.openHomepageOnStartup = Boolean(value); break;
      case "iconInheritance": settings.iconInheritance = Boolean(value); this.plugin.refreshVisuals(); break;
      case "explorerIconPosition":
        if (value !== "before" && value !== "after" && value !== "hidden") throw new Error("Unsupported icon position");
        settings.explorerIconPosition = value;
        this.plugin.refreshVisuals();
        break;
      case "showIconInNoteTitle": settings.showIconInNoteTitle = Boolean(value); this.plugin.refreshVisuals(); break;
      case "addSelectionAlias": settings.addSelectionAlias = Boolean(value); break;
      case "prefixEnabled": settings.prefix.enabled = Boolean(value); break;
      case "prefixSource": settings.prefix.source = this.namingSource(value); break;
      case "prefixSeparator": settings.prefix.separator = String(value); break;
      case "prefixCustomText": settings.prefix.customText = String(value); break;
      case "suffixEnabled": settings.suffix.enabled = Boolean(value); break;
      case "suffixSource": settings.suffix.source = this.namingSource(value); break;
      case "suffixSeparator": settings.suffix.separator = String(value); break;
      case "suffixCustomText": settings.suffix.customText = String(value); break;
      case "timestampFormat": settings.timestampFormat = String(value); break;
      default: throw new Error(`Unsupported Folder Nodes setting: ${key}`);
    }
    await this.plugin.saveSettings();
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
    if (this.activeTab === "general") this.renderGeneral(panel);
    else if (this.activeTab === "homepage") this.renderHomepage(panel);
    else if (this.activeTab === "icons") this.renderIcons(panel);
    else this.renderNaming(panel);
    this.revealActiveTab(tabs);
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
    return id === "general" ? t("general") : id === "homepage" ? t("homepage") : id === "icons" ? t("icons") : t("naming");
  }
  private tabId(id: TabId): string { return `folder-nodes-settings-tab-${id}`; }
  private panelId(id: TabId): string { return `folder-nodes-settings-panel-${id}`; }

  private generalDefinitions(): SettingDefinitionItem[] {
    const initialized = this.plugin.settings.adoptionState === "managed";
    return [
      { name: t("language"), desc: t("languageDesc"), control: { type: "dropdown", key: "language", defaultValue: "auto", options: { auto: t("auto"), "zh-CN": t("chinese"), en: t("english") } } },
      this.actionDefinition(initialized ? t("maintenance") : t("initialize"), initialized ? t("maintenanceManagedDesc") : t("initializationRequiredDesc"), (setting) => {
        setting.addButton((button) => { button.setCta().setButtonText(initialized ? t("reviewStructure") : t("startInitialization")).onClick(() => { this.plugin.openMaintenance(); }); });
      }),
      this.actionDefinition(t("health"), t("healthDesc"), (setting) => {
        setting.addButton((button) => { button.setButtonText(t("health")).onClick(() => { this.plugin.showHealth(); }); });
      }),
      ...this.unmanagedRuleDefinitions("leaf"),
      ...this.unmanagedRuleDefinitions("folder"),
    ];
  }

  private homepageDefinitions(): SettingDefinitionItem[] {
    return [
      { name: t("enableHomepage"), desc: t("enableHomepageDesc"), control: { type: "toggle", key: "homepageEnabled", defaultValue: false } },
      { name: t("openHomepageOnStartup"), desc: t("openHomepageOnStartupDesc"), visible: this.plugin.settings.homepageEnabled, control: { type: "toggle", key: "openHomepageOnStartup", defaultValue: false } },
      this.actionDefinition(t("openHomepage"), t("openHomepageDesc"), (setting) => {
        setting.addButton((button) => { button.setButtonText(t("openHomepage")).setDisabled(!this.plugin.settings.homepageEnabled).onClick(() => void this.plugin.openHomepage()); });
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
      { name: `${t("suffix")}: ${t("enabled")}`, control: { type: "toggle", key: "suffixEnabled", defaultValue: false } },
      { name: `${t("suffix")}: ${t("source")}`, visible: settings.suffix.enabled, control: { type: "dropdown", key: "suffixSource", defaultValue: "timestamp", options: sourceOptions } },
      { name: `${t("suffix")}: ${t("separator")}`, visible: settings.suffix.enabled, control: { type: "text", key: "suffixSeparator" } },
      { name: `${t("suffix")}: ${t("customText")}`, visible: settings.suffix.enabled && settings.suffix.source === "custom", control: { type: "text", key: "suffixCustomText" } },
      { name: t("timestampFormat"), desc: t("timestampFormatDesc"), control: { type: "text", key: "timestampFormat" } },
      { name: t("preview"), desc: this.plugin.previewSelectionName(t("sampleSelection")), searchable: false },
    ];
  }

  private unmanagedRuleDefinitions(kind: ExemptionKind): SettingDefinitionItem[] {
    const paths = kind === "leaf" ? this.plugin.settings.leafNoteExemptions : this.plugin.settings.ignoredFolders;
    const prefixes = kind === "leaf" ? this.plugin.settings.leafNotePrefixes : this.plugin.settings.ignoredFolderPrefixes;
    const heading = kind === "leaf" ? t("leafExemptions") : t("folderExemptions");
    const items = [
      ...paths.map((path) => ({ name: path, desc: t("exactPathRule") + " · " + (kind === "leaf" ? t("leafExemptionItemDesc") : t("folderExemptionItemDesc")) })),
      ...prefixes.map((prefix) => ({ name: prefix + "*", desc: t("namePrefixRule") + " · " + (kind === "leaf" ? t("leafPrefixItemDesc") : t("folderPrefixItemDesc")) })),
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
        setting.addButton((button) => button.setButtonText(t("addPrefixRule")).onClick(() => this.promptPrefix(kind)));
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
    const initialized = this.plugin.settings.adoptionState === "managed";
    panel.createEl("p", { cls: `folder-nodes-adoption-status ${initialized ? "is-managed" : "is-warning"}`, text: initialized ? t("managed") : t("unadopted") });
    new Setting(panel)
      .setName(initialized ? t("maintenance") : t("initialize"))
      .setDesc(initialized ? t("maintenanceManagedDesc") : t("initializationRequiredDesc"))
      .addButton((button) => button.setCta().setButtonText(initialized ? t("reviewStructure") : t("startInitialization")).onClick(() => this.plugin.openMaintenance()));
    new Setting(panel).setName(t("health")).setDesc(t("healthDesc")).addButton((button) => button.setButtonText(t("health")).onClick(() => this.plugin.showHealth()));
    this.renderUnmanagedGroup(panel, "leaf");
    this.renderUnmanagedGroup(panel, "folder");
  }

  private renderHomepage(panel: HTMLElement): void {
    new Setting(panel).setName(t("enableHomepage")).setDesc(t("enableHomepageDesc")).addToggle((toggle) => toggle.setValue(this.plugin.settings.homepageEnabled).onChange(async (value) => {
      this.plugin.settings.homepageEnabled = value; await this.plugin.saveSettings(); this.plugin.refreshVisuals(); this.display();
    }));
    if (this.plugin.settings.homepageEnabled) new Setting(panel).setName(t("openHomepageOnStartup")).setDesc(t("openHomepageOnStartupDesc")).addToggle((toggle) => toggle.setValue(this.plugin.settings.openHomepageOnStartup).onChange(async (value) => {
      this.plugin.settings.openHomepageOnStartup = value; await this.plugin.saveSettings();
    }));
    new Setting(panel).setName(t("openHomepage")).setDesc(t("openHomepageDesc")).addButton((button) => button.setButtonText(t("openHomepage")).setDisabled(!this.plugin.settings.homepageEnabled).onClick(() => void this.plugin.openHomepage()));
  }

  private renderIcons(panel: HTMLElement): void {
    this.renderIconGuide(panel);
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
    this.renderIconComparisonRow(comparison, t("iconFromProperty"), "A", "1994", true);
    this.renderIconComparisonRow(comparison, t("characterInFilename"), "", "A1994", false);
    this.renderIconComparisonRow(comparison, t("iconFromProperty"), "📓", "1994", true);
    this.renderIconComparisonRow(comparison, t("characterInFilename"), "", "📓1994", false);
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
    new Setting(panel).setName(t("timestampFormat")).setDesc(t("timestampFormatDesc")).addText((text) => text.setValue(this.plugin.settings.timestampFormat).onChange(async (value) => {
      this.plugin.settings.timestampFormat = value; await this.plugin.saveSettings(); this.updatePreview(panel);
    }));
    const preview = panel.createDiv({ cls: "folder-nodes-name-preview" });
    preview.createEl("strong", { text: `${t("preview")}: ` });
    preview.createSpan({ cls: "folder-nodes-name-preview-value", text: this.plugin.previewSelectionName(t("sampleSelection")) });
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
      .setName(prefix + "*")
      .setDesc(t("namePrefixRule") + " · " + (kind === "leaf" ? t("leafPrefixItemDesc") : t("folderPrefixItemDesc")))
      .addExtraButton((button) => button.setIcon("trash-2").setTooltip(t("remove")).onClick(() => void this.removePrefix(kind, index)));
    if (paths.length + prefixes.length === 0) panel.createEl("p", { cls: "setting-item-description", text: t("noUnmanagedRules") });
    new Setting(panel)
      .setName(t("addRule"))
      .setDesc(t("addRuleDesc"))
      .addButton((button) => button.setButtonText(t("addPathRule")).onClick(() => this.promptExemption(kind)))
      .addButton((button) => button.setButtonText(t("addPrefixRule")).onClick(() => this.promptPrefix(kind)));
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
