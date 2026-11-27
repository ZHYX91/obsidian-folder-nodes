import { App, Notice, Setting } from "obsidian";

import { t } from "./i18n";
import { renderMigrationPreviewSection } from "./migration-preview-section";
import { SubmittingModal } from "./submitting-modal";
import { nodeNotePath, sanitizeNodeName } from "../core/paths";
import type { MigrationScan } from "../core/types";

export class MigrationModal extends SubmittingModal {
  public constructor(
    app: App,
    private readonly scan: MigrationScan,
    private readonly onCommit: (progress: (completed: number, total: number) => void) => Promise<void>,
    private readonly healthMode = false,
  ) { super(app); }

  public override onOpen(): void {
    this.setTitle(this.healthMode ? t("healthSummary") : t("batchOrganize"));
    if (this.healthMode) this.contentEl.createEl("p", { cls: "setting-item-description", text: t("readOnlyHealth") });
    const summary = this.contentEl.createDiv({ cls: "folder-nodes-migration-summary" });
    renderMigrationPreviewSection(summary, this.healthMode ? t("leafMarkdown") : t("moveLeafNotes"),
      this.scan.leafMoves.map(({ sourcePath, targetPath }) => this.healthMode ? sourcePath : `${sourcePath} → ${targetPath}`));
    renderMigrationPreviewSection(summary, this.healthMode ? t("foldersMissingNodeNotes") : t("createNodeNotes"),
      this.scan.missingNodeNotes.map((path) => this.healthMode ? path || "/" : this.notePath(path)));
    renderMigrationPreviewSection(summary, t("skippedLeafNotes"), this.scan.exemptLeafMarkdown);
    renderMigrationPreviewSection(summary, t("skippedFolders"), this.scan.ignoredFolders);
    renderMigrationPreviewSection(summary, t("conflicts"), this.scan.conflicts.map((conflict) => `${conflict.path}: ${conflict.reason}`), true);
    if (this.total() === 0 && this.scan.conflicts.length === 0) summary.createEl("p", { text: t("noChanges") });

    const progress = this.contentEl.createEl("progress", { attr: { "aria-label": t("batchOrganize") } });
    progress.max = Math.max(1, this.total());
    progress.value = 0;
    progress.hidden = this.healthMode || this.total() === 0;
    const controls = new Setting(this.contentEl);
    controls.addButton((button) => button.setButtonText(this.healthMode ? t("confirm") : t("cancel")).onClick(() => this.close()));
    if (this.healthMode) return;
    controls.addButton((button) => button
      .setCta()
      .setDisabled(this.scan.conflicts.length > 0 || this.total() === 0)
      .setButtonText(t("applyChanges"))
      .onClick(() => void this.submitAndClose(async () => {
        await this.onCommit((completed, total) => {
          progress.max = Math.max(1, total);
          progress.value = completed;
        });
        new Notice(`${t("batchOrganize")}: ${t("confirm")}`);
      })));
  }

  private notePath(folderPath: string): string {
    return folderPath === ""
      ? `${sanitizeNodeName(this.app.vault.getName())}.md`
      : nodeNotePath(folderPath);
  }

  private total(): number { return this.scan.leafMoves.length + this.scan.missingNodeNotes.length; }
}
