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
    expect(plugin.indexOf("this.registerUnresolvedLinkDocument(this.app.workspace.rootSplit.win.document)")).toBeGreaterThan(
      plugin.indexOf("onLayoutReadyOnce(this.app.workspace"),
    );
  });

  it("invalidates delayed startup and disposes structural service on unload", () => {
    const plugin = source("src/app/plugin.ts");
    const layoutReady = source("src/app/layout-ready.ts");
    expect(plugin).toContain("generation !== this.lifecycleGeneration");
    expect(plugin).toContain("this.service?.dispose()");
    expect(plugin).toContain("onLayoutReadyOnce(this.app.workspace");
    expect(layoutReady).toContain("host.onLayoutReady(run)");
    expect(layoutReady).toContain("if (host.layoutReady) run()");
    expect(layoutReady).toContain("queueMicrotask");
    expect(layoutReady).not.toContain("setTimeout");
  });

  it("fails closed around versioned settings and flushes only compatible loaded data", () => {
    const plugin = source("src/app/plugin.ts");
    expect(plugin).toContain("loadSettingsData(stored)");
    expect(plugin).toContain("if (loaded.migration !== null)");
    expect(plugin).toContain('this.settingsLoaded && this.settingsCompatibility.status === "compatible"');
    expect(plugin).toContain("this.settingsSaver.flush(createSettingsSnapshot(this.settings))");
    expect(plugin).toContain("throw new SettingsSchemaIncompatibleError");
  });

  it("owns one authoritative versioned stylesheet per workspace document", () => {
    const plugin = source("src/app/plugin.ts");
    const settings = source("src/app/settings-tab.ts");
    const build = source("scripts/esbuild-options.mjs");
    const runtimeStyles = source("src/ui/runtime-styles.ts");
    expect(plugin).toContain('import BASE_STYLES from "../ui/styles.css"');
    expect(plugin).toContain('import NODE_GRAPH_STYLES from "../ui/node-graph.css"');
    expect(plugin).toContain("const PLUGIN_STYLES = `${BASE_STYLES}\\n${NODE_GRAPH_STYLES}`");
    expect(plugin).toContain("new RuntimeStyles(PLUGIN_STYLES)");
    expect(plugin).not.toContain("adapter.read");
    expect(plugin).toContain("runtimeStyles.install(document)");
    expect(plugin).toContain("runtimeStyles.removeAll()");
    expect(plugin).toContain('this.app.workspace.on("css-change", () => this.ensureWorkspaceStyles())');
    expect(plugin).toContain("this.ensureWorkspaceStyles()");
    expect(runtimeStyles).toContain("document.adoptedStyleSheets");
    expect(runtimeStyles).toContain("--folder-nodes-runtime-style");
    expect(runtimeStyles).not.toContain('createElement("style")');
    expect(runtimeStyles).not.toContain("setTimeout");
    expect(runtimeStyles).not.toContain("nativeStylesAreReady");
    expect(settings).toContain("ensureStyles(this.containerEl.ownerDocument)");
    expect(build).toContain('loader: { ".css": "text" }');
    expect(source("styles.css")).not.toContain(".folder-nodes-");
  });
});
