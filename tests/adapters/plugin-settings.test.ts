import { describe, expect, it, vi } from "vitest";
import { openPluginSettings } from "../../src/adapters/plugin-settings";

describe("management settings entry", () => {
  it.each([null, undefined, {}, { setting: null }, { setting: {} }, { setting: { open: () => undefined } }])(
    "leaves unsupported settings APIs to the caller's visible fallback", (app) => {
      expect(openPluginSettings(app, "folder-nodes")).toBe(false);
    },
  );

  it("opens the native plugin tab with its host receiver", () => {
    const settings = { open: vi.fn(), openTabById: vi.fn() };
    expect(openPluginSettings({ setting: settings }, "folder-nodes")).toBe(true);
    expect(settings.open).toHaveBeenCalledExactlyOnceWith();
    expect(settings.open.mock.contexts).toEqual([settings]);
    expect(settings.openTabById).toHaveBeenCalledExactlyOnceWith("folder-nodes");
  });
});
