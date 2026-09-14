import { normalizeVaultPath } from "./paths";

export interface InsertionGap {
  parentPath: string;
  previousSiblingPath: string | null;
  nextSiblingPath: string | null;
}

export type PlacementIntent =
  | { kind: "move-into"; parentPath: string }
  | { kind: "insert"; gap: InsertionGap };

export type PlacementPreview =
  | { kind: "ready"; intent: PlacementIntent }
  | { kind: "noop" }
  | { kind: "blocked"; reason: string };

export function gapBefore(
  orderedPaths: readonly string[],
  targetPath: string,
  parentPath: string,
): InsertionGap {
  const index = orderedPaths.indexOf(targetPath);
  if (index < 0) throw new Error(`Unknown target node: ${targetPath}`);
  return {
    parentPath: normalizeVaultPath(parentPath),
    previousSiblingPath: orderedPaths[index - 1] ?? null,
    nextSiblingPath: targetPath,
  };
}

export function gapAfter(
  orderedPaths: readonly string[],
  targetPath: string,
  parentPath: string,
): InsertionGap {
  const index = orderedPaths.indexOf(targetPath);
  if (index < 0) throw new Error(`Unknown target node: ${targetPath}`);
  return {
    parentPath: normalizeVaultPath(parentPath),
    previousSiblingPath: targetPath,
    nextSiblingPath: orderedPaths[index + 1] ?? null,
  };
}

export interface InsertionMarker {
  path: string;
  edge: "before" | "after";
}

export function insertionMarker(gap: InsertionGap): InsertionMarker | null {
  if (gap.nextSiblingPath !== null) return { path: gap.nextSiblingPath, edge: "before" };
  if (gap.previousSiblingPath !== null) return { path: gap.previousSiblingPath, edge: "after" };
  return null;
}

export function insertionIndex(orderedPaths: readonly string[], gap: InsertionGap): number | null {
  const previousIndex = gap.previousSiblingPath === null ? -1 : orderedPaths.indexOf(gap.previousSiblingPath);
  const nextIndex = gap.nextSiblingPath === null ? orderedPaths.length : orderedPaths.indexOf(gap.nextSiblingPath);
  if (gap.previousSiblingPath !== null && previousIndex < 0) return null;
  if (gap.nextSiblingPath !== null && nextIndex < 0) return null;
  return nextIndex === previousIndex + 1 ? nextIndex : null;
}
