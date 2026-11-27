import { App, Notice, Setting } from "obsidian";

import type { MigrationScan, PropertyHealthFinding, PropertyMigrationScan } from "../core/types";
import { t } from "./i18n";
import { renderMigrationPreviewSection } from "./migration-preview-section";
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
      renderMigrationPreviewSection(summary, this.healthMode ? t("leafMarkdown") : t("moveLeafNotes"), this.structureScan.leafMoves.map(({ sourcePath }) => sourcePath));
      renderMigrationPreviewSection(summary, this.healthMode ? t("foldersMissingNodeNotes") : t("createNodeNotes"),
        this.structureScan.missingNodeNotes.map((path) => path || "/"));
      renderMigrationPreviewSection(summary, t("skippedLeafNotes"), this.structureScan.exemptLeafMarkdown);
      renderMigrationPreviewSection(summary, t("skippedFolders"), this.structureScan.ignoredFolders);
      renderMigrationPreviewSection(summary, t("conflicts"), this.structureScan.conflicts.map(({ path, reason }) => `${path}: ${reason}`), true);
    }
    renderMigrationPreviewSection(summary, t("propertyChanges"), this.scan.changes.map(({ path, summary: detail }) => `${path}: ${detail}`));
    this.findingSection(summary, t("propertyConflicts"), this.scan.conflicts, true);
    this.findingSection(summary, t("nonCanonicalProperties"), this.scan.nonCanonical);
    this.findingSection(summary, t("invalidIcons"), this.scan.invalidIcons);
    if (
      this.scan.changes.length === 0
      && this.scan.conflicts.length === 0
      && this.scan.nonCanonical.length === 0
      && this.scan.invalidIcons.length === 0
    ) summary.createEl("p", { text: t("noPropertyChanges") });

    const progress = this.contentEl.createEl("progress", { attr: { "aria-label": t("propertyMigration") } });
    progress.max = Math.max(1, this.scan.changes.length);
    progress.value = 0;
    progress.hidden = this.healthMode || this.scan.changes.length === 0;
    const controls = new Setting(this.contentEl);
    controls.addButton((button) => button.setButtonText(this.healthMode ? t("confirm") : t("cancel")).onClick(() => this.close()));
    if (this.healthMode) return;
    controls.addButton((button) => button
      .setCta()
      .setDisabled(this.scan.conflicts.length > 0 || this.scan.changes.length === 0)
      .setButtonText(t("applyPropertyMigration"))
      .onClick(() => void this.submitAndClose(async () => {
        const controller = new AbortController();
        this.controller = controller;
        try {
          await this.onCommit(controller.signal, (completed, total) => {
            progress.max = Math.max(1, total);
            progress.value = completed;
          });
          if (!controller.signal.aborted) new Notice(t("propertyMigrationComplete"));
        } finally {
          this.controller = null;
        }
      })));
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
    renderMigrationPreviewSection(container, label, findings.map(({ path, messages }) => `${path}: ${messages.join("; ")}`), blocking);
  }
}
