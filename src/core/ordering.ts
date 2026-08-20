import type { ChildOrderRecord, ReorderPlan } from "./types";

export const ORDER_GAP = 1024;
const LOCAL_WINDOW = 64;

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export function compareChildren(left: ChildOrderRecord, right: ChildOrderRecord): number {
  if (left.order !== null || right.order !== null) {
    if (left.order === null) return 1;
    if (right.order === null) return -1;
    if (left.order !== right.order) return left.order - right.order;
  }
  const byName = collator.compare(left.basename.normalize("NFC"), right.basename.normalize("NFC"));
  return byName === 0 ? left.childPath.localeCompare(right.childPath) : byName;
}

export function naturalOrder(children: readonly ChildOrderRecord[]): ChildOrderRecord[] {
  return [...children].sort((left, right) => {
    const byName = collator.compare(left.basename.normalize("NFC"), right.basename.normalize("NFC"));
    return byName === 0 ? left.childPath.localeCompare(right.childPath) : byName;
  });
}

export function materializeManualOrder(children: readonly ChildOrderRecord[]): ReorderPlan {
  const ordered = [...children].sort(compareChildren);
  return {
    orderedPaths: ordered.map(({ childPath }) => childPath),
    patches: ordered.flatMap((child, index) => {
      const nextOrder = (index + 1) * ORDER_GAP;
      return child.order === nextOrder ? [] : [{ childPath: child.childPath, previousOrder: child.order, nextOrder }];
    }),
  };
}

export function planReorder(
  children: readonly ChildOrderRecord[],
  movedPath: string,
  targetIndex: number,
): ReorderPlan {
  const ordered = [...children].sort(compareChildren);
  const currentIndex = ordered.findIndex(({ childPath }) => childPath === movedPath);
  if (currentIndex < 0) throw new Error(`Unknown child: ${movedPath}`);
  const [moved] = ordered.splice(currentIndex, 1);
  if (!moved) throw new Error(`Unknown child: ${movedPath}`);
  const boundedIndex = Math.max(0, Math.min(targetIndex, ordered.length));
  ordered.splice(boundedIndex, 0, moved);

  const previous = ordered[boundedIndex - 1]?.order ?? null;
  const next = ordered[boundedIndex + 1]?.order ?? null;
  let candidate: number | null = null;
  if (previous === null && next === null) candidate = ORDER_GAP;
  else if (previous === null && next !== null && next > 1) candidate = Math.floor(next / 2);
  else if (previous !== null && next === null && previous <= Number.MAX_SAFE_INTEGER - ORDER_GAP) candidate = previous + ORDER_GAP;
  else if (previous !== null && next !== null && next - previous > 1) candidate = previous + Math.floor((next - previous) / 2);

  if (candidate !== null && Number.isSafeInteger(candidate) && candidate > 0) {
    return {
      orderedPaths: ordered.map(({ childPath }) => childPath),
      patches: moved.order === candidate ? [] : [{ childPath: moved.childPath, previousOrder: moved.order, nextOrder: candidate }],
    };
  }

  const start = Math.max(0, boundedIndex - Math.floor(LOCAL_WINDOW / 2));
  const end = Math.min(ordered.length, start + LOCAL_WINDOW);
  const window = ordered.slice(start, end);
  const leftAnchor = ordered[start - 1]?.order ?? 0;
  const rightAnchor = ordered[end]?.order ?? null;
  const available = rightAnchor === null ? ORDER_GAP : Math.floor((rightAnchor - leftAnchor) / (window.length + 1));
  if (available > 0) {
    const step = rightAnchor === null ? ORDER_GAP : available;
    return {
      orderedPaths: ordered.map(({ childPath }) => childPath),
      patches: window.flatMap((child, index) => {
        const nextOrder = leftAnchor + step * (index + 1);
        return child.order === nextOrder ? [] : [{ childPath: child.childPath, previousOrder: child.order, nextOrder }];
      }),
    };
  }
  return materializeManualOrder(ordered);
}
