import { layoutNodeGraph3D } from "../../src/core/node-graph-3d";
import { buildNodeGraphModel } from "../../src/core/node-graph-model";
import { NodeGraphCanvasRenderer } from "../../src/ui/node-graph-canvas-renderer";
import { checkExplorerReveal } from "./explorer-reveal.fixture";

// The browser owns layout/scrolling. Only Obsidian's DOM convenience methods
// are supplied here; the renderer, Canvas and tooltip CSS are production code.
type Options = { cls?: string; text?: string; attr?: Record<string, string> };
HTMLElement.prototype.createEl = function(this: HTMLElement, tag: string, options: Options = {}) {
  const element = this.ownerDocument.createElement(tag);
  if (options.cls) element.className = options.cls;
  if (options.text) element.textContent = options.text;
  for (const [key, value] of Object.entries(options.attr ?? {})) element.setAttribute(key, value);
  this.append(element);
  return element;
} as HTMLElement["createEl"];
HTMLElement.prototype.createDiv = function(options: Options = {}) { return this.createEl("div", options); };
HTMLElement.prototype.createSpan = function(options: Options = {}) { return this.createEl("span", options); };
HTMLElement.prototype.setText = function(text: string) { this.textContent = text; };
HTMLElement.prototype.empty = function() { this.replaceChildren(); };
HTMLElement.prototype.addClass = function(...classes: string[]) { this.classList.add(...classes); };
HTMLElement.prototype.removeClass = function(...classes: string[]) { this.classList.remove(...classes); };
HTMLElement.prototype.toggleClass = function(name: string, enabled: boolean) { this.classList.toggle(name, enabled); };
HTMLElement.prototype.setAttr = function(name: string, value: string | number | boolean | null) {
  if (value === null) this.removeAttribute(name); else this.setAttribute(name, String(value));
};
HTMLElement.prototype.setCssProps = function(properties: Record<string, string>) {
  for (const [key, value] of Object.entries(properties)) this.style.setProperty(key, value);
};
HTMLElement.prototype.setCssStyles = function(styles: Partial<CSSStyleDeclaration>) { Object.assign(this.style, styles); };

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
function assert(condition: boolean, message: string): void { if (!condition) throw new Error(message); }

async function run(): Promise<void> {
  const surface = document.body.createDiv({ cls: "surface" });
  const ids = ["One", "Two"].map((name) => `${"中文العربية/path/".repeat(180)}${name}`);
  const model = buildNodeGraphModel({ id: ids[0]!, children: [{ id: ids[1]!, children: [] }] });
  const records = new Map(ids.map((id) => [id, { path: id, label: id.slice(-3),
    visual: { kind: "color", value: "#123456", accent: null, inheritedFrom: null } as const }]));
  const renderer = new NodeGraphCanvasRenderer(surface, { model, records, points3D: layoutNodeGraph3D(model),
    layout: { direction: "left-to-right", edges: [], width: 680, height: 590, maxNodeWidth: 90, nodeHeight: 46,
      nodes: ids.map((id, index) => ({ id, depth: index, width: 90, x: 60 + index * 220, y: 260 })) } },
  "2d", false, null, { label: () => "Graph", onSelect: () => {}, onOpen: () => {}, relationSummary: () => "Structure 1" });
  renderer.restoreViewportState({ ...renderer.captureViewportState(), camera2D: { panX: 0, panY: 0, zoom: 1 } });
  const canvas = surface.querySelector("canvas")!;
  const tooltip = surface.querySelector<HTMLElement>(".folder-nodes-node-graph-canvas-tooltip")!;
  const show = async (index: number) => {
    const move = new PointerEvent("pointermove", { pointerType: "mouse" });
    Object.defineProperties(move, { offsetX: { value: 105 + index * 220 }, offsetY: { value: 283 } });
    canvas.dispatchEvent(move);
    await frame();
  };
  const hide = () => {
    tooltip.focus();
    tooltip.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    assert(tooltip.hidden === true && document.activeElement === canvas, "Escape must hide details and restore Canvas focus");
  };
  try {
    await frame();
    await show(0);
    assert(tooltip.scrollHeight > tooltip.clientHeight, `fixture must have real overflow: ${JSON.stringify({ hidden: tooltip.hidden, scroll: tooltip.scrollHeight, client: tooltip.clientHeight, text: tooltip.textContent?.slice(0, 20), surface: surface.getBoundingClientRect().toJSON() })}`);
    tooltip.scrollTop = tooltip.scrollHeight;
    assert(tooltip.scrollTop > 0, "fixture must actually scroll");
    hide();
    await show(1);
    assert(tooltip.scrollTop === 0, `hidden → new node retained scrollTop=${tooltip.scrollTop}`);
    tooltip.scrollTop = 120;
    await show(1);
    assert(tooltip.scrollTop === 120, "same-node movement must preserve the reader's scroll");
    await show(0);
    assert(tooltip.scrollTop === 0, "visible → new node must reset scroll");
    tooltip.style.whiteSpace = "pre";
    await frame();
    tooltip.scrollLeft = 150;
    assert(tooltip.scrollLeft > 0, "horizontal overflow boundary must actually scroll");
    hide();
    await show(1);
    assert(tooltip.scrollTop === 0 && tooltip.scrollLeft === 0, "reopening must reset both axes after real layout");
    surface.style.width = "500px";
    renderer.resize();
    assert(tooltip.hidden === true, "resize must dismiss details");
    await show(1);
    assert(tooltip.scrollTop === 0 && tooltip.scrollLeft === 0, "resize/reopen must start at the content origin");
    const explorer = await checkExplorerReveal();
    document.body.dataset.result = JSON.stringify({ passed: true, checks: 11, explorer, engine: navigator.userAgent });
  } finally { renderer.destroy(); surface.remove(); }
}

void run().catch((error: unknown) => {
  document.body.dataset.result = JSON.stringify({ passed: false, error: String(error) });
});
