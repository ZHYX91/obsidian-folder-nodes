import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/app/plugin.ts", "utf8");

describe("plugin localization lifecycle", () => {
  it("refreshes command and ribbon labels after an interface-language change", () => {
    expect(source).toContain("private readonly localizedCommands");
    expect(source).toContain("this.ribbonElement = this.addRibbonIcon");
    expect(source).toContain("this.refreshLocalizedChrome();");
    expect(source).toContain('this.ribbonElement?.setAttribute("aria-label", ribbonLabel)');
    expect(source).toContain("command.name = command.name.startsWith(namePrefix)");
  });

  it("keeps the hidden-node command label aligned with the current session state", () => {
    expect(source).toContain('this.showHiddenNodesThisSession\n        ? "hideHiddenNodesThisSession"\n        : "showHiddenNodesThisSession"');
    expect(source).toContain("this.showHiddenNodesThisSession = !this.showHiddenNodesThisSession;\n    this.refreshLocalizedChrome();");
  });
});
