import type { App } from "obsidian";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConfirmModal, PromptModal } from "../../src/ui/prompt-modal";
import { setLanguage } from "../../src/ui/i18n";
import { Notice as MockNotice } from "../mocks/obsidian";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function openPrompt(onSubmit: (value: string) => Promise<void> | void = vi.fn()) {
  const modal = new PromptModal({} as App, "Name", "", "Save", onSubmit);
  modal.open();
  const input = modal.contentEl.querySelector<HTMLInputElement>("input")!;
  const buttons = [...modal.contentEl.querySelectorAll<HTMLButtonElement>("button")];
  const edit = (value: string) => {
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };
  return { modal, input, edit, cancel: buttons[0]!, save: buttons[1]! };
}

beforeEach(() => { setLanguage("en"); MockNotice.messages.length = 0; });
afterEach(() => { document.body.replaceChildren(); });

describe("PromptModal input events", () => {
  it.each([
    { isComposing: true, compositionStarted: false },
    { isComposing: false, compositionStarted: true },
  ])("does not submit an IME confirmation Enter (%j)", ({ isComposing, compositionStarted }) => {
    const onSubmit = vi.fn();
    const { modal, input, edit } = openPrompt(onSubmit);
    edit("测试");
    if (compositionStarted) input.dispatchEvent(new CompositionEvent("compositionstart"));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, isComposing }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(modal.contentEl.isConnected).toBe(true);
    expect(input.value).toBe("测试");
  });

  it("submits the completed trimmed value on a subsequent Enter", async () => {
    const onSubmit = vi.fn();
    const { modal, input, edit } = openPrompt(onSubmit);
    input.dispatchEvent(new CompositionEvent("compositionstart"));
    edit("测");
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true }));
    input.dispatchEvent(new CompositionEvent("compositionend", { data: "测试" }));
    edit(" 测试 ");
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    await vi.waitFor(() => expect(modal.contentEl.isConnected).toBe(false));
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith("测试");
  });

  it("keeps an empty prompt open and allows normal cancellation", () => {
    const onSubmit = vi.fn();
    const { modal, edit, save, cancel } = openPrompt(onSubmit);
    edit("  ");
    save.click();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(modal.contentEl.isConnected).toBe(true);
    cancel.click();
    expect(modal.contentEl.isConnected).toBe(false);
  });

  it("allows one pending write despite repeated Enter, Save, and Cancel events", async () => {
    const pending = deferred();
    const onSubmit = vi.fn(() => pending.promise);
    const { modal, input, edit, save, cancel } = openPrompt(onSubmit);
    edit("Alpha");
    save.click();
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    save.click();
    cancel.click();
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith("Alpha");
    expect(modal.contentEl.isConnected).toBe(true);
    pending.resolve();
    await vi.waitFor(() => expect(modal.contentEl.isConnected).toBe(false));
  });

  it("keeps the draft after a failed write and permits a retry", async () => {
    const onSubmit = vi.fn().mockRejectedValueOnce(new Error("Disk unavailable")).mockResolvedValue(undefined);
    const { modal, input, edit, save } = openPrompt(onSubmit);
    edit("Alpha");
    save.click();
    await vi.waitFor(() => expect(MockNotice.messages.at(-1)).toContain("Disk unavailable"));
    expect(modal.contentEl.isConnected).toBe(true);
    expect(input.value).toBe("Alpha");
    save.click();
    await vi.waitFor(() => expect(modal.contentEl.isConnected).toBe(false));
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });
});

describe("ConfirmModal actions", () => {
  it("keeps a destructive confirmation open and disabled until its write completes", async () => {
    const pending = deferred();
    const onConfirm = vi.fn(() => pending.promise);
    const modal = new ConfirmModal({} as App, "Delete", "Delete Alpha?", "Delete", true, onConfirm);
    modal.open();
    const [cancel, confirm] = [...modal.contentEl.querySelectorAll<HTMLButtonElement>("button")];
    expect(confirm!.classList.contains("mod-warning")).toBe(true);
    confirm!.click();
    confirm!.click();
    cancel!.click();
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(confirm!.disabled).toBe(true);
    expect(modal.contentEl.isConnected).toBe(true);
    pending.resolve();
    await vi.waitFor(() => expect(modal.contentEl.isConnected).toBe(false));
  });

  it("reenables a failed confirmation and permits cancellation", async () => {
    const modal = new ConfirmModal({} as App, "Move", "Move Alpha?", "Move", false, async () => { throw new Error("Disk unavailable"); });
    modal.open();
    const [cancel, confirm] = [...modal.contentEl.querySelectorAll<HTMLButtonElement>("button")];
    confirm!.click();
    await vi.waitFor(() => expect(MockNotice.messages.at(-1)).toContain("Disk unavailable"));
    expect(confirm!.disabled).toBe(false);
    expect(modal.contentEl.isConnected).toBe(true);
    cancel!.click();
    expect(modal.contentEl.isConnected).toBe(false);
  });
});
