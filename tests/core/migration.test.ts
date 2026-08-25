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
  it("applies protected-folder and configurable prefix rules", () => {
    expect(scanMigration({
      folders: [".git", ".git/objects", "_views", "A"],
      markdown: ["_draft.md", "Loose.md"],
    }, {
      folderPrefixes: ["_"],
      leafMarkdownPrefixes: ["_"],
    })).toEqual({
      conflicts: [],
      exemptLeafMarkdown: ["_draft.md"],
      ignoredFolders: [".git", "_views"],
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
  it("treats one case-only name variant as canonical and blocks ambiguous variants", () => {
    expect(scanMigration({ folders: ["Folder"], markdown: ["Folder/folder.md"] })).toEqual({
      conflicts: [], exemptLeafMarkdown: [], ignoredFolders: [], leafMarkdown: [], missingNodeNotes: [],
    });
    const ambiguous = scanMigration({ folders: ["Folder"], markdown: ["Folder/Folder.md", "Folder/folder.md"] });
    expect(ambiguous.conflicts[0]?.reason).toContain("Multiple canonical Node Notes");
    expect(ambiguous.leafMarkdown).toEqual([]);
    expect(ambiguous.missingNodeNotes).toEqual([]);
  });
});
