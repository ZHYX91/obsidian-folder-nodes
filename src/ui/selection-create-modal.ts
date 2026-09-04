import { App, Notice, Setting } from "obsidian";
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
    [t("newNode"), preview.nodeName],
    [t("aliasValue"), preview.alias ?? t("aliasNone")],
  ];
}

export class SelectionCreateModal extends SubmittingModal {
  public constructor(
    app: App,
    private readonly preview: SelectionPreview,
    private readonly onCreate: () => Promise<void>,
  ) { super(app); }

  public override onOpen(): void {
    this.setTitle(t("selectionPreview"));
    const grid = this.contentEl.createDiv({ cls: "folder-nodes-preview-grid" });
    for (const [label, value] of selectionPreviewRows(this.preview)) this.row(grid, label, value);
    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText(t("cancel")).onClick(() => this.close()))
      .addButton((button) => button.setCta().setButtonText(t("create")).onClick(async () => {
        if (this.submitting) return;
        this.submitting = true;
        button.setDisabled(true);
        try {
          await this.onCreate();
          this.closeAfterSubmission();
        } catch (error) {
          new Notice(formatError(error), 8000);
        } finally {
          this.submitting = false;
          button.setDisabled(false);
        }
      }));
  }

  private row(container: HTMLElement, label: string, value: string): void {
    container.createEl("strong", { text: label });
    container.createEl("code", { text: value });
  }
}
