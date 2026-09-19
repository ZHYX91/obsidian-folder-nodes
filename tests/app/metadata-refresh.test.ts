import { describe, expect, it, vi } from "vitest";
import { folderNodesMetadataFingerprint, registerFolderNodesMetadataEvents } from "../../src/app/metadata-refresh";
import { ReferenceIndex } from "../../src/core/reference-index";
import { FakeObsidian } from "../helpers/fake-obsidian";
import type { TFile } from "obsidian";

describe("Folder Nodes metadata refresh fingerprint", () => {
  it("ignores body-only changed/resolve/resolved cycles but refreshes changed links and properties", () => {
    const fake = new FakeObsidian();
    const file = fake.addFile("A.md");
    const cache = fake.app.metadataCache;
    cache.resolvedLinks[file.path] = { "B.md": 1 };
    const references = new ReferenceIndex();
    references.rebuild(cache.resolvedLinks);
    const callbacks = new Map<string, (file: TFile) => void>();
    Object.assign(cache, { on: (name: string, callback: (file: TFile) => void) => { callbacks.set(name, callback); return {}; } });
    const refresh = vi.fn();
    registerFolderNodesMetadataEvents(cache, new Map([[file.path, folderNodesMetadataFingerprint({})]]), references, refresh);
    callbacks.get("changed")?.(file);
    callbacks.get("resolve")?.(file);
    callbacks.get("resolved")?.(file);
    expect(refresh).not.toHaveBeenCalled();
    cache.resolvedLinks[file.path] = { "C.md": 1 };
    callbacks.get("resolve")?.(file);
    expect(refresh.mock.calls).toEqual([["A.md", "reference"], ["B.md", "reference"], ["C.md", "reference"]]);
    expect(references.isReferenced("B.md")).toBe(false);
    expect(references.isReferenced("C.md")).toBe(true);
    refresh.mockClear();
    fake.frontmatters.set(file.path, { "folder-nodes": ["hidden=true"] });
    callbacks.get("changed")?.(file);
    callbacks.get("resolve")?.(file);
    callbacks.get("resolved")?.(file);
    expect(refresh.mock.calls).toEqual([["A.md", "metadata"]]);
  });
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
