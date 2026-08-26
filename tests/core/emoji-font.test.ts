import { describe, expect, it } from "vitest";

import {
  configuredEmojiFontStack,
  isEmojiFontPreference,
} from "../../src/core/emoji-font";

describe("Emoji font preferences", () => {
  it("accepts only the curated system and color-font choices", () => {
    expect(isEmojiFontPreference("system")).toBe(true);
    expect(isEmojiFontPreference("Twemoji Mozilla")).toBe(true);
    expect(isEmojiFontPreference("Comic Sans MS")).toBe(false);
  });

  it("puts the selected font before portable system fallbacks without duplication", () => {
    expect(configuredEmojiFontStack("system")).toBeNull();
    expect(configuredEmojiFontStack("Noto Color Emoji")).toBe(
      '"Noto Color Emoji", "Segoe UI Emoji", "Apple Color Emoji", emoji',
    );
    expect(configuredEmojiFontStack("Twemoji Mozilla")).toBe(
      '"Twemoji Mozilla", "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", emoji',
    );
  });
});
