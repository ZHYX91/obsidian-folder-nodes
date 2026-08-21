import { afterEach, describe, expect, it } from "vitest";
import { setMockLanguage } from "../mocks/obsidian";
import { resolvedLanguage, setLanguage, t } from "../../src/ui/i18n";

afterEach(() => {
  setLanguage("auto");
  setMockLanguage("en");
});

describe("interface language", () => {
  it("follows Obsidian's current language in automatic mode", () => {
    setMockLanguage("zh-cn");
    expect(resolvedLanguage()).toBe("zh-CN");
    expect(t("auto")).toBe("跟随 Obsidian");

    setMockLanguage("en");
    expect(resolvedLanguage()).toBe("en");
    expect(t("auto")).toBe("Follow Obsidian");
  });

  it("lets an explicit plugin language override Obsidian", () => {
    setMockLanguage("zh-cn");
    setLanguage("en");
    expect(resolvedLanguage()).toBe("en");

    setMockLanguage("en");
    setLanguage("zh-CN");
    expect(resolvedLanguage()).toBe("zh-CN");
  });
});
