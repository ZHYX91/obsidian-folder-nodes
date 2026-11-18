// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { createFolderSettingsGuide } from "../../src/ui/settings-guide-disclosure";

describe("Folder Nodes setting tutorials", () => {
  it("starts closed and retains state only in the owning session Set", () => {
    Object.assign(HTMLElement.prototype, {
      createEl(this: HTMLElement, tag: string, opts?: { cls?: string; text?: string }) {
        const el = document.createElement(tag);
        if (opts?.cls) el.className = opts.cls;
        if (opts?.text) el.textContent = opts.text;
        this.append(el);
        return el;
      },
      createDiv(this: HTMLElement, opts?: { cls?: string }) {
        return (this as unknown as { createEl(tag: string, opts?: unknown): HTMLElement })
          .createEl("div", opts);
      },
    });
    const panel = document.createElement("section");
    const state = new Set<string>();
    createFolderSettingsGuide(panel, "management", "About files and nodes", state);
    let d = panel.querySelector("details")!;
    expect(d.open).toBe(false);
    d.open = true;
    d.dispatchEvent(new Event("toggle"));
    expect([...state]).toEqual(["management"]);
    panel.replaceChildren();
    createFolderSettingsGuide(panel, "management", "About files and nodes", state);
    d = panel.querySelector("details")!;
    expect(d.open).toBe(true);
    state.clear(); // FolderNodesSettingTab.hide()
    panel.replaceChildren();
    createFolderSettingsGuide(panel, "management", "About files and nodes", state);
    expect(panel.querySelector("details")?.open).toBe(false);
  });
});
