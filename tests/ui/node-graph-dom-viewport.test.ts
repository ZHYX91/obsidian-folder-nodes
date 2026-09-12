import { describe, expect, it } from "vitest";
import { rebaseNodeGraphDomViewport } from "../../src/ui/node-graph-dom-viewport";

function viewportFixture(): {
  readonly root: HTMLElement;
  readonly surface: HTMLElement;
  readonly stage: HTMLElement;
  readonly canvas: HTMLElement;
} {
  const root = document.createElement("div");
  const surface = document.createElement("div");
  surface.className = "folder-nodes-node-graph-scroll";
  const stage = document.createElement("div");
  stage.className = "folder-nodes-node-graph-stage";
  const canvas = document.createElement("div");
  canvas.className = "folder-nodes-node-graph-canvas";
  root.append(surface);
  surface.append(stage);
  stage.append(canvas);
  return { root, surface, stage, canvas };
}

describe("DOM Node Graph viewport rebasing", () => {
  it("moves negative canvas origins into scrollable stage space without moving the screen anchor", () => {
    const { root, surface, stage, canvas } = viewportFixture();
    stage.style.width = "800px";
    stage.style.height = "600px";
    canvas.style.left = "-48px";
    canvas.style.top = "-72px";
    surface.scrollLeft = 20;
    surface.scrollTop = 30;

    expect(rebaseNodeGraphDomViewport(root)).toBe(true);
    expect(canvas.style.left).toBe("0px");
    expect(canvas.style.top).toBe("0px");
    expect(stage.style.width).toBe("848px");
    expect(stage.style.height).toBe("672px");
    expect(surface.scrollLeft).toBe(68);
    expect(surface.scrollTop).toBe(102);
    expect(rebaseNodeGraphDomViewport(root)).toBe(false);
  });

  it("leaves already-scrollable positive origins unchanged", () => {
    const { root, surface, stage, canvas } = viewportFixture();
    stage.style.width = "800px";
    stage.style.height = "600px";
    canvas.style.left = "24px";
    canvas.style.top = "32px";
    surface.scrollLeft = 12;
    surface.scrollTop = 16;

    expect(rebaseNodeGraphDomViewport(root)).toBe(false);
    expect(canvas.style.left).toBe("24px");
    expect(canvas.style.top).toBe("32px");
    expect(stage.style.width).toBe("800px");
    expect(stage.style.height).toBe("600px");
    expect(surface.scrollLeft).toBe(12);
    expect(surface.scrollTop).toBe(16);
  });

  it("preserves the anchor when CSS stretches a small stage to the viewport", () => {
    const { root, surface, stage, canvas } = viewportFixture();
    stage.style.width = "300px";
    stage.style.height = "300px";
    canvas.style.left = "-48px";
    canvas.style.top = "-72px";
    let scrollLeft = 0;
    let scrollTop = 0;
    Object.defineProperties(surface, {
      clientWidth: { value: 800 },
      clientHeight: { value: 600 },
      scrollLeft: {
        get: () => scrollLeft,
        set: (value: number) => { scrollLeft = Math.max(0, Math.min(value, stage.offsetWidth - 800)); },
      },
      scrollTop: {
        get: () => scrollTop,
        set: (value: number) => { scrollTop = Math.max(0, Math.min(value, stage.offsetHeight - 600)); },
      },
    });
    Object.defineProperties(stage, {
      offsetWidth: { get: () => Math.max(800, Number.parseFloat(stage.style.width)) },
      offsetHeight: { get: () => Math.max(600, Number.parseFloat(stage.style.height)) },
    });

    expect(rebaseNodeGraphDomViewport(root)).toBe(true);
    expect(Number.parseFloat(canvas.style.left) - surface.scrollLeft).toBe(-48);
    expect(Number.parseFloat(canvas.style.top) - surface.scrollTop).toBe(-72);
    expect(rebaseNodeGraphDomViewport(root)).toBe(false);
  });
});
