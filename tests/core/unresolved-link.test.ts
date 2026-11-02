import { describe, expect, it } from "vitest";
import { aliasFromLinkDisplay, planUnresolvedNode } from "../../src/core/unresolved-link";

describe("unresolved link node creation", () => {
  it("plans simple links under Obsidian's selected new-note parent", () => {
    expect(planUnresolvedNode("a", "Current")).toEqual({
      nodeName: "a",
      nodePath: "Current/a",
      notePath: "Current/a/a.md",
      leafPath: "Current/a.md",
    });
  });

  it("preserves explicit Vault paths and removes an explicit Markdown extension", () => {
    expect(planUnresolvedNode("x/a.md", "Ignored")).toEqual({
      nodeName: "a",
      nodePath: "x/a",
      notePath: "x/a/a.md",
      leafPath: "x/a.md",
    });
  });

  it("leaves unsafe, relative, and non-Markdown destinations to Obsidian", () => {
    expect(planUnresolvedNode("../a", "")).toBeNull();
    expect(planUnresolvedNode("a?.md", "")).toBeNull();
    expect(planUnresolvedNode("image.png", "")).toBeNull();
    expect(planUnresolvedNode("汉".repeat(85), "")).toBeNull();
    expect(planUnresolvedNode("汉".repeat(85) + "/Child", "")).toBeNull();
    expect(planUnresolvedNode("Child", "汉".repeat(100))?.nodePath).toBe("汉".repeat(100) + "/Child");
  });

  it("uses only an explicit display text as the creation alias", () => {
    const candidates = [{ linkPath: "a", original: "[[a|b]]", displayText: "b" }];
    expect(aliasFromLinkDisplay("a", "b", candidates, true)).toBe("b");
    expect(aliasFromLinkDisplay("a", "a", [], true)).toBeNull();
    expect(aliasFromLinkDisplay("x/a", "a", [], true)).toBeNull();
  });

  it("does not infer a heading label when the cache cannot prove an explicit alias", () => {
    expect(aliasFromLinkDisplay("a", "Heading", [], false)).toBeNull();
  });
});
