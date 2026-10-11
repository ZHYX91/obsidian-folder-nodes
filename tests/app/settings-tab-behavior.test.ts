import { type App, type TextComponent } from "obsidian";
import { describe, expect, it, vi } from "vitest";

import type FolderNodesPlugin from "../../src/app/plugin";
import { FolderNodesSettingTab } from "../../src/app/settings-tab";
import { CURRENT_SETTINGS_SCHEMA_VERSION, DEFAULT_SETTINGS } from "../../src/shared/settings";
import type { SettingsSaveState } from "../../src/shared/settings-save-coordinator";

vi.mock("obsidian", async (importOriginal) => {
  const actual = await importOriginal<typeof import("obsidian")>();
  class TestSetting extends actual.Setting {
    public override addText(configure: (component: TextComponent) => unknown): this {
      const input = this.controlEl.createEl("input");
      const component = {
        inputEl: input,
        setValue(value: string) { input.value = value; return this; },
        onChange(callback: (value: string) => unknown) {
          input.addEventListener("input", () => callback(input.value));
          return this;
        },
      } as unknown as TextComponent;
      configure(component);
      return this;
    }
  }
  class TestPluginSettingTab {
    public readonly containerEl = document.createElement("div");
  }
  return { ...actual, PluginSettingTab: TestPluginSettingTab, Setting: TestSetting };
});

function fixture() {
  const state: { current: SettingsSaveState } = { current: "saved" };
  const plugin = {
    settings: structuredClone(DEFAULT_SETTINGS),
    ensureStyles: vi.fn(),
    getSettingsCompatibility: () => ({
      status: "compatible" as const,
      currentSchemaVersion: CURRENT_SETTINGS_SCHEMA_VERSION,
      storedSchemaVersion: CURRENT_SETTINGS_SCHEMA_VERSION,
    }),
    getSettingsSaveState: () => state.current,
    retrySettingsSave: vi.fn(async () => { state.current = "saved"; }),
    saveSettings: vi.fn(async () => undefined),
    reconcileSettingsChange: vi.fn(async () => undefined),
  };
  const tab = new FolderNodesSettingTab({} as App, plugin as unknown as FolderNodesPlugin);
  document.body.append(tab.containerEl);
  return { tab, plugin, state };
}

function numberControl(tab: FolderNodesSettingTab, name: string, description: string) {
  const panel = document.body.createDiv();
  const method = tab as unknown as {
    renderGraphNumberSetting: (
      panel: HTMLElement,
      key: "largeGraphThreshold" | "overviewEdgeLimit",
      name: string,
      description: string,
      minimum: number,
      maximum: number,
    ) => void;
  };
  method.renderGraphNumberSetting(panel, "largeGraphThreshold", name, description, 50, 10_000);
  const input = panel.querySelector<HTMLInputElement>("input");
  if (input === null) throw new Error("Missing graph numeric input");
  return { input, panel };
}

describe("imperative settings edit state", () => {
  it("does not write an empty or intermediate graph threshold and commits valid edits on blur", async () => {
    const { tab, plugin } = fixture();
    const saved = plugin.settings.nodeGraph.largeGraphThreshold;
    const { input } = numberControl(tab, "Canvas threshold", "Choose the Canvas threshold");
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(plugin.settings.nodeGraph.largeGraphThreshold).toBe(saved);
    expect(plugin.saveSettings).not.toHaveBeenCalled();
    input.value = "240";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(plugin.settings.nodeGraph.largeGraphThreshold).toBe(saved);
    input.dispatchEvent(new Event("blur"));
    await vi.waitFor(() => expect(plugin.saveSettings).toHaveBeenCalledOnce());
    expect(plugin.settings.nodeGraph.largeGraphThreshold).toBe(240);
    expect(plugin.reconcileSettingsChange).toHaveBeenCalledOnce();
  });

  it("reports invalid numeric submissions without clamping or saving", async () => {
    const { tab, plugin } = fixture();
    const saved = plugin.settings.nodeGraph.largeGraphThreshold;
    const { input, panel } = numberControl(tab, "Canvas threshold", "Choose the Canvas threshold");
    input.value = "49";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("blur"));
    expect(plugin.saveSettings).not.toHaveBeenCalled();
    expect(plugin.settings.nodeGraph.largeGraphThreshold).toBe(saved);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(panel.textContent).toContain("50");
    expect(panel.textContent).toContain("10000");
  });

  it("updates failed-save feedback in place and retries without replacing a focused editor", async () => {
    const { tab, plugin, state } = fixture();
    Reflect.set(tab, "renderGeneral", (panel: HTMLElement) => {
      panel.createEl("input", { attr: { "data-test-editor": "true" } });
    });
    Reflect.set(tab, "revealActiveTab", () => undefined);
    tab.display();
    const editor = tab.containerEl.querySelector<HTMLInputElement>("[data-test-editor]");
    if (editor === null) throw new Error("Missing sentinel editor");
    editor.value = "draft";
    editor.focus();
    state.current = "pending";
    tab.refreshPersistenceStatus();
    expect(tab.containerEl.querySelector("[data-test-editor]")).toBe(editor);
    expect(document.activeElement).toBe(editor);
    expect(editor.value).toBe("draft");

    const retry = tab.containerEl.querySelector<HTMLButtonElement>(".folder-nodes-settings-warning button");
    expect(retry).not.toBeNull();
    retry?.click();
    await vi.waitFor(() => expect(plugin.retrySettingsSave).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(tab.containerEl.querySelector(".folder-nodes-settings-warning")).toBeNull());
    expect(tab.containerEl.querySelector("[data-test-editor]")).toBe(editor);
    expect(document.activeElement).toBe(editor);
  });
});
