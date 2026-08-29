import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string): string { return readFileSync(resolve(process.cwd(), path), "utf8"); }

describe("Node Graph integration contract", () => {
  const plugin = source("src/app/plugin.ts");
  const graphPlugin = source("src/app/node-graph-plugin.ts");
  const graphView = source("src/ui/node-graph-view.ts");
  const canvasRenderer = source("src/ui/node-graph-canvas-renderer.ts");
  const polishedView = source("src/ui/node-graph-polish-view.ts");

  it("refreshes through the existing coalescing Metadata Cache and refresh path", () => {
    expect(plugin).toContain("this.refreshExtensionViews(batch)");
    expect(plugin).toContain('this.app.metadataCache.on("changed"');
    expect(plugin).toContain('this.app.metadataCache.on("resolved"');
    expect(graphPlugin).toContain("protected override refreshExtensionViews");
    expect(graphPlugin).not.toContain("override refreshVisuals");
    expect(graphView).toContain("this.app.metadataCache.resolvedLinks");
  });

  it("extends the owned Node Contents menu without exposing it as a generic file menu", () => {
    expect(plugin).toContain("protected addOwnedNodeMenuItems");
    expect(graphPlugin).toContain("protected override addOwnedNodeMenuItems");
    expect(graphPlugin).toContain("this.addNodeGraphItem(menu, folder)");
  });

  it("keeps one Workspace View for relation and dimension modes", () => {
    expect(graphView).toContain('["structure", "links", "hybrid"]');
    expect(graphView).toContain('["2d", "3d"]');
    expect(graphView).toContain("buildNodeGraphModel(tree, links)");
    expect(graphView).toContain("points3D: layoutNodeGraph3D(model)");
  });

  it("preserves Enter opening, 2D fit, and interactive 3D projection", () => {
    expect(graphView).toContain('node.addEventListener("keydown"');
    expect(graphView).toContain('event.key !== "Enter"');
    expect(graphView).toContain("fitNodeGraphViewport");
    expect(graphView).toContain("canvas.style.transform = `scale(${fit.scale})`");
    expect(graphView).toContain('surface.addEventListener("pointermove"');
    expect(graphView).toContain('surface.addEventListener("wheel"');
    expect(graphView).toContain("this.update3DProjection()");
  });

  it("switches large graphs to constant-DOM Canvas rendering with explicit teardown", () => {
    expect(graphView).toContain("shouldUseNodeGraphCanvas(data.model.nodes.length, data.model.edges.length)");
    expect(graphView).toContain("new NodeGraphCanvasRenderer");
    expect(canvasRenderer).toContain('surface.createEl("canvas"');
    expect(canvasRenderer).toContain("this.cancelFrame()");
    expect(canvasRenderer).toContain("this.unbindEvents()");
    expect(canvasRenderer).not.toContain('createSvg("line"');
    expect(polishedView).not.toContain("MutationObserver");
  });
});
