export interface NodeGraphDensityNode {
  readonly id: string;
  readonly parentId: string | null;
}

export interface NodeGraphDensityOverview {
  readonly hiddenBranchCount: number;
  readonly visibleIds: ReadonlySet<string>;
}

export const NODE_GRAPH_DENSITY_THRESHOLD = 48;
export const NODE_GRAPH_VISIBLE_CHILD_LIMIT = 12;

export function nodeGraphDensityOverview(
  nodes: readonly NodeGraphDensityNode[],
  focusId: string | null,
  expandedParents: ReadonlySet<string>,
  childLimit = NODE_GRAPH_VISIBLE_CHILD_LIMIT,
  maximumDepth = Number.POSITIVE_INFINITY,
  rootLimit = childLimit,
): NodeGraphDensityOverview {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const children = new Map<string | null, string[]>();
  for (const node of nodes) {
    const parentId = node.parentId !== null && byId.has(node.parentId) ? node.parentId : null;
    const siblings = children.get(parentId) ?? [];
    siblings.push(node.id);
    children.set(parentId, siblings);
  }
  for (const siblings of children.values()) siblings.sort(compareText);

  const visibleIds = new Set<string>();
  let hiddenBranchCount = 0;
  const limit = Math.max(1, Math.floor(childLimit));
  const depthLimit = Math.max(0, Math.floor(maximumDepth));
  const visibleRoots = limitedChildren(children.get(null) ?? [], focusId, Math.max(1, Math.floor(rootLimit)));
  hiddenBranchCount += (children.get(null)?.length ?? 0) - visibleRoots.length;
  const pending = visibleRoots.map((id) => ({ depth: 0, id })).reverse();
  while (pending.length > 0) {
    const entry = pending.pop();
    if (entry === undefined || visibleIds.has(entry.id)) continue;
    const { depth, id } = entry;
    visibleIds.add(id);
    const childIds = children.get(id) ?? [];
    let visibleChildren = childIds;
    if (!expandedParents.has(id) && depth >= depthLimit) {
      const focusedChild = focusedDescendantChild(childIds, focusId);
      visibleChildren = focusedChild === undefined ? [] : [focusedChild];
      hiddenBranchCount += childIds.length - visibleChildren.length;
    } else if (childIds.length > limit && !expandedParents.has(id)) {
      visibleChildren = limitedChildren(childIds, focusId, limit);
      hiddenBranchCount += childIds.length - visibleChildren.length;
    }
    for (let index = visibleChildren.length - 1; index >= 0; index -= 1) {
      const childId = visibleChildren[index];
      if (childId !== undefined) pending.push({ depth: depth + 1, id: childId });
    }
  }
  return { hiddenBranchCount, visibleIds };
}

function limitedChildren(childIds: readonly string[], focusId: string | null, limit: number): string[] {
  if (childIds.length <= limit) return [...childIds];
  const visibleChildren = childIds.slice(0, limit);
  const focusedChild = focusedDescendantChild(childIds, focusId);
  if (focusedChild === undefined || visibleChildren.includes(focusedChild)) return visibleChildren;
  return [...visibleChildren.slice(0, -1), focusedChild].sort(compareText);
}

function focusedDescendantChild(childIds: readonly string[], focusId: string | null): string | undefined {
  if (focusId === null) return undefined;
  return childIds.find((childId) => focusId === childId || focusId.startsWith(`${childId}/`));
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
