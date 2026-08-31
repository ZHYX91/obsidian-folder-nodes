import { describe, expect, it, vi } from "vitest";

import {
  assertSettingsWritable,
  lockSettingsPanel,
  renderSettingsPersistenceStatus,
} from "../../src/app/settings-persistence-status";

describe("settings persistence status", () => {
  it("renders a future schema as an explicit read-only state", () => {
    const container = document.body.createDiv();
    const panel = container.createDiv();
    const tab = container.createEl("button");
    const button = panel.createEl("button");
    const input = panel.createEl("input");
    const compatibility = {
      status: "incompatible" as const,
      currentSchemaVersion: 1 as const,
      storedSchemaVersion: 2,
      reason: "future-schema" as const,
    };

    renderSettingsPersistenceStatus(container, compatibility, "blocked", vi.fn());
    lockSettingsPanel(panel, true);

    const warning = container.querySelector<HTMLElement>(".folder-nodes-settings-warning");
    expect(warning?.getAttribute("role")).toBe("alert");
    expect(warning?.textContent).toContain("unsupported schema 2");
    expect(warning?.textContent).toContain("supports schema 1");
    expect(warning?.textContent).toContain("was not rewritten");
    expect(panel.getAttribute("aria-disabled")).toBe("true");
    expect(button.disabled).toBe(true);
    expect(input.disabled).toBe(true);
    expect(tab.disabled).toBe(false);
    expect(() => assertSettingsWritable(compatibility)).toThrow(expect.objectContaining({
      code: "settings_schema_incompatible",
    }));
  });

  it("shows a failed save and exposes a working retry", async () => {
    const container = document.body.createDiv();
    const retry = vi.fn().mockResolvedValue(undefined);
    renderSettingsPersistenceStatus(container, {
      status: "compatible",
      currentSchemaVersion: 1,
      storedSchemaVersion: 1,
    }, "pending", retry);

    const warning = container.querySelector<HTMLElement>(".folder-nodes-settings-warning");
    const button = warning?.querySelector<HTMLButtonElement>("button");
    expect(warning?.textContent).toContain("Settings have not been saved");
    expect(warning?.textContent).toContain("remain in this session");
    button?.click();
    await vi.waitFor(() => expect(retry).toHaveBeenCalledOnce());
    expect(button?.disabled).toBe(true);
  });

  it("renders no persistence warning for saved settings", () => {
    const container = document.body.createDiv();
    renderSettingsPersistenceStatus(container, {
      status: "compatible",
      currentSchemaVersion: 1,
      storedSchemaVersion: 1,
    }, "saved", vi.fn());
    expect(container.children).toHaveLength(0);
  });
});
