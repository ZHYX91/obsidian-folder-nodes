import { describe, expect, it } from "vitest";
import { compareChildren, materializeManualOrder, ORDER_GAP, planInsert, planReorder } from "../../src/core/ordering";
import type { ChildOrderRecord, ReorderPlan } from "../../src/core/types";

function rows(ranks: readonly (number | null)[]): ChildOrderRecord[] {
  return ranks.map((order, index) => ({ basename: `N${String(index + 1).padStart(3, "0")}`, childPath: `P/N${String(index + 1).padStart(3, "0")}`, order }));
}

function apply(children: readonly ChildOrderRecord[], plan: ReorderPlan): string[] {
  const patches = new Map(plan.patches.map((patch) => [patch.childPath, patch.nextOrder]));
  return children.map((child) => ({ ...child, order: patches.get(child.childPath) ?? child.order }))
    .sort(compareChildren).map(({ childPath }) => childPath);
}

function check(children: ChildOrderRecord[], path: string, index: number): ReorderPlan {
  const desired = [...children].sort(compareChildren).filter((child) => child.childPath !== path);
  desired.splice(index, 0, children.find((child) => child.childPath === path)!);
  const plan = planReorder(children, path, index);
  expect(plan.orderedPaths).toEqual(desired.map(({ childPath }) => childPath));
  expect(apply(children, plan)).toEqual(plan.orderedPaths);
  expect(plan.patches.every(({ nextOrder }) => Number.isSafeInteger(nextOrder) && nextOrder > 0)).toBe(true);
  return plan;
}

describe("ordering patch application", () => {
  it("preserves the requested order after a dense 100-child rebalance", () => {
    const children = rows(Array.from({ length: 100 }, (_, i) => i + 1));
    check(children, "P/N081", 10);
  });

  it("does not mistake missing ranks for absent neighbors", () => {
    check(rows([1024, null, null, null]), "P/N004", 2);
  });

  it("never overflows when moving to the end near the integer limit", () => {
    check(rows(Array.from({ length: 100 }, (_, i) => Number.MAX_SAFE_INTEGER - 100 + i)), "P/N001", 99);
  });

  it("assigns ranks in caller order instead of restoring obsolete ranks", () => {
    const children = rows([3, 1, 2]);
    const plan = materializeManualOrder(children);
    expect(apply(children, plan)).toEqual(children.map(({ childPath }) => childPath));
    expect(plan.patches.map(({ nextOrder }) => nextOrder)).toEqual([ORDER_GAP, ORDER_GAP * 2, ORDER_GAP * 3]);
  });

  it("does not repair missing ranks as a side effect of a no-op", () => {
    expect(check(rows([null, null]), "P/N001", 0).patches).toEqual([]);
  });

  it("assigns a rank when a new child is appended to a manual parent", () => {
    const existing = rows([1024, 2048]);
    const moved = { childPath: "P/New", basename: "New", order: null };
    const plan = planInsert(existing, moved, existing.length);
    expect(plan.orderedPaths).toEqual(["P/N001", "P/N002", "P/New"]);
    expect(plan.patches).toEqual([{ childPath: "P/New", previousOrder: null, nextOrder: 3072 }]);
  });

  it("rejects unsafe ranks, duplicate identities and invalid indices", () => {
    expect(() => planReorder(rows([Number.MAX_SAFE_INTEGER + 1]), "P/N001", 0)).toThrow("Invalid rank");
    const children = rows([1]);
    expect(() => planReorder([...children, children[0]!], "P/N001", 0)).toThrow("Duplicate child");
    expect(() => planReorder(children, "P/N001", Number.NaN)).toThrow("Invalid insertion");
  });

  it("checks final order for seeded missing, duplicate, dense and sparse distributions", () => {
    let seed = 0x5eed;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
    for (let run = 0; run < 300; run += 1) {
      const count = random() % 90 + 1;
      const children = rows(Array.from({ length: count }, (_, i) => {
        const kind = random() % 4;
        return kind === 0 ? null : kind === 1 ? random() % 5 + 1 : kind === 2 ? i + 1 : (i + 1) * ORDER_GAP;
      }));
      check(children, children[random() % count]!.childPath, random() % count);
    }
  });
});
