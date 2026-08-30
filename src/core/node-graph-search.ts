export interface NodeGraphSearchCandidate {
  readonly label: string;
  readonly path: string;
}

export interface NodeGraphSearchResult extends NodeGraphSearchCandidate {
  readonly rank: number;
}

export interface NodeGraphSearchSummary {
  readonly bestPaths: ReadonlySet<string>;
  readonly first: NodeGraphSearchResult | null;
}

export function summarizeNodeGraphSearch(
  candidates: readonly NodeGraphSearchCandidate[],
  rawQuery: string,
): NodeGraphSearchSummary {
  const query = rawQuery.trim().toLocaleLowerCase();
  if (query === "") return { bestPaths: new Set(), first: null };
  let bestRank = Number.POSITIVE_INFINITY;
  let first: NodeGraphSearchResult | null = null;
  const bestPaths = new Set<string>();
  for (const candidate of candidates) {
    const rank = searchRank(candidate.label.toLocaleLowerCase(), candidate.path.toLocaleLowerCase(), query);
    if (rank === null || rank > bestRank) continue;
    const result = { ...candidate, rank };
    if (rank < bestRank) {
      bestRank = rank;
      bestPaths.clear();
      first = result;
    } else if (first === null || compareSearchResult(result, first) < 0) first = result;
    bestPaths.add(candidate.path);
  }
  return { bestPaths, first };
}

function compareSearchResult(left: NodeGraphSearchResult, right: NodeGraphSearchResult): number {
  return left.label.localeCompare(right.label, "en") || left.path.localeCompare(right.path, "en");
}

function searchRank(label: string, path: string, query: string): number | null {
  if (label === query) return 0;
  if (label.startsWith(query)) return 1;
  if (label.includes(query)) return 2;
  if (path === query || path.endsWith(`/${query}`)) return 3;
  if (path.includes(query)) return 4;
  return null;
}
