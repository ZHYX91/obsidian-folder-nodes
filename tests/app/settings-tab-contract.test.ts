import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("settings tab compatibility contract", () => {
  it("temporarily routes Obsidian 1.13 through the imperative top tabs", () => {
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
    const styles = readFileSync(resolve(process.cwd(), "styles.css"), "utf8");

    expect(source).toContain("this.renderIconGuide(panel);");
    expect(source.indexOf("this.renderIconGuide(panel);")).toBeLessThan(
      source.indexOf('new Setting(panel).setName(t("iconInheritance"))'),
    );
    expect(source).toContain('text: "icon: 💰"');
    expect(styles).toContain(".folder-nodes-settings-guide");
    expect(styles).toContain(
      "border-inline-start: 3px solid var(--interactive-accent)",
    );
    expect(styles).toContain("background: var(--background-secondary)");
  });
});
