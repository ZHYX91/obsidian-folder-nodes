import { App, Notice, Setting } from "obsidian";
import { sanitizeNewNodeName } from "../core/paths";
import { formatError, t } from "./i18n";
import { SubmittingModal } from "./submitting-modal";

export interface SelectionPreview {
  parentPath: string;
  nodeName: string;
  alias: string | null;
}

export function selectionPreviewRows(preview: SelectionPreview): ReadonlyArray<readonly [string, string]> {
  return [
    [t("creationLocation"), preview.parentPath === "" ? t("root") : preview.parentPath],
    [t("finalNodeName"), preview.nodeName],
    [t("aliasValue"), preview.alias ?? t("aliasNone")],
  ];
}

export class SelectionCreateModal extends SubmittingModal {
  private nodeName: string;

  public constructor(
    app: App,
    private readonly preview: SelectionPreview,
    private readonly onCreate: (nodeName: string) => Promise<void>,
  ) {
    super(app);
    this.nodeName = preview.nodeName;
  }

  public override onOpen(): void {
    this.setTitle(t("selectionPreview"));
    let input: HTMLInputElement | null = null;
    new Setting(this.contentEl)
      .setName(t("newNode"))
      .addText((text) => {
        input = text.inputEl;
        input.setAttribute("aria-label", t("newNode"));
        text.setValue(this.nodeName).onChange((value) => {
          this.nodeName = value;
          renderPreview();
        });
      });
    const grid = this.contentEl.createDiv({ cls: "folder-nodes-preview-grid" });
    const renderPreview = (): void => {
      grid.empty();
      const nodeName = this.nodeName.trim() === "" ? "" : sanitizeNewNodeName(this.nodeName);
      for (const [label, value] of selectionPreviewRows({ ...this.preview, nodeName })) this.row(grid, label, value);
    };
    renderPreview();
    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText(t("cancel")).onClick(() => this.close()))
      .addButton((button) => button.setCta().setButtonText(t("create")).onClick(async () => {
        if (this.submitting || this.nodeName.trim() === "") return;
        this.submitting = true;
        button.setDisabled(true);
        if (input !== null) input.disabled = true;
        try {
          await this.onCreate(sanitizeNewNodeName(this.nodeName));
          this.closeAfterSubmission();
        } catch (error) {
          new Notice(formatError(error), 8000);
        } finally {
          this.submitting = false;
          button.setDisabled(false);
          if (input !== null) input.disabled = false;
        }
      }));
  }

  private row(container: HTMLElement, label: string, value: string): void {
    container.createEl("strong", { text: label });
    container.createEl("code", { text: value });
  }
}
