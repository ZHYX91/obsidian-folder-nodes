import { describe, expect, it } from "vitest";
import { PlacementSession } from "../../src/core/placement-session";
import { gapAfter, gapBefore, isGapVisible } from "../../src/core/placement";

describe("PlacementSession", () => {
  it("accepts equivalent gaps and refuses changed anchors or same-path replacements", () => {
    const entries = new Map(["", "A", "B", "C"].map((path) => [path, { path }]));
    const session = new PlacementSession((path) => entries.get(path) ?? null);
    const source = entries.get("C")!;
    const afterA = { kind: "insert" as const, gap: gapAfter(["A", "B"], "A", "") };
    const beforeB = { kind: "insert" as const, gap: gapBefore(["A", "B"], "B", "") };
    session.start(source);
    expect(session.commit(afterA)).toBeNull();
    expect(session.preview(afterA)).toBe(true);
    expect(session.commit(beforeB)?.source).toBe(source);
    expect(session.commit({ kind: "insert", gap: gapBefore(["A", "New", "B"], "B", "") })).toBeNull();
    entries.set("B", { path: "B" });
    expect(session.commit(beforeB)).toBeNull();
    expect(session.preview(afterA)).toBe(true);
    entries.set("C", { path: "C" });
    expect(session.preview(afterA)).toBe(false);
    expect(session.commit(afterA)).toBeNull();
    session.clear();
    expect(session.preview(afterA)).toBe(false);
  });

  it("binds a move target and rejects its rename or deletion", () => {
    const source = { path: "A" };
    const parent = { path: "B" };
    const entries = new Map([["A", source], ["B", parent]]);
    const session = new PlacementSession((path) => entries.get(path) ?? null);
    const intent = { kind: "move-into" as const, parentPath: "B" };
    session.start(source);
    expect(session.preview(intent)).toBe(true);
    expect(session.commit(intent)).not.toBeNull();
    parent.path = "Renamed";
    expect(session.commit(intent)).toBeNull();
    entries.delete("B");
    expect(session.preview(intent)).toBe(false);
  });

  it("checks both neighbors of hidden gaps and allows true boundaries", () => {
    const paths = ["A", "Hidden", "B"];
    const visible = (path: string) => path !== "Hidden";
    expect(isGapVisible(gapAfter(paths, "A", ""), visible)).toBe(false);
    expect(isGapVisible(gapBefore(paths, "B", ""), visible)).toBe(false);
    expect(isGapVisible(gapBefore(paths, "A", ""), visible)).toBe(true);
    expect(isGapVisible(gapAfter(paths, "B", ""), visible)).toBe(true);
  });
});
