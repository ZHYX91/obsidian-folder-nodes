const GRAPH_SCROLL_CLASS = "folder-nodes-node-graph-scroll";
const GRAPH_STAGE_CLASS = "folder-nodes-node-graph-stage";
const GRAPH_CANVAS_CLASS = "folder-nodes-node-graph-canvas";

export function rebaseNodeGraphDomViewport(root: ParentNode): boolean {
  const canvas = root.querySelector<HTMLElement>(`.${GRAPH_STAGE_CLASS} > .${GRAPH_CANVAS_CLASS}`);
  const stage = canvas?.parentElement;
  const surface = stage?.parentElement;
  if (canvas === null || canvas === undefined || stage === null || surface === null) return false;
  if (!surface.classList.contains(GRAPH_SCROLL_CLASS)) return false;

  const left = finitePixels(canvas.style.left);
  const top = finitePixels(canvas.style.top);
  const shiftX = Math.max(0, -left);
  const shiftY = Math.max(0, -top);
  if (shiftX === 0 && shiftY === 0) return false;

  if (shiftX > 0) {
    const stageWidth = finitePixels(stage.style.width, stage.scrollWidth || surface.clientWidth);
    canvas.style.left = `${left + shiftX}px`;
    stage.style.width = `${stageWidth + shiftX}px`;
    surface.scrollLeft += shiftX;
  }
  if (shiftY > 0) {
    const stageHeight = finitePixels(stage.style.height, stage.scrollHeight || surface.clientHeight);
    canvas.style.top = `${top + shiftY}px`;
    stage.style.height = `${stageHeight + shiftY}px`;
    surface.scrollTop += shiftY;
  }
  return true;
}

export function observeNodeGraphDomViewport(root: HTMLElement): () => void {
  const ownerWindow = root.ownerDocument.defaultView;
  const Observer = ownerWindow?.MutationObserver ?? MutationObserver;
  const observer = new Observer(() => {
    rebaseNodeGraphDomViewport(root);
  });
  observer.observe(root, {
    attributes: true,
    attributeFilter: ["style"],
    childList: true,
    subtree: true,
  });
  rebaseNodeGraphDomViewport(root);
  return () => observer.disconnect();
}

function finitePixels(value: string, fallback = 0): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
