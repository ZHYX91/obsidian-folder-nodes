import { App, Modal, Notice, Setting } from "obsidian";

import type { MigrationScan } from "../core/types";

export class MigrationModal extends Modal {
  public constructor(
    app: App,
    private readonly scan: MigrationScan,
    private readonly onCommit: (progress: (completed: number, total: number) => void) => Promise<void>,
  ) { super(app); }

  public override onOpen(): void {
    this.setTitle("Folder Nodes migration preview");
    const summary = this.contentEl.createDiv({ cls: "folder-nodes-migration-summary" });
    summary.createEl("p", { text: `Leaf Markdown notes: ${this.scan.leafMarkdown.length}` });
    summary.createEl("p", { text: `Folders missing node notes: ${this.scan.missingNodeNotes.length}` });
    summary.createEl("p", { text: `Blocking conflicts: ${this.scan.conflicts.length}` });
    if (this.scan.conflicts.length > 0) {
      const list = summary.createEl("ul");
      for (const conflict of this.scan.conflicts.slice(0, 100)) {
        list.createEl("li", { text: `${conflict.path}: ${conflict.reason}` });
      }
    }
    const progress = this.contentEl.createEl("progress");
    progress.max = Math.max(1, this.scan.leafMarkdown.length + this.scan.missingNodeNotes.length);
    progress.value = 0;
    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText("Cancel").onClick(() => this.close()))
      .addButton((button) => button
        .setCta()
        .setDisabled(this.scan.conflicts.length > 0)
        .setButtonText("Commit migration")
        .onClick(async () => {
          button.setDisabled(true);
          try {
            await this.onCommit((completed, total) => {
              progress.max = Math.max(1, total);
              progress.value = completed;
            });
            new Notice("Folder Nodes migration completed.");
            this.close();
          } catch (error) {
            new Notice(`Migration stopped safely: ${String(error)}`, 8000);
            button.setDisabled(false);
          }
        }));
  }
}
