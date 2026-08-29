export interface NodeGraphLinkSource {
  readonly nodeId: string;
  readonly notePath: string;
}

export type ResolvedLinkMap = Readonly<Record<string, Readonly<Record<string, number>>>>;

export function normalizeNodeGraphLinks(
  sources: readonly NodeGraphLinkSource[],
  resolvedLinks: ResolvedLinkMap,
  notePathToNodeId: ReadonlyMap<string, string>,
): ReadonlyMap<string, ReadonlySet<string>> {
  const result = new Map<string, ReadonlySet<string>>();
  for (const source of sources) {
    const targets = new Set<string>();
    const resolved = resolvedLinks[source.notePath] ?? {};
    for (const targetPath of Object.keys(resolved)) {
      const targetNode = notePathToNodeId.get(targetPath);
      if (targetNode === undefined || targetNode === source.nodeId) continue;
      targets.add(targetNode);
    }
    if (targets.size > 0) result.set(source.nodeId, targets);
  }
  return result;
}
