import { type App, TFolder } from "obsidian";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VisualPickerModal } from "../../src/ui/visual-picker-modal";
import { setLanguage, t } from "../../src/ui/i18n";

beforeEach(() => setLanguage("en"));
afterEach(() => document.body.replaceChildren());

function fixture(onSave: (values: readonly string[]) => Promise<void> = vi.fn(async () => undefined)) {
  const folder = Object.assign(new TFolder(), { name: "A", path: "A" });
  const onClose = vi.fn();
  const modal = new VisualPickerModal({} as App, folder, ["📁", "⭐", "🧠"],
    () => ({ kind: "fallback", value: "folder", inheritedFrom: null, accent: null }),
    () => ({ unknownCount: 0, extraColorCount: 0 }), onSave, onClose);
  modal.open();
  const buttons = (label: string) => [...modal.contentEl.querySelectorAll<HTMLButtonElement>("button")]
    .filter((button) => button.textContent === label || button.getAttribute("aria-label") === label);
  return { modal, onSave, onClose, buttons };
}

describe("Visual Picker ownership and keyboard continuation", () => {
  it("invalidates old confirm and clear callbacks and cannot reopen", async () => {
    const f = fixture();
    const confirm = f.buttons(t("confirm"))[0]!;
    const remove = f.buttons(t("clearIcon"))[0]!;
    f.modal.invalidate();
    confirm.click();
    remove.click();
    await Promise.resolve();
    expect(f.onSave).not.toHaveBeenCalled();
    expect(f.onClose).toHaveBeenCalledOnce();
    expect(f.modal.contentEl.isConnected).toBe(false);
    f.modal.open();
    expect(f.modal.contentEl.isConnected).toBe(false);
  });

  it("moves focus with the candidate and to a neighbour after removal", () => {
    const f = fixture();
    f.buttons(t("moveCandidateUp"))[2]!.click();
    expect(document.activeElement).toBe(f.buttons(t("moveCandidateUp"))[1]);
    f.buttons(t("moveCandidateUp"))[1]!.click();
    expect(document.activeElement).toBe(f.modal.contentEl.querySelector("input"));
    expect((document.activeElement as HTMLInputElement).value).toBe("🧠");
    f.buttons(t("removeCandidate"))[0]!.click();
    expect((document.activeElement as HTMLInputElement).value).toBe("📁");
  });

  it("allows only the dispatched save when invalidated while pending", async () => {
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    const f = fixture(vi.fn(async () => pending));
    const confirm = f.buttons(t("confirm"))[0]!;
    confirm.click();
    expect(f.onSave).toHaveBeenCalledOnce();
    f.modal.invalidate();
    confirm.click();
    finish();
    await vi.waitFor(() => expect(f.modal.contentEl.isConnected).toBe(false));
    expect(f.onSave).toHaveBeenCalledOnce();
  });
});
