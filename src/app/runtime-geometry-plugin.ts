import FolderNodesWithNodeGraphPlugin from "./node-graph-plugin";
import { FolderNodeGraphView, NODE_GRAPH_VIEW_TYPE } from "../ui/node-graph-view";
import { observeNodeGraphDomViewport } from "../ui/node-graph-dom-viewport";

export default class FolderNodesRuntimeGeometryPlugin extends FolderNodesWithNodeGraphPlugin {
  private readonly nodeGraphViewportObservers = new Map<FolderNodeGraphView, () => void>();

  public override async onload(): Promise<void> {
    await super.onload();
    this.syncNodeGraphViewportObservers();
    this.registerEvent(this.app.workspace.on("layout-change", () => this.syncNodeGraphViewportObservers()));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.syncNodeGraphViewportObservers()));
    this.register(() => this.disconnectNodeGraphViewportObservers());
  }

  private syncNodeGraphViewportObservers(): void {
    const liveViews = new Set<FolderNodeGraphView>();
    for (const leaf of this.app.workspace.getLeavesOfType(NODE_GRAPH_VIEW_TYPE)) {
      if (!(leaf.view instanceof FolderNodeGraphView)) continue;
      const view = leaf.view;
      liveViews.add(view);
      if (!this.nodeGraphViewportObservers.has(view)) {
        this.nodeGraphViewportObservers.set(view, observeNodeGraphDomViewport(view.contentEl));
      }
    }
    for (const [view, disconnect] of this.nodeGraphViewportObservers) {
      if (liveViews.has(view)) continue;
      disconnect();
      this.nodeGraphViewportObservers.delete(view);
    }
  }

  private disconnectNodeGraphViewportObservers(): void {
    for (const disconnect of this.nodeGraphViewportObservers.values()) disconnect();
    this.nodeGraphViewportObservers.clear();
  }
}
