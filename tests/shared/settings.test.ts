import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, normalizeSettings } from "../../src/shared/settings";

describe("settings", () => {
  it("merges nested naming defaults", () => {
    const settings = normalizeSettings({ prefix: { enabled: true } });
    expect(settings.prefix.enabled).toBe(true);
    expect(settings.prefix.separator).toBe("_");
    expect(settings.suffix).toEqual(DEFAULT_SETTINGS.suffix);
  });
  it("rejects malformed nested naming values", () => {
    const settings = normalizeSettings({
      prefix: { enabled: "yes", source: "broken", separator: 42, customText: null },
      suffix: "broken",
    });
    expect(settings.prefix).toEqual(DEFAULT_SETTINGS.prefix);
    expect(settings.suffix).toEqual(DEFAULT_SETTINGS.suffix);
  });
  it("defaults unknown language values to follow Obsidian", () => {
    expect(normalizeSettings({ language: "unknown" }).language).toBe("auto");
    expect(normalizeSettings({ language: "zh-CN" }).language).toBe("zh-CN");
  });
  it("normalizes icon placement and exact exemption paths", () => {
    const settings = normalizeSettings({
      explorerIconPosition: "after",
      leafNoteExemptions: ["/AGENTS.md", "AGENTS.md", 1],
      ignoredFolders: ["\\Generated\\Cache\\"],
    });
    expect(settings.explorerIconPosition).toBe("after");
    expect(settings.leafNoteExemptions).toEqual(["AGENTS.md"]);
    expect(settings.ignoredFolders).toEqual(["Generated/Cache"]);
    expect(normalizeSettings({ explorerIconPosition: "unknown" }).explorerIconPosition).toBe("before");
  });
  it("keeps only curated Emoji font preferences", () => {
    expect(normalizeSettings({ emojiFont: "Twemoji Mozilla" }).emojiFont).toBe("Twemoji Mozilla");
    expect(normalizeSettings({ emojiFont: "Comic Sans MS" }).emojiFont).toBe("system");
  });
  it("uses the first-release unmanaged prefix defaults", () => {
    const settings = normalizeSettings({});
    expect(settings.leafNotePrefixes).toEqual([".", "_"]);
    expect(settings.ignoredFolderPrefixes).toEqual([".", "_"]);
  });
  it("normalizes explicitly configured prefix rules", () => {
    const settings = normalizeSettings({
      leafNotePrefixes: ["_", "_", "bad/path", 1],
      ignoredFolderPrefixes: [".", " _ "],
    });
    expect(settings.leafNotePrefixes).toEqual(["_"]);
    expect(settings.ignoredFolderPrefixes).toEqual([".", "_"]);
  });
});
