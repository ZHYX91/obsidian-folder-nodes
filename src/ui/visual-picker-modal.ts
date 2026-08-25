import { App, Notice, Setting, TFolder } from "obsidian";
import type { NodeVisual } from "../core/types";
import { formatError, t } from "./i18n";
import { renderVisual } from "../presentation/render-visual";
import { SubmittingModal } from "./submitting-modal";

const PRESETS = ["📁", "🧠", "⭐", "lucide:folder-tree", "lucide:book-open", "文", "color:#7c3aed"];

export class VisualPickerModal extends SubmittingModal {
  private readonly values: string[];
  private editorEl: HTMLElement | null = null;
  private previewEl: HTMLElement | null = null;

  public constructor(
    app: App,
    private readonly folder: TFolder,
    initialValues: readonly string[],
    private readonly preview: (values: readonly string[]) => NodeVisual,
    private readonly diagnostics: (values: readonly string[]) => { extraColorCount: number; unknownCount: number },
    private readonly onSave: (values: readonly string[]) => Promise<void>,
  ) {
    super(app);
    this.values = initialValues.length === 0 ? [""] : [...initialValues];
  }

  public override onOpen(): void {
    this.setTitle(`${t("editVisual")}: ${this.folder.name}`);
    this.contentEl.createEl("p", { text: t("visualValueDesc") });

    const presets = this.contentEl.createDiv({ cls: "folder-nodes-visual-presets" });
    for (const preset of PRESETS) {
      const button = presets.createEl("button", { text: preset });
      button.type = "button";
      button.addEventListener("click", () => {
        if (this.values.length === 1 && this.values[0] === "") this.values[0] = preset;
        else this.values.push(preset);
        this.renderEditor();
      });
    }

    this.editorEl = this.contentEl.createDiv({ cls: "folder-nodes-visual-editor" });
    this.previewEl = this.contentEl.createDiv({ cls: "folder-nodes-visual-preview" });
    this.renderEditor();

    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText(t("addCandidate")).onClick(() => {
        this.values.push("");
        this.renderEditor();
      }));

    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText(t("cancel")).onClick(() => this.close()))
      .addButton((button) => button.setButtonText(t("delete")).onClick(async () => {
        await this.submit([]);
      }))
      .addButton((button) => button.setCta().setButtonText(t("confirm")).onClick(() => void this.submit()));
  }

  private renderEditor(): void {
    if (this.editorEl === null) return;
    this.editorEl.empty();
    for (const [index, value] of this.values.entries()) {
      const row = this.editorEl.createDiv({ cls: "folder-nodes-visual-candidate" });
      const input = row.createEl("input", {
        attr: { "aria-label": `${t("visualCandidate")} ${index + 1}`, placeholder: "[[Assets/icon.svg]] / lucide:folder-tree / 文 / color:#7c3aed", type: "text" },
      });
      input.value = value;
      input.addEventListener("input", () => {
        this.values[index] = input.value;
        this.renderPreview();
      });
      this.addRowButton(row, "↑", t("moveCandidateUp"), index === 0, () => this.move(index, -1));
      this.addRowButton(row, "↓", t("moveCandidateDown"), index === this.values.length - 1, () => this.move(index, 1));
      this.addRowButton(row, "×", t("removeCandidate"), false, () => {
        this.values.splice(index, 1);
        if (this.values.length === 0) this.values.push("");
        this.renderEditor();
      });
    }
    this.renderPreview();
  }

  private addRowButton(row: HTMLElement, text: string, label: string, disabled: boolean, action: () => void): void {
    const button = row.createEl("button", { text, attr: { "aria-label": label, title: label, type: "button" } });
    button.disabled = disabled;
    button.addEventListener("click", action);
  }

  private move(index: number, offset: -1 | 1): void {
    const target = index + offset;
    const current = this.values[index];
    const other = this.values[target];
    if (current === undefined || other === undefined) return;
    this.values[index] = other;
    this.values[target] = current;
    this.renderEditor();
  }

  private renderPreview(): void {
    if (this.previewEl === null) return;
    this.previewEl.empty();
    const visual = this.preview(this.values);
    for (const label of [t("explorerPreview"), t("contentsPreview")]) {
      const item = this.previewEl.createDiv({ cls: "folder-nodes-visual-preview-item" });
      const icon = item.createSpan();
      renderVisual(icon, visual, `${label}: ${this.folder.name}`);
      item.createSpan({ text: label });
    }
    const diagnostics = this.diagnostics(this.values);
    if (diagnostics.unknownCount > 0) {
      this.previewEl.createDiv({ cls: "setting-item-description", text: t("visualUnknownItems", { count: diagnostics.unknownCount }) });
    }
    if (diagnostics.extraColorCount > 0) {
      this.previewEl.createDiv({ cls: "setting-item-description", text: t("visualExtraColors", { count: diagnostics.extraColorCount }) });
    }
  }

  private async submit(values: readonly string[] = this.values): Promise<void> {
    if (this.submitting) return;
    this.submitting = true;
    try {
      await this.onSave(values);
      this.closeAfterSubmission();
    } catch (error) {
      new Notice(formatError(error), 8000);
    } finally {
      this.submitting = false;
    }
  }
}
