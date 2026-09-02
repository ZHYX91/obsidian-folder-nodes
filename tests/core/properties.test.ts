import { describe, expect, it } from "vitest";

import {
  canonicalFolderNodesEntries,
  FOLDER_NODES_PROPERTY,
  folderNodesPropertyWriteIsSafe,
  LEGACY_CHILDREN_SORT_PROPERTY,
  LEGACY_HIDDEN_PROPERTY,
  LEGACY_SIBLING_RANK_PROPERTY,
  resolveFolderNodesProperties,
} from "../../src/core/properties";

describe("Folder Nodes property contract", () => {
  it("uses one concise public list while retaining the published legacy names", () => {
    expect(FOLDER_NODES_PROPERTY).toBe("folder-nodes");
    expect(LEGACY_CHILDREN_SORT_PROPERTY).toBe("folderNodeChildrenSort");
    expect(LEGACY_SIBLING_RANK_PROPERTY).toBe("folderNodeSiblingRank");
    expect(LEGACY_HIDDEN_PROPERTY).toBe("folderNodeHidden");
    expect(canonicalFolderNodesEntries({ order: "manual", rank: 1024, hidden: true })).toEqual([
      "order=manual", "rank=1024", "hidden=true",
    ]);
    expect(canonicalFolderNodesEntries({ order: null, rank: null, hidden: false })).toEqual([]);
  });

  it("resolves canonical and legacy-only values", () => {
    expect(resolveFolderNodesProperties({
      "folder-nodes": ["order=manual", "rank=1024", "hidden=true", "future=value"],
    })).toMatchObject({
      order: "manual", rank: 1024, hidden: true, unknownEntries: ["future=value"], issues: [],
    });
    expect(resolveFolderNodesProperties({
      folderNodeChildrenSort: "manual", folderNodeSiblingRank: 2048, folderNodeHidden: true,
    })).toMatchObject({
      order: "manual",
      rank: 2048,
      hidden: true,
      legacyKeysPresent: [LEGACY_CHILDREN_SORT_PROPERTY, LEGACY_SIBLING_RANK_PROPERTY, LEGACY_HIDDEN_PROPERTY],
    });
  });

  it("accepts equivalent dual values and fails closed on conflicts", () => {
    const equivalent = resolveFolderNodesProperties({
      "folder-nodes": ["order=manual", "rank=1024", "hidden=true"],
      folderNodeChildrenSort: "manual", folderNodeSiblingRank: 1024, folderNodeHidden: true,
    });
    expect(equivalent.issues).toEqual([]);
    expect(equivalent.redundantLegacyKeys).toHaveLength(3);

    const conflict = resolveFolderNodesProperties({
      "folder-nodes": ["rank=1024", "hidden=true"],
      folderNodeSiblingRank: 2048,
      folderNodeHidden: false,
    });
    expect(conflict.rank).toBeNull();
    expect(conflict.hidden).toBe(false);
    expect(conflict.issues.map(({ code, field }) => ({ code, field }))).toEqual([
      { code: "conflict", field: "rank" },
      { code: "conflict", field: "hidden" },
    ]);
    expect(folderNodesPropertyWriteIsSafe(conflict, "rank")).toBe(false);
    expect(folderNodesPropertyWriteIsSafe(conflict, "order")).toBe(true);
  });

  it("rejects malformed, duplicate, and invalid known tokens without discarding unknown tokens", () => {
    const result = resolveFolderNodesProperties({
      "folder-nodes": ["rank=0", "hidden=false", "order=manual", "order=manual", "future=yes", 7],
    });
    expect(result.order).toBeNull();
    expect(result.rank).toBeNull();
    expect(result.hidden).toBe(false);
    expect(result.unknownEntries).toEqual(["future=yes"]);
    expect(result.issues.map(({ code }) => code)).toEqual([
      "invalid-value", "invalid-value", "duplicate-key", "malformed-token",
    ]);
  });
});
