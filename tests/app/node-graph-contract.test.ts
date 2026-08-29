import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string): string { return readFileSync(resolve(process.cwd(), path), "utf8"); }

describe("Node Graph integration contract", () => {
  const plugin = source("src/app/plugin.ts");
  const graphPlugin = source("src/app/node-graph-plugin.ts");
  const graphView = source("src/ui/node-graph-view.ts");

  it("refreshes through the existing coalescing refresh path", () => {
    expect(plugin).toContain("this.refreshExtensionViews(batch)");
    expect(graphPlugin).toContain("protected override refreshExtensionViews");
    expect(graphPlugin).not.toContain("override refreshVisuals");
  });

  it("extends the owned Node Contents menu without exposing it as a generic file menu", () => {
    expect(plugin).toContain("protected addOwnedNodeMenuItems");
    expect(graphPlugin).toContain("protected override addOwnedNodeMenuItems");
    expect(graphPlugin).toContain("this.addNodeGraphItem(menu, folder)");
  });

  it("opens graph nodes with Enter and performs a scaled viewport fit", () => {
    expect(graphView).toContain('node.addEventListener("keydown"');
    expect(graphView).toContain('event.key !== "Enter"');
    expect(graphView).toContain("fitNodeGraphViewport");
    expect(graphView).toContain("canvas.style.transform = `scale(${fit.scale})`");
  });
});
