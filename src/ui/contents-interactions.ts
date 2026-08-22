import { normalizeVaultPath } from "../core/paths";

export interface BreadcrumbItem {
  current: boolean;
  label: string;
  path: string;
}

export function breadcrumbSegments(path: string): string[] {
  const normalized = normalizeVaultPath(path);
  return normalized === "" ? [] : normalized.split("/");
}

export function breadcrumbItems(rootLabel: string, path: string): BreadcrumbItem[] {
  const segments = breadcrumbSegments(path);
  const items: BreadcrumbItem[] = [{ current: segments.length === 0, label: rootLabel, path: "" }];
  let target = "";
  for (const [index, segment] of segments.entries()) {
    target = target === "" ? segment : `${target}/${segment}`;
    items.push({ current: index === segments.length - 1, label: segment, path: target });
  }
  return items;
}
export const CONTENTS_MENU_SOURCE = "folder-nodes-contents";

export function siblingDropZone(rect: Pick<DOMRect, "height" | "top">, clientY: number): "before" | "after" {
  const midpoint = rect.top + Math.max(0, rect.height) / 2;
  return clientY < midpoint ? "before" : "after";
}

export function selectionRange(order: readonly string[], anchor: string, target: string): string[] {
  const anchorIndex = order.indexOf(anchor);
  const targetIndex = order.indexOf(target);
  if (anchorIndex < 0 || targetIndex < 0) return [];
  return order.slice(Math.min(anchorIndex, targetIndex), Math.max(anchorIndex, targetIndex) + 1);
}

export interface ContentLinkItem {
  kind: "file" | "media";
  link: string;
}

export function formatContentLinks(items: readonly ContentLinkItem[], allAsLinks = false): string {
  return items.map(({ kind, link }) => kind === "media" && !allAsLinks && !link.startsWith("!") ? `!${link}` : link).join("\n");
}

export function isContextMenuKey(event: KeyboardEvent): boolean {
  return event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey);
}
