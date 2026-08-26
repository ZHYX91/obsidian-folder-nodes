import { App, Modal, Setting } from "obsidian";

import { t } from "./i18n";

export class ScanProgressModal extends Modal {
  private progress: HTMLProgressElement | null = null;
  private completed = false;

  public constructor(app: App, private readonly onCancel: () => void) { super(app); }

  public override onOpen(): void {
    this.setTitle(t("scanningStructure"));
    this.contentEl.createEl("p", { cls: "setting-item-description", text: t("scanningStructureDesc") });
    this.progress = this.contentEl.createEl("progress");
    this.progress.max = 1;
    this.progress.value = 0;
    new Setting(this.contentEl).addButton((button) => button.setButtonText(t("cancel")).onClick(() => this.close()));
  }

  public update(completed: number, total: number): void {
    if (this.progress === null) return;
    this.progress.max = Math.max(1, total);
    this.progress.value = Math.min(this.progress.max, completed);
  }

  public finish(): void {
    this.completed = true;
    this.close();
  }

  public override onClose(): void {
    this.progress = null;
    if (!this.completed) this.onCancel();
  }
}
