import { Modal, Notice } from "obsidian";

import { formatError } from "./i18n";

export abstract class SubmittingModal extends Modal {
  private submitting = false;

  public override close(): void {
    if (!this.submitting) super.close();
  }

  protected closeImmediately(): void {
    super.close();
  }

  protected async submitAndClose(write: () => Promise<void> | void): Promise<void> {
    if (this.submitting || !this.contentEl.isConnected) return;
    this.submitting = true;
    const document = this.contentEl.ownerDocument;
    const controls = Array.from(this.contentEl.querySelectorAll<HTMLInputElement | HTMLButtonElement>(
      "input, button",
    )).filter((control) => !control.disabled);
    const focused = controls.find((control) => control === document.activeElement);
    this.contentEl.setAttribute("aria-busy", "true");
    for (const control of controls) control.disabled = true;
    try {
      await write();
      if (this.contentEl.isConnected) super.close();
    } catch (error) {
      if (!this.contentEl.isConnected) return;
      new Notice(formatError(error), 8000);
      for (const control of controls) control.disabled = false;
      if (document.activeElement === document.body) focused?.focus({ preventScroll: true });
    } finally {
      this.contentEl.removeAttribute("aria-busy");
      this.submitting = false;
    }
  }
}
