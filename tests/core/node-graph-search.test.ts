import { describe, expect, it } from "vitest";

import { summarizeNodeGraphSearch } from "../../src/core/node-graph-search";

const candidates = [
  { label: "财务", path: "财务" },
  { label: "垃圾费", path: "财务/垃圾费" },
  { label: "财务制度", path: "工作/财务制度" },
];

describe("Node Graph search ranking", () => {
  it("prefers an exact label over descendant path matches", () => {
    const summary = summarizeNodeGraphSearch(candidates, "财务");
    expect([...summary.bestPaths]).toEqual(["财务"]);
    expect(summary.first).toMatchObject({ path: "财务", rank: 0 });
  });

  it("keeps all equally ranked label matches", () => {
    expect([...summarizeNodeGraphSearch(candidates, "制度").bestPaths]).toEqual(["工作/财务制度"]);
  });

  it("summarizes the first and best matches in one linear pass", () => {
    const summary = summarizeNodeGraphSearch(candidates, "制度");
    expect(summary.first?.path).toBe("工作/财务制度");
    expect([...summary.bestPaths]).toEqual(["工作/财务制度"]);
  });
});
