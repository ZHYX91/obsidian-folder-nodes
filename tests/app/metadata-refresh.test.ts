import { describe, expect, it } from "vitest";
import { folderNodesMetadataFingerprint } from "../../src/app/metadata-refresh";

describe("Folder Nodes metadata refresh fingerprint", () => {
  it("ignores unrelated frontmatter and body-independent metadata", () => {
    const baseline = folderNodesMetadataFingerprint({ aliases: ["A"], tags: ["x"] });
    expect(folderNodesMetadataFingerprint({ aliases: ["B"], tags: ["y"], custom: 1 })).toBe(baseline);
  });

  it("changes for structural and visual metadata", () => {
    const baseline = folderNodesMetadataFingerprint({});
    expect(folderNodesMetadataFingerprint({ "folder-nodes": ["hidden=true"] })).not.toBe(baseline);
    expect(folderNodesMetadataFingerprint({ folderNodeChildrenSort: "manual" })).not.toBe(baseline);
    expect(folderNodesMetadataFingerprint({ folderNodeSiblingRank: 1024 })).not.toBe(baseline);
    expect(folderNodesMetadataFingerprint({ folderNodeHidden: true })).not.toBe(baseline);
    expect(folderNodesMetadataFingerprint({ icon: "folder-tree" })).not.toBe(baseline);
  });

  it("is stable across object key ordering for invalid-but-diagnostic values", () => {
    expect(folderNodesMetadataFingerprint({ icon: { b: 2, a: 1 } }))
      .toBe(folderNodesMetadataFingerprint({ icon: { a: 1, b: 2 } }));
  });
});
