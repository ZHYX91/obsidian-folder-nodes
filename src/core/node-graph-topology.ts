import { normalizeVaultPath } from "./paths";

export interface NodeGraphTopologyRecord {
  readonly id: string;
  readonly parentId: string | null;
}

export interface NodeGraphTopologyNode {
  readonly id: string;
  readonly parentId: string | null;
  readonly children: readonly string[];
}

export interface NodeGraphTopologyStats {
  readonly scannedLinkTargets: number;
  readonly scannedNodes: number;
}

export interface NodeGraphTopology {
  readonly links: ReadonlyMap<string, ReadonlySet<string>>;
  readonly nodes: ReadonlyMap<string, NodeGraphTopologyNode>;
  readonly roots: readonly string[];
  readonly stats: NodeGraphTopologyStats;
}

/**
 * Builds an immutable, host-independent topology snapshot. The caller owns Vault
 * scanning and incremental invalidation; all visibility operations can reuse this
 * snapshot without touching the host again.
 */
export function createNodeGraphTopology(
  records: readonly NodeGraphTopologyRecord[],
  linksBySource: ReadonlyMap<string, ReadonlySet<string>> = new Map(),
): NodeGraphTopology {
  const mutableNodes = new Map<string, { id: string; parentId: string | null; children: string[] }>();
  for (const record of records) {
    const id = normalizeVaultPath(record.id);
    const parentId = record.parentId === null ? null : normalizeVaultPath(record.parentId);
    if (mutableNodes.has(id)) throw new Error(`Duplicate Node Graph topology id: ${id}`);
    mutableNodes.set(id, { id, parentId, children: [] });
  }

  const roots: string[] = [];
  for (const node of mutableNodes.values()) {
    if (node.parentId === node.id) throw new Error(`Node Graph topology node cannot parent itself: ${node.id}`);
    const parent = node.parentId === null ? undefined : mutableNodes.get(node.parentId);
    if (parent === undefined) roots.push(node.id);
    else parent.children.push(node.id);
  }
  assertAcyclic(mutableNodes, roots);

  const mutableLinks = new Map<string, Set<string>>();
  let scannedLinkTargets = 0;
  for (const [rawSource, rawTargets] of linksBySource) {
    const source = normalizeVaultPath(rawSource);
    for (const rawTarget of rawTargets) {
      scannedLinkTargets += 1;
      const target = normalizeVaultPath(rawTarget);
      if (source === target || !mutableNodes.has(source) || !mutableNodes.has(target)) continue;
      addLink(mutableLinks, source, target);
      addLink(mutableLinks, target, source);
    }
  }

  return {
    nodes: new Map([...mutableNodes].map(([id, node]) => [id, {
      id: node.id,
      parentId: node.parentId,
      children: [...node.children],
    }])),
    roots,
    links: new Map([...mutableLinks].map(([id, targets]) => [
      id,
      new Set([...targets].sort(compareIds)),
    ])),
    stats: { scannedLinkTargets, scannedNodes: records.length },
  };
}

export function nodeGraphTopologyDescendants(
  topology: NodeGraphTopology,
  rootId: string,
  includeRoot = true,
): readonly string[] {
  const root = normalizeVaultPath(rootId);
  if (!topology.nodes.has(root)) return [];
  const result: string[] = [];
  const pending = [root];
  while (pending.length > 0) {
    const id = pending.pop();
    if (id === undefined) break;
    if (includeRoot || id !== root) result.push(id);
    const children = topology.nodes.get(id)?.children ?? [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];
      if (child !== undefined) pending.push(child);
    }
  }
  return result;
}

function assertAcyclic(
  nodes: ReadonlyMap<string, { readonly children: readonly string[] }>,
  roots: readonly string[],
): void {
  const visited = new Set<string>();
  const pending = [...roots];
  while (pending.length > 0) {
    const id = pending.pop();
    if (id === undefined || visited.has(id)) continue;
    visited.add(id);
    for (const child of nodes.get(id)?.children ?? []) pending.push(child);
  }
  if (visited.size === nodes.size) return;
  const cycleId = [...nodes.keys()].find((id) => !visited.has(id)) ?? "unknown";
  throw new Error(`Node Graph topology contains a parent cycle: ${cycleId}`);
}

function addLink(links: Map<string, Set<string>>, source: string, target: string): void {
  const targets = links.get(source) ?? new Set<string>();
  targets.add(target);
  links.set(source, targets);
}

function compareIds(left: string, right: string): number {
  return left.localeCompare(right, "en");
}
