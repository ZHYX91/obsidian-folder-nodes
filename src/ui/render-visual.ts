import { setIcon } from "obsidian";
import type { NodeVisual } from "../core/types";

export function renderVisual(container: HTMLElement, visual: NodeVisual, label: string): void {
  container.empty();
  container.addClass("folder-nodes-visual");
  container.setAttr("aria-label", label);
  if (visual.inheritedFrom !== null) container.dataset.inheritedFrom = visual.inheritedFrom;
  if (visual.kind === "image") {
    container.createEl("img", { attr: { src: visual.value, alt: "", loading: "lazy" } });
  } else if (visual.kind === "emoji") {
    container.createSpan({ cls: "folder-nodes-visual-emoji", text: visual.value });
  } else if (visual.kind === "color") {
    const swatch = container.createSpan({ cls: "folder-nodes-visual-color" });
    swatch.style.backgroundColor = visual.value;
  } else {
    setIcon(container, visual.value);
  }
}
