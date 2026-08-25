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

  it("uses icon terminology consistently in both languages", () => {
    setLanguage("zh-CN");
    expect(t("editVisual")).toBe("设置节点图标");
    expect(t("visualValue")).toBe("icon 属性");
    expect(t("setAsVisual")).toBe("设为当前节点图标");
    expect(t("iconInheritanceDesc")).not.toContain("视觉");
    expect(t("iconGuideIntro")).toContain("icon 属性");
    expect(t("aliasesDesc")).toContain("[[a|b]]");
    expect(t("creationGuideScope")).toContain("Obsidian");
    expect(t("unmanaged")).toBe("不管理");
    expect(t("folderType")).toBe("文件夹");
    expect(t("moveContainingNode")).toContain("所在节点");
    expect(t("selectionCrossesTableCells")).toContain("表格");

    setLanguage("en");
    expect(t("editVisual")).toBe("Set node icon");
    expect(t("visualValue")).toBe("icon property");
    expect(t("setAsVisual")).toBe("Use as current node icon");
    expect(t("aliasesDesc")).toContain("[[a|b]]");
    expect(t("unmanaged")).toBe("Unmanaged");
    expect(t("folderType")).toBe("Folder");
    expect(t("deleteContainingNode")).toBe("Delete containing node");
  });
});
