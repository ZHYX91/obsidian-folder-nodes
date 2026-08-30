export interface NodeGraphSearchCandidate {
  readonly label: string;
  readonly path: string;
}

export interface NodeGraphSearchResult extends NodeGraphSearchCandidate {
  readonly rank: number;
}

export function nodeGraphSearchResults(
  candidates: readonly NodeGraphSearchCandidate[],
  rawQuery: string,
): readonly NodeGraphSearchResult[] {
  const query = rawQuery.trim().toLocaleLowerCase();
  if (query === "") return [];
  return candidates.flatMap((candidate) => {
    const label = candidate.label.toLocaleLowerCase();
    const path = candidate.path.toLocaleLowerCase();
    const rank = searchRank(label, path, query);
    return rank === null ? [] : [{ ...candidate, rank }];
  }).sort((left, right) => left.rank - right.rank
    || left.label.localeCompare(right.label, "en")
    || left.path.localeCompare(right.path, "en"));
}

export function bestNodeGraphSearchPaths(
  candidates: readonly NodeGraphSearchCandidate[],
  rawQuery: string,
): ReadonlySet<string> {
  const results = nodeGraphSearchResults(candidates, rawQuery);
  const bestRank = results[0]?.rank;
  return new Set(bestRank === undefined ? [] : results.filter(({ rank }) => rank === bestRank).map(({ path }) => path));
}

function searchRank(label: string, path: string, query: string): number | null {
  if (label === query) return 0;
  if (label.startsWith(query)) return 1;
  if (label.includes(query)) return 2;
  if (path === query || path.endsWith(`/${query}`)) return 3;
  if (path.includes(query)) return 4;
  return null;
}
