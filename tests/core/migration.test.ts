import { describe, expect, it } from "vitest";
import { scanMigration } from "../../src/core/migration";

describe("migration scan", () => {
  it("finds leaf notes and missing node notes without writing", () => {
    expect(scanMigration({
      folders: ["A", "B"], markdown: ["A/A.md", "Loose.md"],
    })).toEqual({
      conflicts: [], exemptLeafMarkdown: [], ignoredFolders: [], leafMarkdown: ["Loose.md"], missingNodeNotes: ["B"],
    });
  });
  it("keeps exact leaf notes and ignored folder subtrees out of the write plan", () => {
    expect(scanMigration({
      folders: ["A", "Generated", "Generated/Child"],
      markdown: ["AGENTS.md", "Loose.md", "Generated/Child.md"],
    }, {
      leafMarkdown: ["AGENTS.md"],
      folders: ["Generated"],
    })).toEqual({
      conflicts: [],
      exemptLeafMarkdown: ["AGENTS.md"],
      ignoredFolders: ["Generated"],
      leafMarkdown: ["Loose.md"],
      missingNodeNotes: ["A"],
    });
  });
  it("blocks collisions", () => {
    const scan = scanMigration({ folders: ["A"], markdown: ["A.md", "A/A.md"] });
    expect(scan.conflicts).toHaveLength(1);
    expect(scan.leafMarkdown).toEqual([]);
  });
  it("blocks a leaf-note move into an unmanaged target folder", () => {
    const scan = scanMigration({ folders: ["Generated"], markdown: ["Generated.md"] }, { folders: ["Generated"] });
    expect(scan.leafMarkdown).toEqual([]);
    expect(scan.conflicts).toEqual([{ path: "Generated.md", reason: "Target belongs to an unmanaged folder: Generated" }]);
  });
});
