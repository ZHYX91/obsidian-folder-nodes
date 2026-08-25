import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string { return readFileSync(resolve(process.cwd(), path), "utf8"); }

describe("runtime architecture contract", () => {
  it("never observes or queries the global document body for Explorer decoration", () => {
    const explorer = source("src/adapters/explorer-adapter.ts");
    expect(explorer).not.toContain("observe(document.body");
    expect(explorer).not.toContain("document.querySelectorAll");
    expect(explorer).toContain('getLeavesOfType("file-explorer")');
  });

  it("routes structural moves through the link-safe FileManager API", () => {
    const nodes = source("src/adapters/node-service.ts");
    expect(nodes).not.toContain(".vault.rename(");
    expect(nodes).toContain("fileManager.renameFile");
  });

  it("uses incremental references and a coalescing refresh scheduler", () => {
    const plugin = source("src/app/plugin.ts");
    const contents = source("src/ui/contents-view.ts");
    expect(plugin).toContain("ReferenceIndex");
    expect(plugin).toContain("RefreshScheduler");
    expect(contents).not.toContain("metadataCache.resolvedLinks");
  });

  it("captures unresolved links per Workspace document and routes direct creation through NodeService", () => {
    const plugin = source("src/app/plugin.ts");
    expect(plugin).toContain("registerUnresolvedLinkDocument");
    expect(plugin).toContain('this.app.workspace.on("window-open"');
    expect(plugin).toContain("this.service.createNodePath");
    expect(plugin).toContain("this.settings.addSelectionAlias");
    expect(plugin).not.toContain("document.body");
  });

  it("invalidates delayed startup and disposes structural service on unload", () => {
    const plugin = source("src/app/plugin.ts");
    expect(plugin).toContain("generation !== this.lifecycleGeneration");
    expect(plugin).toContain("this.service?.dispose()");
  });
});
