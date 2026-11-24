import { App, type ButtonComponent, Setting } from "obsidian";
import { sanitizeNewNodeName } from "../core/paths";
import { t } from "./i18n";
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
    let create: ButtonComponent;
    new Setting(this.contentEl)
      .setName(t("newNode"))
      .addText((text) => {
        text.inputEl.setAttribute("aria-label", t("newNode"));
        text.setValue(this.nodeName).onChange((value) => {
          this.nodeName = value;
          create.setDisabled(value.trim() === "");
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
      .addButton((button) => {
        create = button.setCta().setButtonText(t("create")).setDisabled(this.nodeName.trim() === "");
        create.onClick(() => {
          const name = this.nodeName.trim();
          if (name !== "") void this.submitAndClose(() => this.onCreate(sanitizeNewNodeName(name)));
        });
      });
  }

  private row(container: HTMLElement, label: string, value: string): void {
    container.createEl("strong", { text: label });
    container.createEl("code", { text: value });
  }
}
