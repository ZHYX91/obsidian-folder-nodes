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

export type SiblingDropAxis = "horizontal" | "vertical";

export function siblingDropAxis(rects: readonly Pick<DOMRect, "height" | "left" | "top" | "width">[]): SiblingDropAxis {
  for (const [index, left] of rects.entries()) {
    for (const right of rects.slice(index + 1)) {
      const overlap = Math.min(left.top + left.height, right.top + right.height) - Math.max(left.top, right.top);
      if (overlap > Math.min(left.height, right.height) / 2 && Math.abs(left.left - right.left) > 1) return "horizontal";
    }
  }
  return "vertical";
}

export function siblingDropZone(
  rect: Pick<DOMRect, "height" | "left" | "top" | "width">,
  point: { clientX: number; clientY: number },
  axis: SiblingDropAxis,
  rightToLeft = false,
): "before" | "after" {
  if (axis === "vertical") return point.clientY < rect.top + Math.max(0, rect.height) / 2 ? "before" : "after";
  const leadingHalf = point.clientX < rect.left + Math.max(0, rect.width) / 2;
  return leadingHalf !== rightToLeft ? "before" : "after";
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
