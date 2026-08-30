import { Menu } from "obsidian";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { NodeGraphIndexRecord, NodeGraphIndexSnapshot } from "../../src/core/node-graph-index-snapshot";
import type { NodeGraphSettings, NodeVisual } from "../../src/core/types";
import { DEFAULT_NODE_GRAPH_SETTINGS } from "../../src/shared/settings";
import { FolderNodeGraphView } from "../../src/ui/node-graph-view";

const FALLBACK: NodeVisual = { accent: null, inheritedFrom: null, kind: "fallback", value: "folder" };
const openViews: FolderNodeGraphView[] = [];

afterEach(async () => {
  for (const view of openViews.splice(0)) await view.onClose();
});

describe("Node Graph progressive view", () => {
  it("starts at one level with structure only and renders accessible sibling interaction zones", async () => {
    const fixture = await graphViewFixture();
    expectVisible(fixture.view, ["", "Work", "Personal"]);
    expect(fixture.view.contentEl.querySelectorAll("path.is-structure")).toHaveLength(2);
    expect(fixture.view.contentEl.querySelectorAll("path.is-link")).toHaveLength(0);
    expect(fixture.view.contentEl.querySelector(".folder-nodes-node-graph-link-summary")).toBeNull();

    const root = graphNode(fixture.view, "");
    const work = graphNode(fixture.view, "Work");
    expect(root.querySelector(".folder-nodes-node-graph-node-icon-handle svg")?.getAttribute("data-icon")).toBe("home");
    expect(work.querySelector(".folder-nodes-node-graph-node-icon-handle svg")?.getAttribute("data-icon")).toBe("folder");
    expect(work.tagName).toBe("DIV");
    expect(work.children[0]?.classList.contains("folder-nodes-node-graph-node-icon-handle")).toBe(true);
    expect(work.children[1]?.classList.contains("folder-nodes-node-graph-node-body")).toBe(true);
    expect(work.children[2]?.classList.contains("folder-nodes-node-graph-node-expand-handle")).toBe(true);
    const expand = expandHandle(fixture.view, "Work");
    expect(expand.getAttribute("aria-expanded")).toBe("false");
    expect(expand.getAttribute("aria-label")).toContain("2");
    expect(expand.getAttribute("data-tooltip")).toContain("Alt");

    expect(scopeButton(fixture.view, "subtree").disabled).toBe(true);
    expect(scopeButton(fixture.view, "local").disabled).toBe(true);
    nodeBody(fixture.view, "Work").click();
    expect(scopeButton(fixture.view, "subtree").disabled).toBe(false);
    expect(scopeButton(fixture.view, "local").disabled).toBe(false);

    nodeBody(fixture.view, "Work").dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true, ctrlKey: true, key: "Enter",
    }));
    expect(fixture.openFolderNode).toHaveBeenCalledWith("Work", true);
    nodeBody(fixture.view, "Work").dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(fixture.openFolderNode).toHaveBeenCalledWith("Work", false);
    work.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    expect(fixture.onNodeMenu).toHaveBeenCalledWith(expect.any(MouseEvent), "Work");
  });

  it("keeps siblings equal while sizing separate branches independently in 2D and 3D", async () => {
    const snapshot = nodeGraphSnapshot();
    snapshot.records.set("Work/B", record(
      "Work/B",
      "A deliberately long sibling card title",
      "Work",
      "Work/B/B.md",
    ));
    const dependencies = graphViewDependencies(snapshot);
    const view = new FolderNodeGraphView(
      { app: dependencies.app } as never,
      dependencies.service,
      dependencies.options,
    );
    openViews.push(view);
    await view.onOpen();
    expandHandle(view, "Work").click();
    expandHandle(view, "Personal").click();

    expect(graphNode(view, "").style.width).toBe("180px");
    expect(graphNode(view, "Work").style.width).toBe("144px");
    expect(graphNode(view, "Personal").style.width).toBe("144px");
    expect(graphNode(view, "Work/A").style.width).toBe("220px");
    expect(graphNode(view, "Work/B").style.width).toBe("220px");
    expect(graphNode(view, "Personal/Home").style.width).toBe("144px");

    const threeD = [...view.contentEl.querySelectorAll<HTMLButtonElement>(".folder-nodes-node-graph-switch-button")]
      .find((button) => button.textContent === "3D");
    threeD?.click();
    expect(graphNode(view, "Work/A").style.getPropertyValue("--folder-nodes-node-graph-card-width")).toBe("220px");
    expect(graphNode(view, "Personal/Home").style.getPropertyValue("--folder-nodes-node-graph-card-width")).toBe("144px");
  });

  it("keeps multiple branches open and applies Alt to the whole selected branch", async () => {
    const fixture = await graphViewFixture();
    expandHandle(fixture.view, "Work").click();
    expectVisible(fixture.view, ["", "Work", "Personal", "Work/A", "Work/B"]);
    expandHandle(fixture.view, "Personal").click();
    expectVisible(fixture.view, ["", "Work", "Personal", "Work/A", "Work/B", "Personal/Home"]);

    expandHandle(fixture.view, "Work/A").dispatchEvent(new MouseEvent("click", {
      altKey: true, bubbles: true,
    }));
    expectVisible(fixture.view, [
      "", "Work", "Personal", "Work/A", "Work/B", "Personal/Home",
      "Work/A/One", "Work/A/Two", "Work/A/One/Deep",
    ]);

    expandHandle(fixture.view, "Work/A").dispatchEvent(new MouseEvent("click", {
      altKey: true, bubbles: true,
    }));
    expectVisible(fixture.view, ["", "Work", "Personal", "Work/A", "Work/B", "Personal/Home"]);
    expect(expandHandle(fixture.view, "Work").getAttribute("aria-expanded")).toBe("true");
    expect(expandHandle(fixture.view, "Personal").getAttribute("aria-expanded")).toBe("true");
  });

  it("requests workspace persistence only for serialized graph state", async () => {
    const fixture = await graphViewFixture();
    fixture.requestSaveLayout.mockClear();
    expandHandle(fixture.view, "Work").click();
    expect(fixture.requestSaveLayout).not.toHaveBeenCalled();

    nodeBody(fixture.view, "Work").click();
    expect(fixture.requestSaveLayout).toHaveBeenCalledTimes(1);
    fixture.view.contentEl.querySelector<HTMLButtonElement>(".folder-nodes-node-graph-links-toggle")?.click();
    expect(fixture.requestSaveLayout).toHaveBeenCalledTimes(2);
    scopeButton(fixture.view, "subtree").click();
    expect(fixture.requestSaveLayout).toHaveBeenCalledTimes(3);
    const threeD = [...fixture.view.contentEl.querySelectorAll<HTMLButtonElement>(".folder-nodes-node-graph-switch-button")]
      .find((button) => button.textContent === "3D");
    threeD?.click();
    expect(fixture.requestSaveLayout).toHaveBeenCalledTimes(4);
  });

  it("keeps expansion per scope for the leaf but never serializes or restores it across leaves", async () => {
    const fixture = await graphViewFixture();
    expandHandle(fixture.view, "Work").click();
    nodeBody(fixture.view, "Work").click();
    scopeButton(fixture.view, "subtree").click();
    expectVisible(fixture.view, ["Work", "Work/A", "Work/B"]);
    expandHandle(fixture.view, "Work/A").click();
    expectVisible(fixture.view, ["Work", "Work/A", "Work/B", "Work/A/One", "Work/A/Two"]);

    fixture.view.setGraphScope({ mode: "global" });
    expectVisible(fixture.view, ["", "Work", "Personal", "Work/A", "Work/B"]);
    fixture.view.setGraphScope({ mode: "subtree", rootPath: "Work" });
    expectVisible(fixture.view, ["Work", "Work/A", "Work/B", "Work/A/One", "Work/A/Two"]);
    expect(fixture.view.getState()).not.toHaveProperty("expansion");

    const restarted = await graphViewFixture();
    await restarted.view.setState(fixture.view.getState(), {} as never);
    await restarted.view.onOpen();
    expectVisible(restarted.view, ["Work", "Work/A", "Work/B"]);
  });

  it("overlays direct links only when enabled and migrates legacy workspace relation state", async () => {
    const fixture = await graphViewFixture();
    expandHandle(fixture.view, "Work").click();
    nodeBody(fixture.view, "Work/A").click();
    scopeButton(fixture.view, "local").click();
    const toggle = fixture.view.contentEl.querySelector<HTMLButtonElement>(".folder-nodes-node-graph-links-toggle");
    expect(toggle?.getAttribute("aria-checked")).toBe("false");
    expect(fixture.view.getState().showLinks).toBe(false);
    toggle?.click();

    expect(fixture.view.getState().showLinks).toBe(true);
    expect(fixture.view.contentEl.querySelector("[data-node-path='Personal/Home']")?.classList.contains("is-boundary")).toBe(true);
    expect(fixture.view.contentEl.querySelector("[data-node-path='Work/B']")?.classList.contains("is-boundary")).toBe(true);
    expect(fixture.view.contentEl.querySelectorAll("path.is-link")).toHaveLength(3);
    expect(fixture.view.contentEl.querySelectorAll("path.is-structure")).toHaveLength(3);
    expect(fixture.view.contentEl.querySelector(".folder-nodes-node-graph-link-summary")?.textContent).toBe("3 visible links");

    fixture.view.contentEl.querySelector<HTMLButtonElement>(".folder-nodes-node-graph-links-toggle")?.click();
    expect(fixture.view.contentEl.querySelector("[data-node-path='Personal/Home']")).toBeNull();
    expect(fixture.view.contentEl.querySelector("[data-node-path='Work/B']")).toBeNull();
    expect(fixture.view.contentEl.querySelectorAll("path.is-link")).toHaveLength(0);

    const migrated = await graphViewFixture(false);
    await migrated.view.setState({ relationMode: "hybrid" }, {} as never);
    await migrated.view.onOpen();
    expect(migrated.view.getState().showLinks).toBe(true);
    expect(migrated.view.contentEl.querySelector(".folder-nodes-node-graph-links-toggle")?.getAttribute("aria-checked")).toBe("true");

    const noLinks = await graphViewFixture(false);
    noLinks.snapshot.links.clear();
    await noLinks.view.onOpen();
    noLinks.view.contentEl.querySelector<HTMLButtonElement>(".folder-nodes-node-graph-links-toggle")?.click();
    const emptySummary = noLinks.view.contentEl.querySelector(".folder-nodes-node-graph-link-summary");
    expect(emptySummary?.classList.contains("is-empty")).toBe(true);
    expect(emptySummary?.textContent).toBe("No visible links in the current scope");
  });

  it("temporarily reveals a hidden search result and restores focus and expansion on Escape", async () => {
    const fixture = await graphViewFixture();
    expandHandle(fixture.view, "Personal").click();
    nodeBody(fixture.view, "Personal").click();
    fixture.requestSaveLayout.mockClear();
    expect(graphNode(fixture.view, "Personal/Home")).not.toBeNull();
    expect(fixture.view.contentEl.querySelector("[data-node-path='Work/A/One/Deep']")).toBeNull();
    const surfaceBeforeSearch = fixture.view.contentEl.querySelector<HTMLElement>(".folder-nodes-node-graph-scroll");
    const stageBeforeSearch = fixture.view.contentEl.querySelector<HTMLElement>(".folder-nodes-node-graph-stage");
    const canvasBeforeSearch = fixture.view.contentEl.querySelector<HTMLElement>(".folder-nodes-node-graph-canvas");
    if (surfaceBeforeSearch !== null) {
      surfaceBeforeSearch.scrollLeft = 37;
      surfaceBeforeSearch.scrollTop = 29;
    }
    if (stageBeforeSearch !== null && canvasBeforeSearch !== null) {
      stageBeforeSearch.style.width = "777px";
      stageBeforeSearch.style.height = "555px";
      canvasBeforeSearch.style.left = "11px";
      canvasBeforeSearch.style.top = "13px";
      canvasBeforeSearch.style.transform = "scale(0.73)";
    }

    let search = searchInput(fixture.view);
    expect(search.closest(".folder-nodes-node-graph-search")).not.toBeNull();
    search.value = "Deep";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    expect(fixture.view.contentEl.querySelector("[data-node-path='Work/A/One/Deep']")?.classList.contains("is-search-match")).toBe(true);
    expect(fixture.requestSaveLayout).not.toHaveBeenCalled();
    search = searchInput(fixture.view);
    search.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
    expect(graphNode(fixture.view, "Work/A/One/Deep").classList.contains("is-focused")).toBe(true);
    expect(fixture.requestSaveLayout).toHaveBeenCalledTimes(1);

    search = searchInput(fixture.view);
    search.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    expect(fixture.view.contentEl.querySelector("[data-node-path='Work/A/One/Deep']")).toBeNull();
    expect(graphNode(fixture.view, "Personal/Home")).not.toBeNull();
    expect(graphNode(fixture.view, "Personal").classList.contains("is-focused")).toBe(true);
    expect(searchInput(fixture.view).value).toBe("");
    const restoredSurface = fixture.view.contentEl.querySelector<HTMLElement>(".folder-nodes-node-graph-scroll");
    const restoredStage = fixture.view.contentEl.querySelector<HTMLElement>(".folder-nodes-node-graph-stage");
    const restoredCanvas = fixture.view.contentEl.querySelector<HTMLElement>(".folder-nodes-node-graph-canvas");
    expect(restoredSurface?.scrollLeft).toBe(37);
    expect(restoredSurface?.scrollTop).toBe(29);
    expect(restoredStage?.style.width).toBe("777px");
    expect(restoredStage?.style.height).toBe("555px");
    expect(restoredCanvas?.style.left).toBe("11px");
    expect(restoredCanvas?.style.top).toBe("13px");
    expect(restoredCanvas?.style.transform).toBe("scale(0.73)");
    expect(fixture.requestSaveLayout).toHaveBeenCalledTimes(2);
  });

  it("restores the real Canvas camera after temporary search reveal", async () => {
    const settings = { ...structuredClone(DEFAULT_NODE_GRAPH_SETTINGS), largeGraphThreshold: 1 };
    const fixture = await graphViewFixture(true, settings);
    fixture.view.setFocus("Work");
    const camera = {
      camera2D: { panX: 83, panY: -41, zoom: 1.35 },
      camera3D: { panX: 17, panY: 29, pitch: 0.1, yaw: -0.2, zoom: 0.8 },
      dimension: "2d" as const,
    };
    const renderer = (fixture.view as unknown as {
      canvasRenderer: { restoreViewportState: (state: typeof camera) => void } | null;
    }).canvasRenderer;
    renderer?.restoreViewportState(camera);

    let search = searchInput(fixture.view);
    search.value = "Deep";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    expect((fixture.view as unknown as {
      canvasRenderer: { readonly focusPath: string | null } | null;
    }).canvasRenderer?.focusPath).toBe("Work");
    search = searchInput(fixture.view);
    search.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
    expect((fixture.view as unknown as {
      canvasRenderer: { readonly focusPath: string | null } | null;
    }).canvasRenderer?.focusPath).toBe("Work/A/One/Deep");
    search = searchInput(fixture.view);
    search.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));

    const restored = (fixture.view as unknown as {
      canvasRenderer: { captureViewportState: () => typeof camera } | null;
    }).canvasRenderer?.captureViewportState();
    expect(restored).toEqual(camera);
    expect((fixture.view as unknown as {
      canvasRenderer: { readonly focusPath: string | null } | null;
    }).canvasRenderer?.focusPath).toBe("Work");
  });

  it("reveals an externally focused hidden path without changing the active scope", async () => {
    const fixture = await graphViewFixture();
    fixture.view.setFocus("Work/A/One/Deep");
    expect(graphNode(fixture.view, "Work/A/One/Deep").classList.contains("is-focused")).toBe(true);
    expect(fixture.view.getState().scope).toEqual({ mode: "global" });
  });

  it("remaps persisted leaf paths on folder rename and prunes them on delete", async () => {
    const fixture = await graphViewFixture();
    fixture.view.setGraphScope({ mode: "local", rootPath: "Work/A" });
    fixture.view.setFocus("Work/A/One");

    fixture.view.remapPathState("Work", "Projects");
    expect(fixture.view.getState()).toMatchObject({
      focus: "Projects/A/One",
      scope: { mode: "local", rootPath: "Projects/A" },
    });

    fixture.view.removePathState("Projects");
    expect(fixture.view.getState()).toMatchObject({ focus: null, scope: { mode: "global" } });
  });

  it("falls back from stale persisted scope and focus during cold start", async () => {
    const fixture = await graphViewFixture(false);
    await fixture.view.setState({
      focus: "Removed/Child",
      scope: { mode: "subtree", rootPath: "Removed" },
    }, {} as never);
    await fixture.view.onOpen();
    expect(fixture.view.getState()).toMatchObject({ focus: null, scope: { mode: "global" } });
    expectVisible(fixture.view, ["", "Work", "Personal"]);
  });

  it("reveals a valid persisted deep focus without serializing transient expansion", async () => {
    const fixture = await graphViewFixture(false);
    await fixture.view.setState({ focus: "Work/A/One/Deep", scope: { mode: "global" } }, {} as never);
    await fixture.view.onOpen();
    expect(graphNode(fixture.view, "Work/A/One/Deep").classList.contains("is-focused")).toBe(true);
    expect(fixture.view.getState()).not.toHaveProperty("expansion");
  });

  it("offers exact range counts and keeps local expansion inside the selected subtree", async () => {
    const fixture = await graphViewFixture();
    fixture.view.setFocus("Work/A");
    fixture.view.setGraphScope({ mode: "local", rootPath: "Work/A" });
    expectVisible(fixture.view, ["Work", "Work/A", "Work/A/One", "Work/A/Two"]);
    expect(graphNode(fixture.view, "Work").querySelector(".folder-nodes-node-graph-node-expand-handle")).toBeNull();
    expect(fixture.view.contentEl.querySelector("[data-node-path='Work/B']")).toBeNull();

    fixture.view.contentEl.querySelector<HTMLButtonElement>(".folder-nodes-node-graph-range-button")?.click();
    const menu = lastMenu();
    expect(menu.items.map(({ title }) => title)).toEqual([
      "Expand next level",
      "Expand 2 levels",
      "Expand 3 levels",
      "Expand the entire local scope (5 nodes)",
      "Collapse to level 1",
    ]);
    menu.items[3]?.click?.();
    expectVisible(fixture.view, ["Work", "Work/A", "Work/A/One", "Work/A/Two", "Work/A/One/Deep"]);
    expect(fixture.view.contentEl.querySelector("[data-node-path='Work/B']")).toBeNull();

    fixture.view.contentEl.querySelector<HTMLButtonElement>(".folder-nodes-node-graph-range-button")?.click();
    lastMenu().items[4]?.click?.();
    expectVisible(fixture.view, ["Work", "Work/A", "Work/A/One", "Work/A/Two"]);
  });

  it("does not leak temporary search expansion into a scope session", async () => {
    const fixture = await graphViewFixture();
    let search = searchInput(fixture.view);
    search.value = "Deep";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    expect(graphNode(fixture.view, "Work/A/One/Deep")).not.toBeNull();

    fixture.view.setGraphScope({ mode: "subtree", rootPath: "Personal" });
    fixture.view.setGraphScope({ mode: "global" });
    expect(fixture.view.contentEl.querySelector("[data-node-path='Work/A/One/Deep']")).toBeNull();
    expectVisible(fixture.view, ["", "Work", "Personal"]);
  });

  it("keeps the default DOM threshold boundary readable instead of shrinking cards to dots", async () => {
    const records = new Map<string, NodeGraphIndexRecord>();
    records.set("", record("", "Threshold Vault", null, "Threshold Vault.md"));
    for (let index = 0; index < 499; index += 1) {
      const path = `N${String(index).padStart(3, "0")}`;
      records.set(path, record(path, path, "", `${path}/${path}.md`));
    }
    const snapshot: MutableNodeGraphIndexSnapshot = { links: new Map(), records, revision: 1 };
    const dependencies = graphViewDependencies(snapshot);
    const view = new FolderNodeGraphView({ app: dependencies.app } as never, dependencies.service, dependencies.options);
    openViews.push(view);
    await view.onOpen();
    expect(view.contentEl.querySelector("canvas")).toBeNull();

    const surface = view.contentEl.querySelector<HTMLElement>(".folder-nodes-node-graph-scroll");
    Object.defineProperties(surface, {
      clientHeight: { configurable: true, value: 600 },
      clientWidth: { configurable: true, value: 1_000 },
      scrollTo: { configurable: true, value: vi.fn() },
    });
    view.contentEl.querySelector<HTMLButtonElement>("[data-node-graph-action='fit']")?.click();

    const canvas = view.contentEl.querySelector<HTMLElement>(".folder-nodes-node-graph-canvas");
    const stage = view.contentEl.querySelector<HTMLElement>(".folder-nodes-node-graph-stage");
    expect(canvas?.style.transform).toBe("scale(0.65)");
    expect(Number.parseFloat(stage?.style.height ?? "0")).toBeGreaterThan(600);
  });

  it("does not expose a no-op local parent toggle when the scene uses Canvas", async () => {
    const settings = { ...structuredClone(DEFAULT_NODE_GRAPH_SETTINGS), largeGraphThreshold: 1 };
    const fixture = await graphViewFixture(true, settings);
    fixture.view.setFocus("Work/A");
    fixture.view.setGraphScope({ mode: "local", rootPath: "Work/A" });
    const renderer = (fixture.view as unknown as {
      canvasRenderer: { data: { records: ReadonlyMap<string, { readonly childCount?: number }> } } | null;
    }).canvasRenderer;
    expect(renderer).not.toBeNull();
    expect(renderer?.data.records.get("Work")?.childCount).toBe(0);
  });

  it("keeps 2D fit, top-to-bottom layout, 3D projection, and disabled short-circuit behavior", async () => {
    const settings = structuredClone(DEFAULT_NODE_GRAPH_SETTINGS);
    const fixture = await graphViewFixture(true, settings);
    const surface = fixture.view.contentEl.querySelector<HTMLElement>(".folder-nodes-node-graph-scroll");
    Object.defineProperties(surface, {
      clientHeight: { configurable: true, value: 100 },
      clientWidth: { configurable: true, value: 100 },
      scrollTo: { configurable: true, value: vi.fn() },
    });
    fixture.view.contentEl.querySelector<HTMLButtonElement>("[data-node-graph-action='fit']")?.click();
    expect(surface?.scrollTo).toHaveBeenCalledWith({
      behavior: "smooth",
      left: expect.any(Number),
      top: expect.any(Number),
    });

    settings.layoutDirection = "top-to-bottom";
    fixture.view.refresh();
    await new Promise((resolve) => window.setTimeout(resolve, 60));
    const root = graphNode(fixture.view, "");
    const work = graphNode(fixture.view, "Work");
    expect(Number.parseFloat(root.style.top)).toBeLessThan(Number.parseFloat(work.style.top));
    const twoDData = (fixture.view as unknown as {
      displayGraphData: { layout: { nodes: readonly unknown[] }; points3D: readonly unknown[] } | null;
    }).displayGraphData;
    expect(twoDData?.layout.nodes.length).toBeGreaterThan(0);
    expect(twoDData?.points3D).toHaveLength(0);

    const threeD = [...fixture.view.contentEl.querySelectorAll<HTMLButtonElement>(".folder-nodes-node-graph-switch-button")]
      .find((button) => button.textContent === "3D");
    fixture.view.contentEl.querySelector<HTMLButtonElement>(".folder-nodes-node-graph-switch-button")?.click();
    expect(fixture.view.contentEl.classList.contains("is-3d")).toBe(false);
    threeD?.click();
    expect(fixture.view.contentEl.classList.contains("is-3d")).toBe(true);
    expect(graphNode(fixture.view, "Work").style.transform).toContain("translate(-50%, -50%) scale(");
    const threeDData = (fixture.view as unknown as {
      displayGraphData: { layout: { nodes: readonly unknown[] }; points3D: readonly unknown[] } | null;
    }).displayGraphData;
    expect(threeDData?.layout.nodes).toHaveLength(0);
    expect(threeDData?.points3D.length).toBeGreaterThan(0);

    const disabledSettings = { ...structuredClone(DEFAULT_NODE_GRAPH_SETTINGS), enabled: false };
    const disabled = await graphViewFixture(false, disabledSettings);
    await disabled.view.onOpen();
    expect(disabled.getIndexSnapshot).not.toHaveBeenCalled();
    expect(disabled.view.contentEl.querySelector(".folder-nodes-node-graph-disabled")?.getAttribute("role")).toBe("status");
    expect(disabled.view.contentEl.querySelector(".folder-nodes-node-graph-toolbar")).toBeNull();
  });

  it("releases large transient graph and search state on close", async () => {
    const fixture = await graphViewFixture();
    fixture.view.contentEl.querySelector<HTMLButtonElement>(".folder-nodes-node-graph-range-button")?.click();
    lastMenu().items[3]?.click?.();
    const search = searchInput(fixture.view);
    search.value = "Deep";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    await fixture.view.onClose();

    const internals = fixture.view as unknown as {
      currentExpansion: { readonly expandedIds: ReadonlySet<string> };
      expansionSession: { readonly scopes: ReadonlyMap<string, unknown> };
      searchQuery: string;
      searchResultsCache: unknown;
      searchSnapshot: unknown;
    };
    expect(internals.currentExpansion.expandedIds.size).toBe(0);
    expect(internals.expansionSession.scopes.size).toBe(0);
    expect(internals.searchQuery).toBe("");
    expect(internals.searchResultsCache).toBeNull();
    expect(internals.searchSnapshot).toBeNull();
    expect(fixture.view.contentEl.childElementCount).toBe(0);
  });
});

interface MutableNodeGraphIndexSnapshot extends NodeGraphIndexSnapshot {
  readonly links: Map<string, Set<string>>;
  readonly records: Map<string, NodeGraphIndexRecord>;
}

function nodeGraphSnapshot(): MutableNodeGraphIndexSnapshot {
  const records = [
    record("", "Test Vault", null, "Test Vault.md"),
    record("Work", "Work", "", "Work/Work.md"),
    record("Work/A", "A", "Work", "Work/A/A.md"),
    record("Work/A/One", "One", "Work/A", "Work/A/One/One.md"),
    record("Work/A/One/Deep", "Deep", "Work/A/One", "Work/A/One/Deep/Deep.md"),
    record("Work/A/Two", "Two", "Work/A", "Work/A/Two/Two.md"),
    record("Work/B", "B", "Work", "Work/B/B.md"),
    record("Personal", "Personal", "", "Personal/Personal.md"),
    record("Personal/Home", "Home", "Personal", "Personal/Home/Home.md"),
  ];
  return {
    links: new Map([
      ["Work", new Set(["Personal/Home"])],
      ["Work/A", new Set(["Personal/Home"])],
      ["Work/A/One", new Set(["Work/B"])],
    ]),
    records: new Map(records.map((value) => [value.path, value])),
    revision: 1,
  };
}

function graphViewDependencies(snapshot = nodeGraphSnapshot(), settings = structuredClone(DEFAULT_NODE_GRAPH_SETTINGS)) {
  const openFolderNode = vi.fn(async () => undefined);
  const onNodeMenu = vi.fn();
  const getIndexSnapshot = vi.fn(() => snapshot);
  const requestSaveLayout = vi.fn();
  const app = { vault: { getName: () => "Test Vault" }, workspace: { requestSaveLayout } };
  const service = { openFolderNode };
  const options = { getIndexSnapshot, getSettings: () => settings, onNodeMenu };
  return { app, getIndexSnapshot, onNodeMenu, openFolderNode, options, requestSaveLayout, service, settings, snapshot };
}

async function graphViewFixture(open = true, settings: NodeGraphSettings = structuredClone(DEFAULT_NODE_GRAPH_SETTINGS)) {
  const dependencies = graphViewDependencies(nodeGraphSnapshot(), settings);
  const view = new FolderNodeGraphView({ app: dependencies.app } as never, dependencies.service, dependencies.options);
  openViews.push(view);
  if (open) await view.onOpen();
  return { ...dependencies, view };
}

function record(path: string, label: string, parentPath: string | null, notePath: string): NodeGraphIndexRecord {
  return { label, notePath, parentPath, path, visual: FALLBACK };
}

function graphNode(view: FolderNodeGraphView, path: string): HTMLElement {
  const node = view.contentEl.querySelector<HTMLElement>(`[data-node-path='${path}']`);
  if (node === null) throw new Error(`Missing graph node: ${path}`);
  return node;
}

function nodeBody(view: FolderNodeGraphView, path: string): HTMLButtonElement {
  const body = graphNode(view, path).querySelector<HTMLButtonElement>(".folder-nodes-node-graph-node-body");
  if (body === null) throw new Error(`Missing graph node body: ${path}`);
  return body;
}

function expandHandle(view: FolderNodeGraphView, path: string): HTMLButtonElement {
  const handle = graphNode(view, path).querySelector<HTMLButtonElement>(".folder-nodes-node-graph-node-expand-handle");
  if (handle === null) throw new Error(`Missing graph expand handle: ${path}`);
  return handle;
}

function scopeButton(view: FolderNodeGraphView, action: "local" | "subtree"): HTMLButtonElement {
  const button = view.contentEl.querySelector<HTMLButtonElement>(`[data-node-graph-scope-action='${action}']`);
  if (button === null) throw new Error(`Missing graph scope button: ${action}`);
  return button;
}

function searchInput(view: FolderNodeGraphView): HTMLInputElement {
  const input = view.contentEl.querySelector<HTMLInputElement>(".folder-nodes-node-graph-search input");
  if (input === null) throw new Error("Missing native Node Graph search input");
  return input;
}

function visiblePaths(view: FolderNodeGraphView): string[] {
  return [...view.contentEl.querySelectorAll<HTMLElement>(".folder-nodes-node-graph-node")]
    .map(({ dataset }) => dataset.nodePath ?? "missing");
}

function expectVisible(view: FolderNodeGraphView, paths: readonly string[]): void {
  expect(new Set(visiblePaths(view))).toEqual(new Set(paths));
}

interface MockMenu {
  readonly items: Array<{ readonly click: (() => void) | null; readonly title: string }>;
}

function lastMenu(): MockMenu {
  const menu = (Menu as unknown as { lastCreated: MockMenu | null }).lastCreated;
  if (menu === null) throw new Error("Expected a Node Graph range menu");
  return menu;
}
