import { describe, expect, it } from "vitest";

import { ReferenceIndex } from "../../src/core/reference-index";

describe("ReferenceIndex", () => {
  it("updates target counts incrementally without rescanning every source", () => {
    const index = new ReferenceIndex();
    index.rebuild({ "A.md": { "Assets/a.png": 2 }, "B.md": { "Assets/a.png": 1, "B.pdf": 1 } });
    expect(index.targetsForSource("A.md")).toEqual(["Assets/a.png"]);
    expect(index.targetsForSource("B.md")).toEqual(["Assets/a.png", "B.pdf"]);
    expect(index.isReferenced("Assets/a.png")).toBe(true);
    expect(index.isReferenced("B.pdf")).toBe(true);
    index.updateSource("A.md", {});
    expect(index.targetsForSource("A.md")).toEqual([]);
    expect(index.isReferenced("Assets/a.png")).toBe(true);
    index.removeSource("B.md");
    expect(index.isReferenced("Assets/a.png")).toBe(false);
    expect(index.isReferenced("B.pdf")).toBe(false);
  });

  it("updates multiplicities without dropping other sources or reporting unchanged targets", () => {
    const index = new ReferenceIndex();
    index.rebuild({ "A.md": { "Shared.md": 3, "Keep.md": 1 }, "B.md": { "Shared.md": 1 } });
    expect(index.updateSource("A.md", { "Keep.md": 1, "Shared.md": 2 })).toEqual(new Set(["Shared.md"]));
    expect(index.sourcesForTarget("Shared.md")).toEqual(["A.md", "B.md"]);
    expect(index.updateSource("A.md", { "Shared.md": 2, "Keep.md": 1 }).size).toBe(0);
    index.removeSource("A.md");
    expect(index.isReferenced("Shared.md")).toBe(true);
    index.removeSource("B.md");
    expect(index.isReferenced("Shared.md")).toBe(false);
  });

  it("clears descendant contributions on a folder-only delete", () => {
    const index = new ReferenceIndex();
    index.rebuild({ "Projects/deep/note.md": { "diagram.png": 1 }, "Projects-old/note.md": { "keep.png": 1 } });
    expect(index.removeSource("Projects", true)).toEqual(new Set(["diagram.png"]));
    expect(index.isReferenced("diagram.png")).toBe(false);
    expect(index.isReferenced("keep.png")).toBe(true);
  });

  it("drops references for a whole folder and resolves moved sources at their exact new paths", () => {
    const index = new ReferenceIndex();
    index.rebuild({
      "Old/a.md": { "stale.png": 1 }, "Old/nested/b.md": { "shared.png": 2 },
      "Oldish/c.md": { "shared.png": 1 },
    });
    const resolved = { "New/a.md": { "updated.png": 1 } };
    const affected = index.moveSources("Old", "New", true, resolved);
    expect(affected).toEqual(new Set(["stale.png", "updated.png", "shared.png"]));
    expect(index.sourcesForTarget("stale.png")).toEqual([]);
    expect(index.sourcesForTarget("shared.png")).toEqual(["Oldish/c.md"]);
    expect(index.sourcesForTarget("updated.png")).toEqual(["New/a.md"]);
    // A file-level event and late metadata can follow the folder notification.
    index.moveSources("Old/a.md", "New/a.md", false, resolved);
    index.updateSource("New/nested/b.md", { "shared.png": 2 });
    expect(index.removeSource("New", true)).toEqual(new Set(["updated.png", "shared.png"]));
    expect(index.isReferenced("updated.png")).toBe(false);
    expect(index.sourcesForTarget("shared.png")).toEqual(["Oldish/c.md"]);
  });

  it("tracks inbound source paths incrementally", () => {
    const index = new ReferenceIndex();
    index.rebuild({
      "A/A.md": { "B/B.md": 1 },
      "C/C.md": { "B/B.md": 2 },
    });
    expect([...index.sourcesForTarget("B/B.md")].sort()).toEqual(["A/A.md", "C/C.md"]);

    index.updateSource("A/A.md", { "D/D.md": 1 });
    expect(index.sourcesForTarget("B/B.md")).toEqual(["C/C.md"]);
    expect(index.sourcesForTarget("D/D.md")).toEqual(["A/A.md"]);
    index.removeSource("C/C.md");
    expect(index.sourcesForTarget("B/B.md")).toEqual([]);
  });
});
