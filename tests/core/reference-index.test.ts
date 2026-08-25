import { describe, expect, it } from "vitest";

import { ReferenceIndex } from "../../src/core/reference-index";

describe("ReferenceIndex", () => {
  it("updates target counts incrementally without rescanning every source", () => {
    const index = new ReferenceIndex();
    index.rebuild({ "A.md": { "Assets/a.png": 2 }, "B.md": { "Assets/a.png": 1, "B.pdf": 1 } });
    expect(index.isReferenced("Assets/a.png")).toBe(true);
    expect(index.isReferenced("B.pdf")).toBe(true);
    index.updateSource("A.md", {});
    expect(index.isReferenced("Assets/a.png")).toBe(true);
    index.removeSource("B.md");
    expect(index.isReferenced("Assets/a.png")).toBe(false);
    expect(index.isReferenced("B.pdf")).toBe(false);
  });
});
