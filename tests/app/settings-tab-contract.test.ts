import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("settings tab compatibility contract", () => {
  it("routes Obsidian 1.13 through the intentional imperative top tabs", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/app/settings-tab.ts"),
      "utf8",
    );

    expect(source).toContain("const ENABLE_DECLARATIVE_SETTINGS = false");
    expect(source).toContain(
      "return ENABLE_DECLARATIVE_SETTINGS ? this.getDeclarativeSettingDefinitions() : [];",
    );
    expect(source).toContain("public getDeclarativeSettingDefinitions()");
    expect(source).toContain('attr: { role: "tablist"');
  });

  it("places a themed icon guide before the appearance controls", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/app/settings-tab.ts"),
      "utf8",
    );
    const styles = readFileSync(resolve(process.cwd(), "src/ui/styles.css"), "utf8");

    expect(source).toContain("this.renderIconGuide(panel);");
    expect(source).toContain("this.renderEmojiFontSetting(panel);");
    expect(source.indexOf("this.renderIconGuide(panel);")).toBeLessThan(
      source.indexOf('new Setting(panel).setName(t("iconInheritance"))'),
    );
    expect(source).toContain('text: "icon: 💰"');
    expect(source).toContain('t("iconColorBehavior")');
    expect(source).toContain("this.renderIconComparisonRow");
    expect(source).toContain('t("iconFromProperty"), "A", "Project", true');
    expect(source).toContain('t("characterInFilename"), "", "A Project", false');
    expect(source).toContain('t("iconFromProperty"), "📓", "Project", true');
    expect(source).toContain('t("characterInFilename"), "", "📓 Project", false');
    expect(source).not.toContain("1994");
    expect(source).not.toContain('t("iconFromProperty"), "想"');
    expect(source).toContain('t("iconDistinctionDesc")');
    expect(styles).toContain(".folder-nodes-settings-guide");
    expect(styles).toContain(
      "border-inline-start: 3px solid var(--interactive-accent)",
    );
    expect(styles).toContain("background: var(--background-secondary)");
    expect(styles).toContain("--folder-nodes-glyph-font: var(--font-interface)");
    expect(styles).toContain('"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"');
    expect(source).toContain("detectInstalledEmojiFonts()");
    expect(source).toContain('text: "📔 🫠 🩷 👨‍👩‍👧‍👦 🏳️‍🌈 🇨🇳"');
    expect(styles).toContain(".folder-nodes-emoji-font-preview-sample");
    expect(styles).toContain(".folder-nodes-settings-icon-demo-slot");
    expect(styles).not.toContain(".folder-nodes-settings-icon-demo-badge");
  });

  it("matches the established tab-to-section hierarchy without a duplicate plugin heading", () => {
    const source = readFileSync(resolve(process.cwd(), "src/app/settings-tab.ts"), "utf8");
    const styles = readFileSync(resolve(process.cwd(), "src/ui/styles.css"), "utf8");

    expect(source).not.toContain('new Setting(this.containerEl).setName(t("settings")).setHeading()');
    expect(source).not.toContain('new Setting(panel).setName(this.tabLabel(this.activeTab)).setHeading()');
    expect(source).toContain('button.type = "button"');
    expect(source).toContain('getComputedStyle(container).direction === "rtl"');
    expect(styles).toContain("container-type: inline-size");
    expect(styles).toContain("margin-block-start: var(--size-4-5)");
    expect(styles).toContain(".folder-nodes-settings .folder-nodes-tabs > button.folder-nodes-tab");
    expect(styles).toContain("appearance: none !important");
    expect(styles).toContain("min-block-size: 34px");
    expect(styles).toContain("background: transparent !important");
    expect(styles).toContain("font-weight: var(--font-semibold) !important");
    expect(styles).toContain("min-block-size: 44px");
    expect(styles).not.toMatch(/\n\s+height: 34px/);
  });

  it("keeps root, property visuals, names, and statuses in distinct visual slots", () => {
    const styles = readFileSync(resolve(process.cwd(), "src/ui/styles.css"), "utf8");

    expect(styles).toContain("display: grid !important");
    expect(styles).toContain("grid-template-columns: 22px minmax(0, 1fr) max-content !important");
    expect(styles).toContain("inline-size: calc(100% - 12px)");
    expect(styles).toContain("flex: 0 0 auto");
    expect(styles).toContain("justify-self: end");
    expect(styles).not.toContain(".folder-nodes-explorer-root.tree-item-self.nav-file-title");
    expect(styles).toContain("max-inline-size: 100%");
    expect(styles).toContain("flex: 0 0 22px");
    expect(styles).toContain(".folder-nodes-explorer-icon > svg { display: block; width: 16px; height: 16px; }");
    expect(styles).toContain(".folder-nodes-explorer-icon img { display: block; width: 18px; height: 18px; border-radius: 4px; }");
    expect(styles).toContain(".folder-nodes-explorer-icon .folder-nodes-visual-emoji { font-size: 16px; }");
    expect(styles).toContain(".nav-folder-title.folder-nodes-missing-note { align-items: center; }");
    expect(styles).toContain("margin-inline-start: auto");
    expect(styles).toContain("background: color-mix(in srgb, var(--color-orange) 12%, var(--background-primary))");
    expect(styles).not.toContain(".folder-nodes-visual.has-accent:is(.is-emoji, .is-image)");
    expect(styles).toContain(".folder-nodes-visual.has-accent .folder-nodes-visual-glyph");
    expect(styles).toContain(".folder-nodes-visual-color { flex: 0 0 auto; width: 12px; height: 12px; border-radius: 50%; }");
    expect(styles).not.toContain("--folder-nodes-icon-badge-");
    expect(styles).not.toContain("border: 1px solid var(--folder-nodes-icon-badge-border)");
  });

  it("explains selection and unresolved-link creation before the shared aliases switch", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/app/settings-tab.ts"),
      "utf8",
    );

    expect(source).toContain("this.renderNamingGuide(panel);");
    expect(source.indexOf("this.renderNamingGuide(panel);")).toBeLessThan(
      source.indexOf('new Setting(panel).setName(t("aliases"))'),
    );
    expect(source).toContain('this.creationExample(body, "[[a]]", "a/a.md", null);');
    expect(source).toContain('this.creationExample(body, "[[a|b]]", "a/a.md", t("creationGuideAliasResult"));');
  });

  it("describes name-start rules without wildcard notation", () => {
    const source = readFileSync(resolve(process.cwd(), "src/app/settings-tab.ts"), "utf8");

    expect(source).toContain('t("nameStartsWith", { prefix })');
    expect(source).toContain('t("addNameStartRule")');
    expect(source).not.toContain('prefix + "*"');
  });
});
