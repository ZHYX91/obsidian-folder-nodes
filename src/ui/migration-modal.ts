import { App, Notice, Setting } from "obsidian";

import { formatError, t } from "./i18n";
import { SubmittingModal } from "./submitting-modal";
import { basename, dirname, nodeNotePath, sanitizeNodeName } from "../core/paths";
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
    this.pathSection(summary, t("moveLeafNotes"), this.scan.leafMarkdown.map((path) => `${path} → ${this.target(path)}`));
    this.pathSection(summary, t("createNodeNotes"), this.scan.missingNodeNotes.map((path) => this.notePath(path)));
    this.pathSection(summary, t("skippedLeafNotes"), this.scan.exemptLeafMarkdown);
    this.pathSection(summary, t("skippedFolders"), this.scan.ignoredFolders);
    this.pathSection(summary, t("conflicts"), this.scan.conflicts.map((conflict) => `${conflict.path}: ${conflict.reason}`), true);
    if (this.total() === 0 && this.scan.conflicts.length === 0) summary.createEl("p", { text: t("noChanges") });

    const progress = this.contentEl.createEl("progress");
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
      .onClick(async () => {
        if (this.submitting) return;
        this.submitting = true;
        button.setDisabled(true);
        try {
          await this.onCommit((completed, total) => {
            progress.max = Math.max(1, total);
            progress.value = completed;
          });
          new Notice(`${t("batchOrganize")}: ${t("confirm")}`);
          this.closeAfterSubmission();
        } catch (error) {
          new Notice(formatError(error), 8000);
          button.setDisabled(false);
        } finally {
          this.submitting = false;
        }
      }));
  }

  private pathSection(container: HTMLElement, label: string, paths: readonly string[], blocking = false): void {
    const details = container.createEl("details", { cls: blocking && paths.length > 0 ? "is-blocking" : "" });
    details.open = paths.length > 0;
    details.createEl("summary", { text: `${label} (${paths.length})` });
    if (paths.length === 0) return;
    const list = details.createEl("ul");
    let rendered = 0;
    const append = (count: number): void => {
      const next = Math.min(paths.length, rendered + count);
      for (const path of paths.slice(rendered, next)) list.createEl("li").createEl("code", { text: path });
      rendered = next;
    };
    append(500);
    if (rendered < paths.length) {
      const more = details.createEl("button");
      more.type = "button";
      const update = (): void => {
        const count = Math.min(500, paths.length - rendered);
        more.setText(t("showMore", { count }));
      };
      update();
      more.addEventListener("click", () => {
        append(500);
        if (rendered === paths.length) more.remove();
        else update();
      });
    }
  }

  private target(path: string): string {
    const parent = dirname(path);
    const name = sanitizeNodeName(basename(path).slice(0, -3));
    const folder = parent === "" ? name : `${parent}/${name}`;
    return `${folder}/${name}.md`;
  }

  private notePath(folderPath: string): string {
    return folderPath === ""
      ? `${sanitizeNodeName(this.app.vault.getName())}.md`
      : nodeNotePath(folderPath);
  }

  private total(): number { return this.scan.leafMarkdown.length + this.scan.missingNodeNotes.length; }
}
