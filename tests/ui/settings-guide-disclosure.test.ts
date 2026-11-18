// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { createFolderSettingsGuide } from "../../src/ui/settings-guide-disclosure";

describe("Folder Nodes setting tutorials", () => {
  it("starts closed and retains state only in the owning session Set", () => {
    // The repository's Vitest setup installs Obsidian DOM factories.
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
