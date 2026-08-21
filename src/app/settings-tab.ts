import { App, Notice, PluginSettingTab, Setting, type SettingDefinitionItem } from "obsidian";

import type FolderNodesPlugin from "./plugin";
import type { NamingPart } from "../core/types";
import { setLanguage, t } from "../ui/i18n";

type TabId = "general" | "naming";

export class FolderNodesSettingTab extends PluginSettingTab {
  private activeTab: TabId = "general";

  public constructor(app: App, private readonly plugin: FolderNodesPlugin) { super(app, plugin); }

  public override getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      { type: "page", name: t("general"), items: this.generalDefinitions() },
      { type: "page", name: t("naming"), items: this.namingDefinitions() },
    ];
  }

  public override getControlValue(key: string): unknown {
    const settings = this.plugin.settings;
    const values: Record<string, unknown> = {
      language: settings.language,
      iconInheritance: settings.iconInheritance,
      defaultNodeTemplatePath: settings.defaultNodeTemplatePath,
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
      case "iconInheritance": settings.iconInheritance = Boolean(value); this.plugin.refreshVisuals(); break;
      case "defaultNodeTemplatePath": settings.defaultNodeTemplatePath = String(value).trim(); break;
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
    this.containerEl.empty();
    this.containerEl.addClass("folder-nodes-settings");
    new Setting(this.containerEl).setName(t("settings")).setHeading();
    const tabs = this.containerEl.createDiv({
      cls: "folder-nodes-tabs",
      attr: {
        role: "tablist",
        "aria-label": t("settings"),
        "aria-orientation": "horizontal",
      },
    });
    this.addTabButton(tabs, "general", t("general"));
    this.addTabButton(tabs, "naming", t("naming"));
    const panel = this.containerEl.createDiv({
      cls: "folder-nodes-tab-panel",
      attr: {
        id: this.panelId(this.activeTab),
        role: "tabpanel",
        "aria-labelledby": this.tabId(this.activeTab),
        tabindex: "0",
      },
    });
    if (this.activeTab === "general") this.renderGeneral(panel);
    else this.renderNaming(panel);
    this.revealActiveTab(tabs);
  }

  private addTabButton(container: HTMLElement, id: TabId, label: string): void {
    const isActive = this.activeTab === id;
    const button = container.createEl("button", {
      text: label,
      cls: `folder-nodes-tab${isActive ? " is-active" : ""}`,
      attr: {
        id: this.tabId(id),
        role: "tab",
        "aria-selected": String(isActive),
        "aria-controls": this.panelId(id),
        tabindex: isActive ? "0" : "-1",
      },
    });
    button.addEventListener("click", () => this.selectTab(id, false));
    button.addEventListener("keydown", (event) => {
      const tabs: TabId[] = ["general", "naming"];
      const currentIndex = tabs.indexOf(id);
      let targetIndex: number | null = null;
      if (event.key === "ArrowRight") targetIndex = (currentIndex + 1) % tabs.length;
      else if (event.key === "ArrowLeft") targetIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      else if (event.key === "Home") targetIndex = 0;
      else if (event.key === "End") targetIndex = tabs.length - 1;
      if (targetIndex === null) return;
      event.preventDefault();
      const target = tabs[targetIndex];
      if (target !== undefined) this.selectTab(target, true);
    });
  }

  private selectTab(id: TabId, focus: boolean): void {
    if (this.activeTab !== id) {
      this.activeTab = id;
      this.display();
    }
    if (focus) this.containerEl.querySelector<HTMLElement>(`#${this.tabId(id)}`)?.focus({ preventScroll: true });
  }

  private revealActiveTab(container: HTMLElement): void {
    const activeTab = container.querySelector<HTMLElement>("[role=tab][aria-selected=true]");
    activeTab?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  private tabId(id: TabId): string { return `folder-nodes-settings-tab-${id}`; }
  private panelId(id: TabId): string { return `folder-nodes-settings-panel-${id}`; }

  private generalDefinitions(): SettingDefinitionItem[] {
    return [
      {
        name: t("language"), desc: t("languageDesc"),
        control: { type: "dropdown", key: "language", defaultValue: "auto", options: { auto: t("auto"), "zh-CN": t("chinese"), en: t("english") } },
      },
      {
        name: t("iconInheritance"), desc: t("iconInheritanceDesc"),
        control: { type: "toggle", key: "iconInheritance", defaultValue: true },
      },
      {
        name: t("template"), desc: t("templateDesc"),
        control: { type: "text", key: "defaultNodeTemplatePath", placeholder: "Templates/Folder Node.md" },
      },
      this.actionDefinition(t("initialize"), t("initializeDesc"), (setting) => {
        setting.addButton((button) => button.setCta().setButtonText(t("initialize")).onClick(() => void this.plugin.initializeManagedVault()));
      }),
      this.actionDefinition(t("migration"), t("migrationDesc"), (setting) => {
        setting.addButton((button) => button.setButtonText(t("migration")).onClick(() => this.plugin.openMigration()));
      }),
      this.actionDefinition(t("health"), "", (setting) => {
        setting.addButton((button) => button.setButtonText(t("health")).onClick(() => this.plugin.showHealth()));
      }),
    ];
  }

  private namingDefinitions(): SettingDefinitionItem[] {
    const settings = this.plugin.settings;
    const sourceOptions = {
      "current-file": t("currentFile"), "current-node": t("currentNode"), "current-heading": t("currentHeading"),
      timestamp: t("timestamp"), custom: t("customText"),
    };
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

  private actionDefinition(
    name: string,
    desc: string,
    render: (setting: Setting) => void,
  ): SettingDefinitionItem {
    return { name, desc, searchable: false, render };
  }

  private namingSource(value: unknown): NamingPart["source"] {
    if (value === "current-file" || value === "current-node" || value === "current-heading" || value === "timestamp" || value === "custom") return value;
    throw new Error("Unsupported naming source");
  }

  private renderGeneral(panel: HTMLElement): void {
    new Setting(panel)
      .setName(t("language"))
      .setDesc(t("languageDesc"))
      .addDropdown((dropdown) => dropdown
        .addOptions({ auto: t("auto"), "zh-CN": t("chinese"), en: t("english") })
        .setValue(this.plugin.settings.language)
        .onChange(async (value) => {
          this.plugin.settings.language = value as typeof this.plugin.settings.language;
          setLanguage(this.plugin.settings.language);
          await this.plugin.saveSettings();
          new Notice(t("reloadLanguage"));
          this.display();
        }));
    panel.createEl("p", { cls: "setting-item-description", text: this.plugin.settings.adoptionState === "managed" ? t("managed") : t("unadopted") });
    new Setting(panel)
      .setName(t("iconInheritance"))
      .setDesc(t("iconInheritanceDesc"))
      .addToggle((toggle) => toggle.setValue(this.plugin.settings.iconInheritance).onChange(async (value) => {
        this.plugin.settings.iconInheritance = value;
        await this.plugin.saveSettings();
        this.plugin.refreshVisuals();
      }));
    new Setting(panel)
      .setName(t("template"))
      .setDesc(t("templateDesc"))
      .addText((text) => text.setPlaceholder("Templates/Folder Node.md").setValue(this.plugin.settings.defaultNodeTemplatePath).onChange(async (value) => {
        this.plugin.settings.defaultNodeTemplatePath = value.trim();
        await this.plugin.saveSettings();
      }));
    new Setting(panel)
      .setName(t("initialize"))
      .setDesc(t("initializeDesc"))
      .addButton((button) => button.setCta().setButtonText(t("initialize")).onClick(async () => {
        await this.plugin.initializeManagedVault();
        this.display();
      }));
    new Setting(panel)
      .setName(t("migration"))
      .setDesc(t("migrationDesc"))
      .addButton((button) => button.setButtonText(t("migration")).onClick(() => this.plugin.openMigration()));
    new Setting(panel)
      .setName(t("health"))
      .addButton((button) => button.setButtonText(t("health")).onClick(() => this.plugin.showHealth()));
  }

  private renderNaming(panel: HTMLElement): void {
    new Setting(panel)
      .setName(t("aliases"))
      .setDesc(t("aliasesDesc"))
      .addToggle((toggle) => toggle.setValue(this.plugin.settings.addSelectionAlias).onChange(async (value) => {
        this.plugin.settings.addSelectionAlias = value;
        await this.plugin.saveSettings();
      }));
    this.renderNamingPart(panel, t("prefix"), this.plugin.settings.prefix);
    this.renderNamingPart(panel, t("suffix"), this.plugin.settings.suffix);
    new Setting(panel)
      .setName(t("timestampFormat"))
      .setDesc(t("timestampFormatDesc"))
      .addText((text) => text.setValue(this.plugin.settings.timestampFormat).onChange(async (value) => {
        this.plugin.settings.timestampFormat = value;
        await this.plugin.saveSettings();
        this.updatePreview(panel);
      }));
    const preview = panel.createDiv({ cls: "folder-nodes-name-preview" });
    preview.createEl("strong", { text: `${t("preview")}: ` });
    preview.createSpan({ cls: "folder-nodes-name-preview-value", text: this.plugin.previewSelectionName(t("sampleSelection")) });
  }

  private renderNamingPart(panel: HTMLElement, label: string, part: NamingPart): void {
    new Setting(panel)
      .setName(`${label}: ${t("enabled")}`)
      .addToggle((toggle) => toggle.setValue(part.enabled).onChange(async (value) => {
        part.enabled = value;
        await this.plugin.saveSettings();
        this.display();
      }));
    if (!part.enabled) return;
    new Setting(panel)
      .setName(`${label}: ${t("source")}`)
      .addDropdown((dropdown) => dropdown
        .addOptions({
          "current-file": t("currentFile"), "current-node": t("currentNode"),
          "current-heading": t("currentHeading"), timestamp: t("timestamp"), custom: t("customText"),
        })
        .setValue(part.source)
        .onChange(async (value) => {
          part.source = value as NamingPart["source"];
          await this.plugin.saveSettings();
          this.display();
        }));
    new Setting(panel)
      .setName(`${label}: ${t("separator")}`)
      .addText((text) => text.setValue(part.separator).onChange(async (value) => {
        part.separator = value;
        await this.plugin.saveSettings();
        this.updatePreview(panel);
      }));
    if (part.source === "custom") {
      new Setting(panel).setName(`${label}: ${t("customText")}`).addText((text) => text.setValue(part.customText).onChange(async (value) => {
        part.customText = value;
        await this.plugin.saveSettings();
        this.updatePreview(panel);
      }));
    }
  }

  private updatePreview(panel: HTMLElement): void {
    const value = panel.querySelector<HTMLElement>(".folder-nodes-name-preview-value");
    if (value !== null) value.setText(this.plugin.previewSelectionName(t("sampleSelection")));
  }
}

function updateDeclarativeSettingTab(settingTab: object): void {
  const update: unknown = Reflect.get(settingTab, "update");
  if (typeof update === "function") Reflect.apply(update, settingTab, []);
}
