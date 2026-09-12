import { setIcon } from "obsidian";
import type { NodeVisual } from "../core/types";

const CURRENT_NODE_HANDLE_CLASS = "folder-nodes-current-visual";
const CURRENT_NODE_HANDLE_WIDTH = "40px";
const CURRENT_NODE_ICON_SIZE = "20px";
const CURRENT_NODE_GLYPH_SIZE = "18px";

export function renderVisual(container: HTMLElement, visual: NodeVisual, label: string): void {
  container.empty();
  container.addClass("folder-nodes-visual");
  container.removeClass("is-emoji", "is-glyph", "is-cjk-glyph", "is-lucide", "is-image", "is-color", "is-fallback");
  container.addClass(`is-${visual.kind}`);
  if (visual.kind === "glyph" && /\p{Script=Han}/u.test(visual.value)) container.addClass("is-cjk-glyph");
  container.setAttr("aria-label", label);
  delete container.dataset.inheritedFrom;
  container.removeClass("has-accent");
  container.style.removeProperty("--folder-nodes-visual-accent");
  if (visual.inheritedFrom !== null) container.dataset.inheritedFrom = visual.inheritedFrom;
  if (visual.accent !== null) {
    container.addClass("has-accent");
    container.style.setProperty("--folder-nodes-visual-accent", visual.accent);
  }
  if (visual.kind === "image") {
    container.createEl("img", { attr: { src: visual.value, alt: "", loading: "lazy" } });
  } else if (visual.kind === "emoji") {
    container.createSpan({ cls: "folder-nodes-visual-emoji", text: visual.value });
  } else if (visual.kind === "glyph") {
    container.createSpan({ cls: "folder-nodes-visual-glyph", text: visual.value });
  } else if (visual.kind === "color") {
    const swatch = container.createSpan({ cls: "folder-nodes-visual-color" });
    swatch.style.backgroundColor = visual.value;
  } else {
    setIcon(container, visual.value);
  }
  styleCurrentNodeHandle(container);
}

function styleCurrentNodeHandle(container: HTMLElement): void {
  if (!container.classList.contains(CURRENT_NODE_HANDLE_CLASS)) return;
  const parent = container.parentElement;
  if (parent?.classList.contains("folder-nodes-current")) {
    parent.setCssStyles({ justifyContent: "flex-start", overflow: "hidden" });
  }
  container.setCssStyles({
    alignSelf: "stretch",
    background: "color-mix(in srgb, var(--background-modifier-border) 40%, var(--background-primary))",
    borderEndStartRadius: "var(--radius-s)",
    borderInlineEnd: "1px solid var(--background-modifier-border)",
    borderStartStartRadius: "var(--radius-s)",
    boxSizing: "border-box",
    flex: `0 0 ${CURRENT_NODE_HANDLE_WIDTH}`,
    height: "auto",
    marginBlock: "-3px",
    marginInlineStart: "-6px",
    overflow: "hidden",
    width: CURRENT_NODE_HANDLE_WIDTH,
  });

  const image = container.querySelector<HTMLImageElement>("img");
  if (image !== null) {
    image.setCssStyles({
      height: CURRENT_NODE_ICON_SIZE,
      maxHeight: CURRENT_NODE_ICON_SIZE,
      maxWidth: CURRENT_NODE_ICON_SIZE,
      objectFit: "contain",
      width: CURRENT_NODE_ICON_SIZE,
    });
  }
  const svg = container.querySelector<SVGElement>("svg");
  if (svg !== null) {
    svg.setCssStyles({
      height: CURRENT_NODE_ICON_SIZE,
      maxHeight: CURRENT_NODE_ICON_SIZE,
      maxWidth: CURRENT_NODE_ICON_SIZE,
      width: CURRENT_NODE_ICON_SIZE,
    });
  }
  const emoji = container.querySelector<HTMLElement>(".folder-nodes-visual-emoji");
  if (emoji !== null) emoji.setCssStyles({ fontSize: CURRENT_NODE_ICON_SIZE, lineHeight: CURRENT_NODE_ICON_SIZE });
  const glyph = container.querySelector<HTMLElement>(".folder-nodes-visual-glyph");
  if (glyph !== null) glyph.setCssStyles({ fontSize: CURRENT_NODE_GLYPH_SIZE, lineHeight: CURRENT_NODE_ICON_SIZE });
}
