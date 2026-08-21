import { describe, expect, it } from "vitest";
import { isProtectedFolderPath, matchesFolderExemption, matchesLeafNoteExemption } from "../../src/core/exemptions";

describe("exemption rules", () => {
  it("always protects Obsidian, Git, and trash subtrees", () => {
    expect(isProtectedFolderPath(".git/objects")).toBe(true);
    expect(matchesFolderExemption("A/.git/objects", [], [])).toBe(true);
    expect(matchesFolderExemption(".trash", [], [])).toBe(true);
  });

  it("matches exact folder subtrees and any prefixed path segment", () => {
    expect(matchesFolderExemption("Generated/Cache", ["Generated"], [])).toBe(true);
    expect(matchesFolderExemption("A/_views/Child", [], ["_"])).toBe(true);
    expect(matchesFolderExemption("A/Views", [], ["_"])).toBe(false);
  });

  it("matches leaf-note prefixes against only the file name", () => {
    expect(matchesLeafNoteExemption("A/_index.md", [], ["_"])).toBe(true);
    expect(matchesLeafNoteExemption("_private/Note.md", [], ["_"])).toBe(false);
    expect(matchesLeafNoteExemption("A/Keep.md", ["A/Keep.md"], [])).toBe(true);
  });
});
