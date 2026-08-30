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
