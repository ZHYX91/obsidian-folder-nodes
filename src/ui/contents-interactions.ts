import { normalizeVaultPath } from "../core/paths";
import type { NodeDropZone } from "../core/types";

export const CONTENTS_DRAG_MIME = "application/x-folder-nodes-entry";

export function breadcrumbSegments(path: string): string[] {
  const normalized = normalizeVaultPath(path);
  return normalized === "" ? [] : normalized.split("/");
}
export const CONTENTS_MENU_SOURCE = "folder-nodes-contents";

export interface ContentsDragPayload {
  kind: "node" | "file";
  path: string;
}

export function serializeDragPayload(payload: ContentsDragPayload): string {
  return JSON.stringify(payload);
}

export function parseDragPayload(value: string): ContentsDragPayload | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null) return null;
    const candidate = parsed as Partial<ContentsDragPayload>;
    if ((candidate.kind !== "node" && candidate.kind !== "file") || typeof candidate.path !== "string" || candidate.path === "") return null;
    return { kind: candidate.kind, path: candidate.path };
  } catch {
    return null;
  }
}

export function nodeDropZone(rect: Pick<DOMRect, "height" | "top">, clientY: number): NodeDropZone {
  const ratio = rect.height <= 0 ? 0.5 : (clientY - rect.top) / rect.height;
  return ratio < 0.25 ? "before" : ratio > 0.75 ? "after" : "into";
}

export function isContextMenuKey(event: KeyboardEvent): boolean {
  return event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey);
}
