import { App, PluginSettingTab, Setting } from "obsidian";

import type FolderNodesPlugin from "./plugin";
import type { NamingPart } from "../core/types";
import { t } from "./i18n";

type TabId = "general" | "naming";

export class FolderNodesSettingTab extends PluginSettingTab {
  private activeTab: TabId = "general";

  public constructor(app: App, private readonly plugin: FolderNodesPlugin) { super(app, plugin); }

  public override display(): void {
    this.containerEl.empty();
    this.containerEl.addClass("folder-nodes-settings");
    new Setting(this.containerEl).setName(t("settings")).setHeading();
    const tabs = this.containerEl.createDiv({ cls: "folder-nodes-tabs", attr: { role: "tablist", "aria-label": t("settings") } });
    this.addTabButton(tabs, "general", t("general"));
    this.addTabButton(tabs, "naming", t("naming"));
    const panel = this.containerEl.createDiv({ cls: "folder-nodes-tab-panel", attr: { role: "tabpanel" } });
    if (this.activeTab === "general") this.renderGeneral(panel);
    else this.renderNaming(panel);
  }

  private addTabButton(container: HTMLElement, id: TabId, label: string): void {
    const button = container.createEl("button", {
      text: label,
      cls: this.activeTab === id ? "is-active" : "",
      attr: { role: "tab", "aria-selected": String(this.activeTab === id), tabindex: this.activeTab === id ? "0" : "-1" },
    });
    button.addEventListener("click", () => { this.activeTab = id; this.display(); });
    button.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      this.activeTab = this.activeTab === "general" ? "naming" : "general";
      this.display();
      this.containerEl.querySelector<HTMLElement>("[role=tab][aria-selected=true]")?.focus();
    });
  }

  private renderGeneral(panel: HTMLElement): void {
    panel.createEl("p", { text: this.plugin.settings.adoptionState === "managed" ? t("managed") : t("unadopted") });
    new Setting(panel)
      .setName("Icon inheritance")
      .setDesc("Use the nearest ancestor visual when the current node has no valid icon property.")
      .addToggle((toggle) => toggle.setValue(this.plugin.settings.iconInheritance).onChange(async (value) => {
        this.plugin.settings.iconInheritance = value;
        await this.plugin.saveSettings();
      }));
    new Setting(panel)
      .setName("Default Node Note template")
      .setDesc("Vault-relative path to a Markdown template. Leave empty for a blank node note.")
      .addText((text) => text.setPlaceholder("Templates/Folder Node.md").setValue(this.plugin.settings.defaultNodeTemplatePath).onChange(async (value) => {
        this.plugin.settings.defaultNodeTemplatePath = value.trim();
        await this.plugin.saveSettings();
      }));
    new Setting(panel)
      .setName(t("initialize"))
      .setDesc("Use this only for an empty or already structured Vault.")
      .addButton((button) => button.setCta().setButtonText(t("initialize")).onClick(async () => {
        await this.plugin.initializeManagedVault();
        this.display();
      }));
    new Setting(panel)
      .setName(t("migration"))
      .setDesc("Always shows a read-only preview. Nothing changes until you explicitly commit.")
      .addButton((button) => button.setButtonText(t("migration")).onClick(() => this.plugin.openMigration()));
    new Setting(panel)
      .setName(t("health"))
      .addButton((button) => button.setButtonText(t("health")).onClick(() => this.plugin.showHealth()));
  }

  private renderNaming(panel: HTMLElement): void {
    new Setting(panel)
      .setName("Add aliases property")
      .setDesc("The alias is exactly the selected visible text. Prefixes and suffixes only affect the file name.")
      .addToggle((toggle) => toggle.setValue(this.plugin.settings.addSelectionAlias).onChange(async (value) => {
        this.plugin.settings.addSelectionAlias = value;
        await this.plugin.saveSettings();
      }));
    this.renderNamingPart(panel, "Prefix", this.plugin.settings.prefix);
    this.renderNamingPart(panel, "Suffix", this.plugin.settings.suffix);
    new Setting(panel)
      .setName("Timestamp format")
      .setDesc("Supported tokens: %Y %m %d %H %M %S")
      .addText((text) => text.setValue(this.plugin.settings.timestampFormat).onChange(async (value) => {
        this.plugin.settings.timestampFormat = value;
        await this.plugin.saveSettings();
      }));
    const preview = panel.createDiv({ cls: "folder-nodes-name-preview" });
    preview.createEl("strong", { text: "Preview: " });
    preview.createSpan({ text: this.plugin.previewSelectionName("Selected text") });
  }

  private renderNamingPart(panel: HTMLElement, label: string, part: NamingPart): void {
    new Setting(panel)
      .setName(`${label} enabled`)
      .addToggle((toggle) => toggle.setValue(part.enabled).onChange(async (value) => {
        part.enabled = value;
        await this.plugin.saveSettings();
        this.display();
      }));
    if (!part.enabled) return;
    new Setting(panel)
      .setName(`${label} source`)
      .addDropdown((dropdown) => dropdown
        .addOptions({
          "current-file": "Current file name",
          "current-node": "Current Folder Node",
          "current-heading": "Current heading",
          timestamp: "Timestamp",
          custom: "Custom text",
        })
        .setValue(part.source)
        .onChange(async (value) => {
          part.source = value as NamingPart["source"];
          await this.plugin.saveSettings();
          this.display();
        }));
    new Setting(panel)
      .setName(`${label} separator`)
      .addText((text) => text.setValue(part.separator).onChange(async (value) => {
        part.separator = value;
        await this.plugin.saveSettings();
      }));
    if (part.source === "custom") {
      new Setting(panel).setName(`${label} custom text`).addText((text) => text.setValue(part.customText).onChange(async (value) => {
        part.customText = value;
        await this.plugin.saveSettings();
      }));
    }
  }
}
