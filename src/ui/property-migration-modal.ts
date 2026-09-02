import { App, Notice, Setting } from "obsidian";

import type { MigrationScan, PropertyHealthFinding, PropertyMigrationScan } from "../core/types";
import { formatError, t } from "./i18n";
import { SubmittingModal } from "./submitting-modal";

export class PropertyMigrationModal extends SubmittingModal {
  private controller: AbortController | null = null;

  public constructor(
    app: App,
    private readonly scan: PropertyMigrationScan,
    private readonly onCommit: (
      signal: AbortSignal,
      progress: (completed: number, total: number) => void,
    ) => Promise<void>,
    private readonly healthMode: boolean,
    private readonly structureScan: MigrationScan | null = null,
  ) { super(app); }

  public override onOpen(): void {
    this.setTitle(this.healthMode ? t("healthSummary") : t("propertyMigration"));
    this.contentEl.createEl("p", {
      cls: "setting-item-description",
      text: this.healthMode ? t("readOnlyHealth") : t("propertyMigrationPreviewNotice"),
    });
    const counts = this.contentEl.createDiv({ cls: "folder-nodes-preview-grid" });
    this.count(counts, t("propertiesScanned"), this.scan.scannedNotes);
    this.count(counts, t("canonicalPropertyNotes"), this.scan.canonicalPropertyNotes);
    this.count(counts, t("legacyPropertyNotes"), this.scan.legacyPropertyNotes);
    this.count(counts, t("redundantLegacyNotes"), this.scan.redundantLegacyNotes);

    const summary = this.contentEl.createDiv({ cls: "folder-nodes-migration-summary" });
    if (this.structureScan !== null) {
      this.pathSection(summary, t("moveLeafNotes"), this.structureScan.leafMarkdown);
      this.pathSection(summary, t("createNodeNotes"), this.structureScan.missingNodeNotes);
      this.pathSection(summary, t("skippedLeafNotes"), this.structureScan.exemptLeafMarkdown);
      this.pathSection(summary, t("skippedFolders"), this.structureScan.ignoredFolders);
      this.pathSection(summary, t("conflicts"), this.structureScan.conflicts.map(({ path, reason }) => `${path}: ${reason}`), true);
    }
    this.pathSection(summary, t("propertyChanges"), this.scan.changes.map(({ path, summary: detail }) => `${path}: ${detail}`));
    this.findingSection(summary, t("propertyConflicts"), this.scan.conflicts, true);
    this.findingSection(summary, t("nonCanonicalProperties"), this.scan.nonCanonical);
    this.findingSection(summary, t("invalidIcons"), this.scan.invalidIcons);
    if (
      this.scan.changes.length === 0
      && this.scan.conflicts.length === 0
      && this.scan.nonCanonical.length === 0
      && this.scan.invalidIcons.length === 0
    ) summary.createEl("p", { text: t("noPropertyChanges") });

    const progress = this.contentEl.createEl("progress");
    progress.max = Math.max(1, this.scan.changes.length);
    progress.value = 0;
    progress.hidden = this.healthMode || this.scan.changes.length === 0;
    const controls = new Setting(this.contentEl);
    controls.addButton((button) => button.setButtonText(this.healthMode ? t("confirm") : t("cancel")).onClick(() => {
      if (this.controller !== null) this.controller.abort(new Error("Folder Nodes property migration cancelled"));
      else this.close();
    }));
    if (this.healthMode) return;
    controls.addButton((button) => button
      .setCta()
      .setDisabled(this.scan.conflicts.length > 0 || this.scan.changes.length === 0)
      .setButtonText(t("applyPropertyMigration"))
      .onClick(async () => {
        if (this.submitting) return;
        this.submitting = true;
        this.controller = new AbortController();
        button.setDisabled(true);
        try {
          await this.onCommit(this.controller.signal, (completed, total) => {
            progress.max = Math.max(1, total);
            progress.value = completed;
          });
          new Notice(t("propertyMigrationComplete"));
          this.closeAfterSubmission();
        } catch (error) {
          if (!this.controller.signal.aborted) new Notice(formatError(error), 8000);
          button.setDisabled(false);
        } finally {
          this.controller = null;
          this.submitting = false;
        }
      }));
  }

  public override onClose(): void {
    this.controller?.abort(new Error("Folder Nodes property migration cancelled"));
    this.controller = null;
  }

  private count(container: HTMLElement, label: string, value: number): void {
    container.createEl("strong", { text: label });
    container.createSpan({ text: String(value) });
  }

  private findingSection(container: HTMLElement, label: string, findings: readonly PropertyHealthFinding[], blocking = false): void {
    this.pathSection(container, label, findings.map(({ path, messages }) => `${path}: ${messages.join("; ")}`), blocking);
  }

  private pathSection(container: HTMLElement, label: string, paths: readonly string[], blocking = false): void {
    const details = container.createEl("details", { cls: blocking && paths.length > 0 ? "is-blocking" : "" });
    details.open = paths.length > 0;
    details.createEl("summary", { text: `${label} (${paths.length})` });
    const list = details.createEl("ul");
    for (const path of paths.slice(0, 500)) list.createEl("li").createEl("code", { text: path });
    if (paths.length > 500) details.createEl("p", { cls: "setting-item-description", text: t("showingFirstItems", { count: 500 }) });
  }
}
