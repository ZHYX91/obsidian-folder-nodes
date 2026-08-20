import { App, Modal, Notice, Setting } from "obsidian";

import { formatError, t } from "./i18n";
import type { MigrationScan } from "../core/types";

export class MigrationModal extends Modal {
  public constructor(
    app: App,
    private readonly scan: MigrationScan,
    private readonly onCommit: (progress: (completed: number, total: number) => void) => Promise<void>,
    private readonly healthMode = false,
  ) { super(app); }

  public override onOpen(): void {
    this.setTitle(this.healthMode ? t("healthSummary") : t("migration"));
    const summary = this.contentEl.createDiv({ cls: "folder-nodes-migration-summary" });
    summary.createEl("p", { text: `${t("leafMarkdown")}: ${this.scan.leafMarkdown.length}` });
    summary.createEl("p", { text: `${t("missingNotes")}: ${this.scan.missingNodeNotes.length}` });
    summary.createEl("p", { text: `${t("conflicts")}: ${this.scan.conflicts.length}` });
    if (this.scan.conflicts.length > 0) {
      const list = summary.createEl("ul");
      for (const conflict of this.scan.conflicts.slice(0, 100)) list.createEl("li", { text: `${conflict.path}: ${conflict.reason}` });
    }
    const progress = this.contentEl.createEl("progress");
    progress.max = Math.max(1, this.total());
    progress.value = 0;
    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText(t("cancel")).onClick(() => this.close()))
      .addButton((button) => button
        .setCta()
        .setDisabled(this.scan.conflicts.length > 0 || this.total() === 0)
        .setButtonText(t("confirm"))
        .onClick(async () => {
          button.setDisabled(true);
          try {
            await this.onCommit((completed, total) => {
              progress.max = Math.max(1, total);
              progress.value = completed;
            });
            new Notice(`${t("migration")}: ${t("confirm")}`);
            this.close();
          } catch (error) {
            new Notice(formatError(error), 8000);
            button.setDisabled(false);
          }
        }));
  }

  private total(): number {
    return this.scan.leafMarkdown.length + this.scan.missingNodeNotes.length;
  }
}
