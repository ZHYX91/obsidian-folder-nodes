import { describe, expect, it } from "vitest";

import {
  createNodeGraphTopology,
  nodeGraphTopologyDescendants,
} from "../../src/core/node-graph-topology";

describe("Node Graph topology snapshots", () => {
  it("preserves caller-owned child order and normalizes reciprocal links once", () => {
    const topology = createNodeGraphTopology(
      [
        { id: "/", parentId: null },
        { id: "Work", parentId: "" },
        { id: "Personal", parentId: "" },
        { id: "Work/B", parentId: "Work" },
        { id: "Work/A", parentId: "Work" },
      ],
      new Map([
        ["Work/A", new Set(["Personal", "missing", "Work/A"])],
        ["Personal", new Set(["Work/A"])],
      ]),
    );

    expect(topology.roots).toEqual([""]);
    expect(topology.nodes.get("")?.children).toEqual(["Work", "Personal"]);
    expect(topology.nodes.get("Work")?.children).toEqual(["Work/B", "Work/A"]);
    expect(topology.links.get("Personal")).toEqual(new Set(["Work/A"]));
    expect(topology.links.get("Work/A")).toEqual(new Set(["Personal"]));
    expect(topology.stats).toEqual({ scannedLinkTargets: 4, scannedNodes: 5 });
    expect(nodeGraphTopologyDescendants(topology, "Work")).toEqual(["Work", "Work/B", "Work/A"]);
  });

  it("allows a scoped root whose parent is outside the snapshot and rejects cycles", () => {
    const scoped = createNodeGraphTopology([
      { id: "Work/A", parentId: "Work" },
      { id: "Work/A/One", parentId: "Work/A" },
    ]);
    expect(scoped.roots).toEqual(["Work/A"]);

    expect(() => createNodeGraphTopology([
      { id: "A", parentId: "B" },
      { id: "B", parentId: "A" },
    ])).toThrow("parent cycle");
    expect(() => createNodeGraphTopology([
      { id: "A", parentId: null },
      { id: "/A/", parentId: null },
    ])).toThrow("Duplicate Node Graph topology id");
  });
});
