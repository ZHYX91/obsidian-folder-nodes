import { afterEach, describe, expect, it } from "vitest";
import { setMockLanguage } from "../mocks/obsidian";
import { FolderNodesError } from "../../src/core/folder-nodes-error";
import { formatError, localeCoverage, resolvedLanguage, setLanguage, t, interfaceTextDirection } from "../../src/ui/i18n";
import { AVAILABLE_INTERFACE_LOCALES } from "../../src/core/interface-languages";
import { LANGUAGE_OVERRIDES } from "../../src/ui/locale-overrides";

afterEach(() => {
  setLanguage("auto");
  setMockLanguage("en");
});

describe("interface language", () => {
  it("follows Obsidian's current language in automatic mode", () => {
    setMockLanguage("zh-cn");
    expect(resolvedLanguage()).toBe("zh-CN");
    expect(t("auto")).toBe("跟随 Obsidian");

    setMockLanguage("zh-tw");
    expect(resolvedLanguage()).toBe("zh-TW");

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

  it.each([
    ["zh-Hant-TW", "zh-TW"],
    ["zh-Hans-CN", "zh-CN"],
    ["pt-PT", "pt-BR"],
    ["ja-JP", "ja"],
    ["ko-KR", "ko"],
    ["ar-SA", "ar"],
    ["de-DE", "de"],
    ["es-ES", "es"],
    ["fr-FR", "fr"],
    ["ru-RU", "ru"],
    ["vi-VN", "vi"],
    ["xx-XX", "en"],
  ] as const)("follows the host language %s as %s", (host, locale) => {
    setMockLanguage(host);
    expect(resolvedLanguage()).toBe(locale);
  });

  it("scopes RTL to Arabic and retains placeholders in translated draft strings", () => {
    setLanguage("ar");
    expect(interfaceTextDirection()).toBe("rtl");
    expect(t("hiddenByNode", { path: "Private/A" })).toBe("مخفية بسبب Private/A");
    expect(t("settings")).toBe("إعدادات Folder Nodes");
    setLanguage("ja");
    expect(interfaceTextDirection()).toBe("ltr");
    expect(t("settings")).toBe("Folder Nodes の設定");
    expect(AVAILABLE_INTERFACE_LOCALES).toHaveLength(12);
  });

  it("checks placeholder compatibility across all full translation catalogs", () => {
    setLanguage("en");
    const keys = Object.keys(LANGUAGE_OVERRIDES.ar ?? {});
    expect(localeCoverage("zh-CN").translated).toBe(localeCoverage("zh-CN").total);
    expect(localeCoverage("en").translated).toBe(localeCoverage("en").total);
    expect(localeCoverage("ar").translated).toBe(keys.length);
    expect(localeCoverage("ar").total).toBe(372);
    for (const locale of AVAILABLE_INTERFACE_LOCALES) {
      const values = LANGUAGE_OVERRIDES[locale] ?? {};
      for (const [key, translated] of Object.entries(values)) {
        const source = t(key as Parameters<typeof t>[0]);
        const placeholders = (message: string) =>
          [...message.matchAll(/\{([A-Za-z][A-Za-z0-9]*)\}/gu)].map((match) => match[1]).sort();
        expect(placeholders(translated), `${locale}:${key}`).toEqual(placeholders(source));
      }
    }
  });

  it("requires complete interface coverage in every registered locale", () => {
    setLanguage("en");
    const referenceKeys = Object.keys(LANGUAGE_OVERRIDES["zh-TW"] ?? {});
    const canonicalKeys = new Set(referenceKeys);
    expect(referenceKeys).toHaveLength(372);
    expect(AVAILABLE_INTERFACE_LOCALES).toHaveLength(12);

    for (const locale of AVAILABLE_INTERFACE_LOCALES) {
      const coverage = localeCoverage(locale);
      expect(coverage, locale).toEqual({ translated: 372, total: 372 });
      if (locale === "en" || locale === "zh-CN") continue;
      const translatedKeys = Object.keys(LANGUAGE_OVERRIDES[locale] ?? {});
      expect(translatedKeys, locale).toEqual(referenceKeys);
      for (const key of translatedKeys) {
        expect(canonicalKeys.has(key), `${locale}:${key} is not a canonical interface key`).toBe(true);
        expect(LANGUAGE_OVERRIDES[locale]?.[key]?.trim().length, `${locale}:${key} is blank`).toBeGreaterThan(0);
      }
    }
  });

  it("translates long interface, error, and graph messages instead of falling back to English", () => {
    setLanguage("en");
    const keys = ["managementGuideTitle", "errorInvalidMove", "nodeGraphViewportHelp", "settingsSavePendingDesc"] as const;
    const english = keys.map((key) => t(key));
    for (const locale of AVAILABLE_INTERFACE_LOCALES) {
      if (locale === "en") continue;
      setLanguage(locale);
      for (const [index, key] of keys.entries()) {
        expect(t(key), `${locale}:${key}`).not.toBe(english[index]);
      }
    }
  });

  it("explains save failures, migrations, and graph controls in plain Chinese", () => {
    setLanguage("zh-CN");
    expect(t("settingsSavePendingDesc")).toContain("重试保存");
    expect(t("settingsReadOnlyDesc", { stored: 5, current: 4 })).toContain("不会改写 data.json");
    expect(t("propertyMigrationDesc")).toContain("确认后才会写入");
    expect(t("nodeGraphLayoutDirectionDesc")).toContain("思维导图");
    expect(t("languageDesc")).toContain("不会修改笔记");
    expect(t("iconInheritanceDesc")).toContain("上级节点");
  });

  it("uses natural Traditional Chinese terminology and keeps Arabic RTL scoped", () => {
    setLanguage("zh-TW");
    expect(t("nodeGraphDefaults")).toBe("預設視圖");
    expect(t("filesAndFolders")).toBe("檔案與資料夾");
    expect(t("nodeGraphVisibleLinks", { count: 3 })).toContain("連結");
    expect(interfaceTextDirection()).toBe("ltr");
    setLanguage("ar");
    expect(interfaceTextDirection()).toBe("rtl");
    expect(t("errorMissingNote", { path: "A/A.md" })).toContain("A/A.md");
    setLanguage("en");
    expect(interfaceTextDirection()).toBe("ltr");
  });

  it("localizes stable structural errors without exposing internal English messages", () => {
    setLanguage("zh-CN");
    expect(formatError(new FolderNodesError("root_cannot_hide", {}, "The Root Node cannot be hidden")))
      .toBe("根节点不能隐藏。");
    expect(formatError(new FolderNodesError("folder_unmanaged", { path: "Private" }, "Folder is unmanaged: Private")))
      .toBe("此文件夹当前设为不管理：Private");
    expect(formatError(new FolderNodesError("selection_editor_changed", {}, "Source editor changed after preview")))
      .toBe("创建过程中来源编辑器已变化，创建已停止。");
    expect(formatError(new FolderNodesError("selection_wikilink_label_unsafe")))
      .toBe("所选文字无法安全用 WikiLink 表示；可切换 Obsidian 的 Markdown 链接格式后重试。");
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
    expect(t("managementGuideStructure")).toContain("A/A.md");
    expect(t("managementGuideBoundary")).toContain("不管理");
    expect(t("managementGuideActions")).toContain("所在节点");
    expect(t("hiddenNode")).toBe("隐藏");
    expect(t("incompleteStatus")).toBe("不完整");
    expect(t("conflictStatus")).toBe("冲突");
    expect(t("folderType")).toBe("文件夹");
    expect(t("moveContainingNode")).toContain("所在节点");
    expect(t("selectionCrossesTableCells")).toContain("表格");

    setLanguage("en");
    expect(t("editVisual")).toBe("Set node icon");
    expect(t("visualValue")).toBe("icon property");
    expect(t("setAsVisual")).toBe("Use as current node icon");
    expect(t("aliasesDesc")).toContain("[[a|b]]");
    expect(t("unmanaged")).toBe("Unmanaged");
    expect(t("managementGuideStructure")).toContain("A/A.md");
    expect(t("managementGuideBoundary")).toContain("Unmanaged");
    expect(t("managementGuideActions")).toContain("Rename containing node");
    expect(t("nodeGraphEdgeLimitDesc")).not.toContain("structure skeleton");
    expect(t("hiddenNode")).toBe("Hidden");
    expect(t("incompleteStatus")).toBe("Incomplete");
    expect(t("conflictStatus")).toBe("Conflict");
    expect(t("folderType")).toBe("Folder");
    expect(t("deleteContainingNode")).toBe("Delete containing node");
  });
});
