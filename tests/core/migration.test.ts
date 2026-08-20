import { describe, expect, it } from "vitest";
import { scanMigration } from "../../src/core/migration";

describe("migration scan", () => {
  it("finds leaf notes and missing node notes without writing", () => {
    expect(scanMigration({ folders: ["A", "B"], markdown: ["A/A.md", "Loose.md"] })).toEqual({ conflicts: [], leafMarkdown: ["Loose.md"], missingNodeNotes: ["B"] });
  });
  it("blocks collisions", () => {
    const scan = scanMigration({ folders: ["A"], markdown: ["A.md", "A/A.md"] });
    expect(scan.conflicts).toHaveLength(1);
    expect(scan.leafMarkdown).toEqual([]);
  });
});
