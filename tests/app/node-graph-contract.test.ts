import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string): string { return readFileSync(resolve(process.cwd(), path), "utf8"); }

describe("Node Graph negative architecture contracts", () => {
  const plugin = source("src/app/plugin.ts");
  const graphPlugin = source("src/app/node-graph-plugin.ts");
  const graphIndex = source("src/app/node-graph-index.ts");
  const graphView = source("src/ui/node-graph-view.ts");
  const graphStyles = source("src/ui/node-graph.css");
  const settings = source("src/app/settings-tab.ts");
  const canvasRenderer = source("src/ui/node-graph-canvas-renderer.ts");

  it("does not restore the obsolete relation selector or graph-obstructing density overlay", () => {
    expect(graphView).not.toContain('data-node-graph-switch="relation"');
    expect(graphView).not.toContain("nodeGraphDensityOverview");
    expect(graphView).not.toContain("folder-nodes-node-graph-density-notice");
    expect(graphStyles).not.toContain(".folder-nodes-node-graph-density-notice");
    expect(settings).not.toContain("defaultRelationMode");
    expect(settings).not.toContain("localDepth");
    expect(settings).not.toContain("showBoundaryNodes");
  });

  it("keeps Vault traversal and Metadata Cache link normalization outside the view", () => {
    expect(graphPlugin).toContain("NodeGraphIndex");
    expect(graphPlugin).toContain("getIndexSnapshot");
    expect(graphView).not.toContain("metadataCache.resolvedLinks");
    expect(graphView).not.toContain("nodeGraphTraversalRoots(");
    expect(graphIndex).toContain("references.targetsForSource");
    expect(graphIndex).not.toContain("metadataCache.resolvedLinks");
  });

  it("keeps one runtime stylesheet authority across base and Node Graph surfaces", () => {
    expect(plugin).toContain("`${BASE_STYLES}\\n${NODE_GRAPH_STYLES}`");
    expect(plugin).toContain("new RuntimeStyles(PLUGIN_STYLES)");
    expect(graphPlugin).not.toContain("RuntimeStyles");
    expect(graphPlugin).not.toContain("NODE_GRAPH_STYLES");
  });

  it("does not introduce global DOM observers or per-edge SVG nodes in the Canvas renderer", () => {
    expect(graphPlugin).not.toContain("MutationObserver");
    expect(graphView).not.toContain("MutationObserver");
    expect(graphView).not.toContain("document.body");
    expect(canvasRenderer).not.toContain('createSvg("line"');
    expect(canvasRenderer).not.toContain('createSvg("path"');
  });

  it("keeps narrow and coarse-pointer controls reachable without desktop-only CSS", () => {
    expect(graphStyles).toContain("@media (max-width: 480px)");
    expect(graphStyles).toContain("@media (pointer: coarse)");
    expect(graphStyles).toContain("min-width: 44px");
    expect(graphStyles).toContain("min-height: 44px");
  });

  it("continues to extend only owned Node Contents menus", () => {
    expect(plugin).toContain("protected addOwnedNodeMenuItems");
    expect(graphPlugin).toContain("protected override addOwnedNodeMenuItems");
    expect(graphPlugin).toContain("this.addNodeGraphItem(menu, folder)");
  });
});
