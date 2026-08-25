import { describe, expect, it } from "vitest";
import type { App } from "obsidian";

import { SubmittingModal } from "../../src/ui/submitting-modal";

class TestSubmittingModal extends SubmittingModal {
  public begin(): void { this.submitting = true; }
  public finish(): void { this.closeAfterSubmission(); }
}

describe("SubmittingModal", () => {
  it("closes normally before submission starts", () => {
    const modal = new TestSubmittingModal({} as App);
    modal.close();
    expect((modal as unknown as { closeCount: number }).closeCount).toBe(1);
  });

  it("refuses cancellation while a write is running and closes after it finishes", () => {
    const modal = new TestSubmittingModal({} as App);
    modal.begin();
    modal.close();
    expect((modal as unknown as { closeCount: number }).closeCount).toBe(0);
    modal.finish();
    expect((modal as unknown as { closeCount: number }).closeCount).toBe(1);
  });
});
