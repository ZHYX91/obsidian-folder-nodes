import { describe, expect, it } from "vitest";

import { bestNodeGraphSearchPaths, nodeGraphSearchResults } from "../../src/core/node-graph-search";

const candidates = [
  { label: "财务", path: "财务" },
  { label: "垃圾费", path: "财务/垃圾费" },
  { label: "财务制度", path: "工作/财务制度" },
];

describe("Node Graph search ranking", () => {
  it("prefers an exact label over descendant path matches", () => {
    expect([...bestNodeGraphSearchPaths(candidates, "财务")]).toEqual(["财务"]);
    expect(nodeGraphSearchResults(candidates, "财务").map(({ path, rank }) => [path, rank])).toEqual([
      ["财务", 0],
      ["工作/财务制度", 1],
      ["财务/垃圾费", 4],
    ]);
  });

  it("keeps all equally ranked label matches", () => {
    expect([...bestNodeGraphSearchPaths(candidates, "制度")]).toEqual(["工作/财务制度"]);
  });
});
