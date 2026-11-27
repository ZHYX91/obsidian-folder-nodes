import { normalizeVaultPath } from "../core/paths";
import type { NodeVisual } from "../core/types";

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

export type NodeEntryVisualKind = "conflict" | "healthy" | "incomplete" | "missing-folder";

export function nodeEntryVisual(
  kind: NodeEntryVisualKind,
  resolved: NodeVisual | null,
): { defaultVisual: boolean; visual: NodeVisual; warning: boolean } {
  if (kind === "healthy" && resolved !== null && resolved.kind !== "fallback") {
    return { defaultVisual: false, visual: resolved, warning: false };
  }
  return {
    defaultVisual: true,
    visual: {
      kind: "lucide",
      value: kind === "incomplete" || kind === "healthy" ? "folder-tree" : "file-warning",
      accent: null,
      inheritedFrom: null,
    },
    warning: kind !== "healthy" && kind !== "incomplete",
  };
}

export function filesSectionKey(hasFolders: boolean): "files" | "filesAndFolders" {
  return hasFolders ? "filesAndFolders" : "files";
}

export type SiblingDropAxis = "horizontal" | "vertical";

export function siblingDropAxis(rects: readonly Pick<DOMRect, "height" | "left" | "top" | "width">[]): SiblingDropAxis {
  // Sweep in visual order. In a normal single-column list, expired cards leave
  // the active set immediately instead of comparing every pair of siblings.
  const ordered = rects.filter((rect) => rect.width > 0 && rect.height > 0).sort((left, right) => left.top - right.top);
  const active: Array<(typeof ordered)[number]> = [];
  for (const current of ordered) {
    let retained = 0;
    for (const candidate of active) {
      const overlap = candidate.top + candidate.height - current.top;
      if (overlap <= 0) continue;
      if (overlap > Math.min(candidate.height, current.height) / 2
        && Math.abs(candidate.left - current.left) > 1) return "horizontal";
      active[retained++] = candidate;
    }
    active.length = retained;
    active.push(current);
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

export function formatContentLinks(items: readonly ContentLinkItem[], allAsLinks = false, blankLines = false): string {
  const separator = blankLines ? "\n\n" : "\n";
  return items.map(({ kind, link }) => kind === "media" && !allAsLinks && !link.startsWith("!") ? `!${link}` : link).join(separator);
}

export function vaultImageLink(path: string, name: string): string {
  const target = path.split("/").map((segment) => encodeURIComponent(segment)
    .replace(/[()]/gu, (character) => character === "(" ? "%28" : "%29")).join("/");
  const label = name.replace(/[\\[\]]/gu, "\\$&");
  return `[${label}](${target})`;
}

export function contentDragPolicy(itemCount: number): { effectAllowed: "copy" | "copyMove"; internalMove: boolean } {
  return itemCount === 1 ? { effectAllowed: "copyMove", internalMove: true } : { effectAllowed: "copy", internalMove: false };
}

export function isContextMenuKey(event: KeyboardEvent): boolean {
  return event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey);
}
