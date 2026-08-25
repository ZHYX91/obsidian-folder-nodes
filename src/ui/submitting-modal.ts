import { Modal } from "obsidian";

export abstract class SubmittingModal extends Modal {
  protected submitting = false;

  public override close(): void {
    if (!this.submitting) super.close();
  }

  protected closeAfterSubmission(): void {
    this.submitting = false;
    super.close();
  }
}
