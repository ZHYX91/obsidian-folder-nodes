import type { ChildOrderRecord, ReorderPlan } from "./types";

export const ORDER_GAP = 1024;
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export function compareChildren(left: ChildOrderRecord, right: ChildOrderRecord): number {
  if (left.order !== null || right.order !== null) {
    if (left.order === null) return 1;
    if (right.order === null) return -1;
    if (left.order !== right.order) return left.order - right.order;
  }
  return compareNames(left, right);
}

function compareNames(left: ChildOrderRecord, right: ChildOrderRecord): number {
  const byName = collator.compare(left.basename.normalize("NFC"), right.basename.normalize("NFC"));
  return byName === 0 ? left.childPath.localeCompare(right.childPath) : byName;
}

export function naturalOrder(children: readonly ChildOrderRecord[]): ChildOrderRecord[] {
  return [...children].sort(compareNames);
}

/** Encode an already-decided sequence. Never sort it by its obsolete ranks. */
export function materializeManualOrder(ordered: readonly ChildOrderRecord[]): ReorderPlan {
  assertValidChildren(ordered);
  if (ordered.length > Math.floor(Number.MAX_SAFE_INTEGER / ORDER_GAP)) {
    throw new Error("Too many children to allocate safe integer ranks");
  }
  return {
    orderedPaths: ordered.map(({ childPath }) => childPath),
    patches: ordered.flatMap((child, index) => {
      const nextOrder = (index + 1) * ORDER_GAP;
      return child.order === nextOrder ? [] : [{ childPath: child.childPath, previousOrder: child.order, nextOrder }];
    }),
  };
}

export function planInsert(
  children: readonly ChildOrderRecord[],
  moved: ChildOrderRecord,
  targetIndex: number,
): ReorderPlan {
  assertValidChildren(children);
  assertValidChildren([moved]);
  if (children.some(({ childPath }) => childPath === moved.childPath)) throw new Error(`Duplicate child: ${moved.childPath}`);
  const ordered = [...children].sort(compareChildren);
  if (!Number.isSafeInteger(targetIndex) || targetIndex < 0 || targetIndex > ordered.length) {
    throw new Error("Invalid insertion index");
  }
  ordered.splice(targetIndex, 0, moved);
  return allocateRanks(ordered, moved.childPath);
}

export function planReorder(
  children: readonly ChildOrderRecord[],
  movedPath: string,
  targetIndex: number,
): ReorderPlan {
  assertValidChildren(children);
  const ordered = [...children].sort(compareChildren);
  const currentIndex = ordered.findIndex(({ childPath }) => childPath === movedPath);
  if (currentIndex < 0) throw new Error(`Unknown child: ${movedPath}`);
  if (!Number.isSafeInteger(targetIndex) || targetIndex < 0 || targetIndex >= ordered.length) {
    throw new Error("Invalid insertion index");
  }
  if (currentIndex === targetIndex) {
    return { orderedPaths: ordered.map(({ childPath }) => childPath), patches: [] };
  }
  const [moved] = ordered.splice(currentIndex, 1);
  if (moved === undefined) throw new Error(`Unknown child: ${movedPath}`);
  ordered.splice(targetIndex, 0, moved);
  return allocateRanks(ordered, moved.childPath);
}

function allocateRanks(ordered: readonly ChildOrderRecord[], preferredPath: string): ReorderPlan {
  const preferredIndex = ordered.findIndex(({ childPath }) => childPath === preferredPath);
  if (preferredIndex < 0) throw new Error(`Unknown child: ${preferredPath}`);
  const others = ordered.filter(({ childPath }) => childPath !== preferredPath);
  if (strictlyRanked(others)) {
    const moved = ordered[preferredIndex]!;
    const previous = ordered[preferredIndex - 1];
    const next = ordered[preferredIndex + 1];
    const left = previous?.order ?? 0;
    const right = next === undefined ? undefined : next.order;
    if (right === null) return materializeManualOrder(ordered);
    const candidate = right === undefined ? left + ORDER_GAP : left + Math.floor((right - left) / 2);
    if (Number.isSafeInteger(candidate) && candidate > left && (right === undefined || candidate < right)) {
      return {
        orderedPaths: ordered.map(({ childPath }) => childPath),
        patches: moved.order === candidate ? [] : [{ childPath: moved.childPath, previousOrder: moved.order, nextOrder: candidate }],
      };
    }
  }
  return materializeManualOrder(ordered);
}

function strictlyRanked(children: readonly ChildOrderRecord[]): boolean {
  let previous = 0;
  for (const child of children) {
    if (child.order === null || child.order <= previous) return false;
    previous = child.order;
  }
  return true;
}

function assertValidChildren(children: readonly ChildOrderRecord[]): void {
  const paths = new Set<string>();
  for (const child of children) {
    if (paths.has(child.childPath)) throw new Error(`Duplicate child: ${child.childPath}`);
    paths.add(child.childPath);
    if (child.order !== null && (!Number.isSafeInteger(child.order) || child.order <= 0)) {
      throw new Error(`Invalid rank: ${child.childPath}`);
    }
  }
}
