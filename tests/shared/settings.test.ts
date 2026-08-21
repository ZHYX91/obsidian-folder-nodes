import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, normalizeSettings } from "../../src/shared/settings";

describe("settings", () => {
  it("merges nested naming defaults", () => {
    const settings = normalizeSettings({ prefix: { enabled: true } });
    expect(settings.prefix.enabled).toBe(true);
    expect(settings.prefix.separator).toBe("_");
    expect(settings.suffix).toEqual(DEFAULT_SETTINGS.suffix);
  });
  it("defaults unknown language values to follow Obsidian", () => {
    expect(normalizeSettings({ language: "unknown" }).language).toBe("auto");
    expect(normalizeSettings({ language: "zh-CN" }).language).toBe("zh-CN");
  });
});
