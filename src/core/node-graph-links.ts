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
  return normalizeNodeGraphLinksFromTargets(
    sources,
    ({ notePath }) => Object.keys(resolvedLinks[notePath] ?? {}),
    notePathToNodeId,
  );
}

export function normalizeNodeGraphLinksFromTargets(
  sources: readonly NodeGraphLinkSource[],
  targetsForSource: (source: NodeGraphLinkSource) => Iterable<string>,
  notePathToNodeId: ReadonlyMap<string, string>,
): ReadonlyMap<string, ReadonlySet<string>> {
  const result = new Map<string, ReadonlySet<string>>();
  for (const source of sources) {
    const targets = new Set<string>();
    for (const targetPath of targetsForSource(source)) {
      const targetNode = notePathToNodeId.get(targetPath);
      if (targetNode === undefined || targetNode === source.nodeId) continue;
      targets.add(targetNode);
    }
    if (targets.size > 0) result.set(source.nodeId, targets);
  }
  return result;
}
