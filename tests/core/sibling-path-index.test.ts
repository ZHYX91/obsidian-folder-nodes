import { describe, expect, it } from "vitest";
import { SiblingPathIndex } from "../../src/core/sibling-path-index";

describe("sibling path index", () => {
  it("looks up equivalent names within the exact physical parent", () => {
    const index = new SiblingPathIndex([
      ["Café/ΟΣ", 1],
      ["Cafe\u0301/ΟΣ", 2],
      ["café/ΟΣ", 3],
      ["ΟΣ", 4],
    ]);
    expect(index.get("Café/ος")).toBe(1);
    expect(index.get("/Cafe\u0301//οσ")).toBe(2);
    expect(index.get("café\\οΣ")).toBe(3);
    expect(index.get("οσ")).toBe(4);
    expect(index.has("CAFÉ/ος")).toBe(false);
  });

  it("keeps distinct names whose full uppercase mappings collide", () => {
    const index = new SiblingPathIndex<number | undefined>();
    index.set("A/ß", 1).set("A/SS", 2).set("A/ı", 3).set("A/i", undefined);
    expect(index.get("A/ẞ")).toBe(1);
    expect(index.get("A/ss")).toBe(2);
    expect(index.get("A/ı")).toBe(3);
    expect(index.has("A/I")).toBe(true);
    expect(index.get("A/I")).toBeUndefined();
    expect(index.has("A/İ")).toBe(false);
    index.set("A/ẞ", 5);
    expect(index.get("A/ß")).toBe(5);
    expect([...index.values()]).toEqual([5, 2, 3, undefined]);
  });
});
