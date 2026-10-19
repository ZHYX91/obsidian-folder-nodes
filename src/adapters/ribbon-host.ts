import type { Workspace } from "obsidian";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function ribbonItems(workspace: Workspace): unknown[] {
  const ribbon: unknown = Reflect.get(workspace, "leftRibbon");
  return isRecord(ribbon) && Array.isArray(ribbon.items) ? ribbon.items : [];
}

export function ribbonRegistrationTitle(workspace: Workspace, pluginId: string): string {
  // addRibbonIcon derives its persistent ID from this argument. Reuse a legacy
  // saved ID, or use one constant ID for a new installation in every language.
  const fallback = "Open node contents";
  const prefix = `${pluginId}:`;
  const ownedIds = ribbonItems(workspace).flatMap((item) =>
    isRecord(item) && typeof item.id === "string" && item.id.startsWith(prefix) && item.id.length > prefix.length
      ? [item.id] : []);
  const existing = ownedIds.find((id) => id === `${prefix}${fallback}`) ?? (ownedIds.length === 1 ? ownedIds[0] : undefined);
  return existing?.slice(prefix.length) ?? fallback;
}

export function refreshRibbonLabel(workspace: Workspace, button: HTMLElement | null, label: string): void {
  if (button === null) return;
  button.setAttribute("aria-label", label);
  button.setAttribute("title", label);

  // Obsidian's mobile menu reads the ribbon item's title, not the button tooltip.
  // Match only our registered button; retain the host ID, order and visibility.
  for (const item of ribbonItems(workspace)) {
    if (isRecord(item) && item.buttonEl === button && typeof item.title === "string") {
      item.title = label;
      return;
    }
  }
}
