import type { App } from "obsidian";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SelectionCreateModal, selectionPreviewRows } from "../../src/ui/selection-create-modal";

afterEach(() => document.body.replaceChildren());

describe("selection creation preview", () => {
  it("shows only creation location, the short node name, and alias policy", () => {
    expect(selectionPreviewRows({
      parentPath: "Diary/2026/2026-09/2026-09-02",
      nodeName: "Hot seaweed rice roll",
      alias: null,
    })).toEqual([
      ["Create in", "Diary/2026/2026-09/2026-09-02"],
      ["Final node name", "Hot seaweed rice roll"],
      ["Alias", "Do not add"],
    ]);
  });
  it("lets the user edit the name and previews the exact bounded name submitted", async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const modal = new SelectionCreateModal({} as App, { parentPath: "", nodeName: "Original", alias: "Original text" }, create);
    modal.open();
    const input = modal.contentEl.querySelector<HTMLInputElement>("input")!;
    input.value = "汉".repeat(85);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect([...modal.contentEl.querySelectorAll("code")].map((element) => element.textContent))
      .toEqual(["Root", "汉".repeat(84), "Original text"]);
    modal.contentEl.querySelectorAll<HTMLButtonElement>("button")[1]!.click();
    await vi.waitFor(() => expect(create).toHaveBeenCalledExactlyOnceWith("汉".repeat(84)));
    expect(modal.contentEl.isConnected).toBe(false);
  });
  it("keeps an empty or failed draft editable for a retry", async () => {
    const create = vi.fn().mockRejectedValueOnce(new Error("Name collision")).mockResolvedValue(undefined);
    const modal = new SelectionCreateModal({} as App, { parentPath: "", nodeName: "Original", alias: null }, create);
    modal.open();
    const input = modal.contentEl.querySelector<HTMLInputElement>("input")!;
    const button = modal.contentEl.querySelectorAll<HTMLButtonElement>("button")[1]!;
    const edit = (value: string) => { input.value = value; input.dispatchEvent(new Event("input", { bubbles: true })); };
    edit(" "); button.click();
    expect(create).not.toHaveBeenCalled();
    edit("First"); button.click();
    await vi.waitFor(() => expect(input.disabled).toBe(false));
    expect(input.value).toBe("First");
    expect(modal.contentEl.isConnected).toBe(true);
    edit("Second"); button.click();
    await vi.waitFor(() => expect(create).toHaveBeenLastCalledWith("Second"));
  });
});
