import { App, Notice, Setting } from "obsidian";
import { formatError, t } from "./i18n";
import { SubmittingModal } from "./submitting-modal";

export interface SelectionPreview {
  parentPath: string;
  nodeName: string;
  notePath: string;
  alias: string | null;
  wikiLink: string;
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
    this.row(grid, t("targetNode"), this.preview.parentPath === "" ? t("root") : this.preview.parentPath);
    this.row(grid, t("notePath"), this.preview.notePath);
    this.row(grid, t("aliasValue"), this.preview.alias ?? "—");
    this.row(grid, t("wikiLink"), this.preview.wikiLink);
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
