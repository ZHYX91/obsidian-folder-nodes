import { describe, expect, it } from "vitest";
import { scanMigration, scanMigrationAsync } from "../../src/core/migration";

describe("migration scan", () => {
  it("keeps the responsive scanner equivalent to the synchronous contract", async () => {
    const inventory = { folders: ["A", "B"], markdown: ["A/A.md", "Loose.md"], files: ["A/A.md", "Loose.md"] };
    const progress: number[] = [];

    expect(await scanMigrationAsync(inventory, {}, (completed) => progress.push(completed))).toEqual(scanMigration(inventory));
    expect(progress.at(-1)).toBeGreaterThan(0);
  });

  it("cancels a responsive scan without returning a partial plan", async () => {
    const controller = new AbortController();
    const folders = Array.from({ length: 2_000 }, (_, index) => `Folder-${index}`);

    await expect(scanMigrationAsync({ folders, markdown: [] }, {}, () => {
      controller.abort(new Error("cancelled by user"));
    }, controller.signal)).rejects.toThrow("cancelled by user");
  });

  it("finds leaf notes and missing node notes without writing", () => {
    expect(scanMigration({
      folders: ["A", "B"], markdown: ["A/A.md", "Loose.md"],
    })).toEqual({
      conflicts: [], exemptLeafMarkdown: [], ignoredFolders: [], leafMarkdown: ["Loose.md"], missingNodeNotes: ["B"],
    });
  });

  it("does not preview an empty note when a matching leaf move completes the folder", () => {
    expect(scanMigration({
      folders: ["A"], markdown: ["A.md"],
    })).toEqual({
      conflicts: [], exemptLeafMarkdown: [], ignoredFolders: [], leafMarkdown: ["A.md"], missingNodeNotes: [],
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

  it("fails closed when a leaf target differs only by folder case", () => {
    const scan = scanMigration({ folders: ["A"], markdown: ["a.md"] });

    expect(scan.leafMarkdown).toEqual([]);
    expect(scan.missingNodeNotes).toEqual(["A"]);
    expect(scan.conflicts).toEqual([{ path: "a.md", reason: "Target folder differs only by case: A" }]);
  });

  it("keeps canonical notes structural even when a leaf exemption matches them", () => {
    expect(scanMigration(
      { folders: ["A"], markdown: ["A/A.md"] },
      { leafMarkdown: ["A/A.md"] },
    )).toEqual({
      conflicts: [], exemptLeafMarkdown: [], ignoredFolders: [], leafMarkdown: [], missingNodeNotes: [],
    });
  });
});
