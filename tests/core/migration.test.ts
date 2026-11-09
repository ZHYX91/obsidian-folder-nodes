import { describe, expect, it, vi } from "vitest";
import { scanMigrationAsync } from "../../src/core/migration";

describe("migration scan", () => {
  it("reports completed progress for the production planner", async () => {
    const inventory = { folders: ["A", "B"], markdown: ["A/A.md", "Loose.md"], files: ["A/A.md", "Loose.md"] };
    const progress: number[] = [];

    expect(await scanMigrationAsync(inventory, {}, (completed) => progress.push(completed))).toEqual({
      conflicts: [], exemptLeafMarkdown: [], ignoredFolders: [], leafMarkdown: ["Loose.md"], missingNodeNotes: ["B"],
    });
    expect(progress.at(-1)).toBeGreaterThan(0);
  });

  it("cancels a responsive scan without returning a partial plan", async () => {
    const controller = new AbortController();
    const folders = Array.from({ length: 2_000 }, (_, index) => `Folder-${index}`);

    await expect(scanMigrationAsync({ folders, markdown: [] }, {}, () => {
      controller.abort(new Error("cancelled by user"));
    }, controller.signal)).rejects.toThrow("cancelled by user");
  });

  it("honors cancellation from an event-loop task while planning", async () => {
    const controller = new AbortController();
    const folders = Array.from({ length: 2_000 }, (_, index) => `Folder-${index}`);
    const cancellation = new Error("cancelled during yield");
    globalThis.setTimeout(() => controller.abort(cancellation), 0);

    await expect(scanMigrationAsync({ folders, markdown: [] }, {}, undefined, controller.signal))
      .rejects.toBe(cancellation);
  });

  it("reports progress without sleeping between checkpoints in the same time slice", async () => {
    const folders = Array.from({ length: 1_000 }, (_, index) => `Folder-${index}`);
    const clock = vi.spyOn(performance, "now").mockReturnValue(0);
    const timer = vi.spyOn(window, "setTimeout");
    let progress = 0;
    try {
      await scanMigrationAsync({ folders, markdown: [] }, {}, () => {
        progress += 1;
        if (progress === 3) clock.mockReturnValue(100);
      });
      expect(progress).toBeGreaterThan(3);
      expect(timer).toHaveBeenCalledTimes(2);
    } finally {
      timer.mockRestore();
      clock.mockRestore();
    }
  });

  it("yields during a large preview and keeps progress bounded and nondecreasing", async () => {
    const folders = Array.from({ length: 1_000 }, (_, index) => `Node-${index}`);
    const markdown = folders.map((folder) => `${folder}/${folder}.md`);
    const progress: Array<readonly [number, number]> = [];
    let yielded = false;
    const tick = new Promise<void>((resolve) => globalThis.setTimeout(() => { yielded = true; resolve(); }, 0));
    const scan = await scanMigrationAsync({ folders, markdown }, {}, (completed, total) => {
      progress.push([completed, total]);
    });
    expect(yielded).toBe(true);
    await tick;
    expect(scan).toEqual({ conflicts: [], exemptLeafMarkdown: [], ignoredFolders: [], leafMarkdown: [], missingNodeNotes: [] });
    expect(progress.length).toBeGreaterThan(1);
    expect(progress.every(([completed, total], index) => completed <= total && completed >= (progress[index - 1]?.[0] ?? 0)))
      .toBe(true);
    expect(progress.at(-1)?.[0]).toBe(progress.at(-1)?.[1]);
  });

  it("finds leaf notes and missing node notes without writing", async () => {
    expect(await scanMigrationAsync({
      folders: ["A", "B"], markdown: ["A/A.md", "Loose.md"],
    })).toEqual({
      conflicts: [], exemptLeafMarkdown: [], ignoredFolders: [], leafMarkdown: ["Loose.md"], missingNodeNotes: ["B"],
    });
  });

  it("does not preview an empty note when a matching leaf move completes the folder", async () => {
    expect(await scanMigrationAsync({
      folders: ["A"], markdown: ["A.md"],
    })).toEqual({
      conflicts: [], exemptLeafMarkdown: [], ignoredFolders: [], leafMarkdown: ["A.md"], missingNodeNotes: [],
    });
  });
  it("keeps exact leaf notes and ignored folder subtrees out of the write plan", async () => {
    expect(await scanMigrationAsync({
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
  it("applies protected-folder and configurable prefix rules", async () => {
    expect(await scanMigrationAsync({
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
  it("blocks collisions", async () => {
    const scan = await scanMigrationAsync({ folders: ["A"], markdown: ["A.md", "A/A.md"] });
    expect(scan.conflicts).toHaveLength(1);
    expect(scan.leafMarkdown).toEqual([]);
  });
  it("blocks a leaf-note move into an unmanaged target folder", async () => {
    const scan = await scanMigrationAsync({ folders: ["Generated"], markdown: ["Generated.md"] }, { folders: ["Generated"] });
    expect(scan.leafMarkdown).toEqual([]);
    expect(scan.conflicts).toEqual([{ path: "Generated.md", reason: "Target belongs to an unmanaged folder: Generated" }]);
  });
  it("treats one case-only name variant as canonical and blocks ambiguous variants", async () => {
    expect(await scanMigrationAsync({ folders: ["Folder"], markdown: ["Folder/folder.md"] })).toEqual({
      conflicts: [], exemptLeafMarkdown: [], ignoredFolders: [], leafMarkdown: [], missingNodeNotes: [],
    });
    const ambiguous = await scanMigrationAsync({ folders: ["Folder"], markdown: ["Folder/Folder.md", "Folder/folder.md"] });
    expect(ambiguous.conflicts[0]?.reason).toContain("Multiple canonical Node Notes");
    expect(ambiguous.leafMarkdown).toEqual([]);
    expect(ambiguous.missingNodeNotes).toEqual([]);
  });

  it("fails closed when a leaf target differs only by folder case", async () => {
    const scan = await scanMigrationAsync({ folders: ["A"], markdown: ["a.md"] });

    expect(scan.leafMarkdown).toEqual([]);
    expect(scan.missingNodeNotes).toEqual(["A"]);
    expect(scan.conflicts).toEqual([{ path: "a.md", reason: "Target folder differs only by case: A" }]);
  });

  it("blocks leaf notes that sanitize to the same planned node", async () => {
    const inventory = {
      folders: [],
      markdown: ["A B.md", "A  B.md"],
      files: ["A B.md", "A  B.md"],
    };

    const scan = await scanMigrationAsync(inventory);
    expect(scan.leafMarkdown).toEqual([]);
    expect(scan.conflicts).toHaveLength(2);
    expect(scan.conflicts.every(({ reason }) => reason.includes("same target: A B/A B.md"))).toBe(true);
  });

  it("keeps canonical notes structural even when a leaf exemption matches them", async () => {
    expect(await scanMigrationAsync(
      { folders: ["A"], markdown: ["A/A.md"] },
      { leafMarkdown: ["A/A.md"] },
    )).toEqual({
      conflicts: [], exemptLeafMarkdown: [], ignoredFolders: [], leafMarkdown: [], missingNodeNotes: [],
    });
  });
});
