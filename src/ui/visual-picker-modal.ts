import { App, Modal, Notice, Setting, TFolder } from "obsidian";
import { formatError, t } from "./i18n";

const PRESETS = ["📁", "🧠", "⭐", "folder-tree", "book-open", "#7c3aed"];

export class VisualPickerModal extends Modal {
  private value = "";

  public constructor(
    app: App,
    private readonly folder: TFolder,
    private readonly onSave: (value: string) => Promise<void>,
  ) { super(app); }

  public override onOpen(): void {
    this.setTitle(`${t("editVisual")}: ${this.folder.name}`);
    new Setting(this.contentEl)
      .setName(t("visualValue"))
      .setDesc(t("visualValueDesc"))
      .addText((text) => text.setPlaceholder("🧠 / folder-tree / #7c3aed / [[Assets/icon.png]]").onChange((value) => {
        this.value = value;
      }));
    const presets = this.contentEl.createDiv({ cls: "folder-nodes-visual-presets" });
    for (const preset of PRESETS) {
      const button = presets.createEl("button", { text: preset });
      button.addEventListener("click", () => { this.value = preset; void this.submit(); });
    }
    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText(t("cancel")).onClick(() => this.close()))
      .addButton((button) => button.setButtonText(t("delete")).onClick(async () => {
        this.value = "";
        await this.submit();
      }))
      .addButton((button) => button.setCta().setButtonText(t("confirm")).onClick(() => void this.submit()));
  }

  private async submit(): Promise<void> {
    try {
      await this.onSave(this.value);
      this.close();
    } catch (error) {
      new Notice(formatError(error), 8000);
    }
  }
}
