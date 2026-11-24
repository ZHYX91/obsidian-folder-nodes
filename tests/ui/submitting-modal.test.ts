import { describe, expect, it } from "vitest";
import type { App } from "obsidian";

import { SubmittingModal } from "../../src/ui/submitting-modal";

class TestSubmittingModal extends SubmittingModal {
  public save(write: () => Promise<void>): Promise<void> { return this.submitAndClose(write); }
}

describe("SubmittingModal", () => {
  it("closes normally before submission starts", () => {
    const modal = new TestSubmittingModal({} as App);
    modal.close();
    expect((modal as unknown as { closeCount: number }).closeCount).toBe(1);
  });

  it("refuses cancellation while a write is running and closes after it finishes", async () => {
    const modal = new TestSubmittingModal({} as App);
    modal.open();
    let finish!: () => void;
    const saving = modal.save(() => new Promise<void>((resolve) => { finish = resolve; }));
    modal.close();
    expect((modal as unknown as { closeCount: number }).closeCount).toBe(0);
    finish();
    await saving;
    expect((modal as unknown as { closeCount: number }).closeCount).toBe(1);
  });
});
