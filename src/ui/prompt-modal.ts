import { App, type ButtonComponent, Setting } from "obsidian";
import { t } from "./i18n";
import { SubmittingModal } from "./submitting-modal";

export class PromptModal extends SubmittingModal {
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
    let save: ButtonComponent;
    new Setting(this.contentEl)
      .setName(this.titleText)
      .addText((text) => {
        let composing = false;
        text.inputEl.setAttribute("aria-label", this.titleText);
        text.setValue(this.value).onChange((value) => {
          this.value = value;
          save.setDisabled(value.trim() === "");
        });
        text.inputEl.focus();
        text.inputEl.addEventListener("compositionstart", () => { composing = true; });
        text.inputEl.addEventListener("compositionend", () => { composing = false; });
        text.inputEl.addEventListener("keydown", (event) => {
          if (event.key !== "Enter" || event.isComposing || composing) return;
          event.preventDefault();
          void this.submit();
        });
      });
    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText(t("cancel")).onClick(() => this.close()))
      .addButton((button) => {
        save = button.setCta().setButtonText(this.submitText).setDisabled(this.value.trim() === "");
        save.onClick(() => void this.submit());
      });
  }

  private async submit(): Promise<void> {
    const value = this.value.trim();
    if (value !== "") await this.submitAndClose(() => this.onSubmit(value));
  }
}

export class ConfirmModal extends SubmittingModal {
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
        button.setButtonText(this.confirmText).setCta().onClick(() => void this.submitAndClose(this.onConfirm));
        if (this.danger) button.buttonEl.addClass("mod-warning");
      });
  }
}
