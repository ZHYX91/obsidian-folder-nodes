import type { Workspace } from "obsidian";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function refreshRibbonLabel(workspace: Workspace, button: HTMLElement | null, label: string): void {
  if (button === null) return;
  button.setAttribute("aria-label", label);
  button.setAttribute("title", label);

  // Obsidian's mobile menu reads the ribbon item's title, not the button tooltip.
  // Match only our registered button; retain the host ID, order and visibility.
  const ribbon: unknown = Reflect.get(workspace, "leftRibbon");
  if (!isRecord(ribbon) || !Array.isArray(ribbon.items)) return;
  const items: unknown[] = ribbon.items;
  for (const item of items) {
    if (isRecord(item) && item.buttonEl === button && typeof item.title === "string") {
      item.title = label;
      return;
    }
  }
}
