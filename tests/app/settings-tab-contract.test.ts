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
});
