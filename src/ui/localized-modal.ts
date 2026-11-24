import { Modal } from "obsidian";
import { interfaceTextDirection, resolvedLanguage } from "./i18n";

export class LocalizedModal extends Modal {
  public override open(): void {
    this.modalEl.lang = resolvedLanguage();
    this.modalEl.dir = interfaceTextDirection();
    super.open();
  }
}
