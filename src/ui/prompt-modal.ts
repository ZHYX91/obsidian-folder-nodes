import { App, Modal, Notice, Setting } from "obsidian";
import { formatError, t } from "./i18n";

export class PromptModal extends Modal {
  private value: string;

  public constructor(
    app: App,
    private readonly titleText: string,
    initialValue: string,
    private readonly submitText: string,
    private readonly onSubmit: (value: string) => Promise<void> | void,
  ) {
    super(app);
    this.value = initialValue;
  }

  public override onOpen(): void {
    this.setTitle(this.titleText);
    new Setting(this.contentEl)
      .setName(this.titleText)
      .addText((text) => {
        text.setValue(this.value).onChange((value) => { this.value = value; });
        window.setTimeout(() => text.inputEl.focus(), 0);
        text.inputEl.addEventListener("keydown", (event) => {
          if (event.key === "Enter") void this.submit();
        });
      });
    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText(t("cancel")).onClick(() => this.close()))
      .addButton((button) => button.setCta().setButtonText(this.submitText).onClick(() => void this.submit()));
  }

  private async submit(): Promise<void> {
    const value = this.value.trim();
    if (value === "") return;
    try {
      await this.onSubmit(value);
      this.close();
    } catch (error) {
      new Notice(formatError(error), 8000);
    }
  }
}

export class ConfirmModal extends Modal {
  public constructor(
    app: App,
    private readonly titleText: string,
    private readonly message: string,
    private readonly confirmText: string,
    private readonly danger: boolean,
    private readonly onConfirm: () => Promise<void> | void,
  ) { super(app); }

  public override onOpen(): void {
    this.setTitle(this.titleText);
    this.contentEl.createEl("p", { text: this.message });
    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText(t("cancel")).onClick(() => this.close()))
      .addButton((button) => {
        button.setButtonText(this.confirmText).setCta().onClick(async () => {
          try {
            await this.onConfirm();
            this.close();
          } catch (error) {
            new Notice(formatError(error), 8000);
          }
        });
        if (this.danger) button.buttonEl.addClass("mod-warning");
      });
  }
}
