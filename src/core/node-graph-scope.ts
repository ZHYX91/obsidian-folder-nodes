import { dirname, normalizeVaultPath } from "./paths";
import type { NodeGraphSettings } from "./types";

export type NodeGraphScope =
  | { readonly mode: "global" }
  | { readonly mode: "local" | "subtree"; readonly rootPath: string };

export const GLOBAL_NODE_GRAPH_SCOPE: NodeGraphScope = { mode: "global" };

export function normalizeNodeGraphScope(value: unknown): NodeGraphScope {
  if (typeof value !== "object" || value === null) return GLOBAL_NODE_GRAPH_SCOPE;
  const input = value as { readonly mode?: unknown; readonly rootPath?: unknown };
  if ((input.mode !== "local" && input.mode !== "subtree") || typeof input.rootPath !== "string") {
    return GLOBAL_NODE_GRAPH_SCOPE;
  }
  const rootPath = normalizeVaultPath(input.rootPath);
  return { mode: input.mode, rootPath };
}

export function nodeGraphPathIsConfigured(path: string, settings: NodeGraphSettings): boolean {
  const normalized = normalizeVaultPath(path);
  if (settings.excludedNodes.includes(normalized)) return false;
  if (settings.excludedSubtrees.some((root) => isWithin(normalized, root))) return false;
  return settings.includedSubtrees.length === 0
    || settings.includedSubtrees.some((root) => isWithin(normalized, root));
}

export function nodeGraphTraversalRoots(scope: NodeGraphScope, settings: NodeGraphSettings): string[] {
  const scopeRoot = scope.mode === "global" ? "" : normalizeVaultPath(scope.rootPath);
  if (settings.includedSubtrees.length === 0) return [scopeRoot];
  const roots: string[] = [];
  for (const included of settings.includedSubtrees) {
    if (isWithin(scopeRoot, included)) roots.push(scopeRoot);
    else if (isWithin(included, scopeRoot)) roots.push(included);
  }
  return removeNestedPaths(roots);
}

export function nodeGraphSubtreeIsExcluded(path: string, settings: NodeGraphSettings): boolean {
  const normalized = normalizeVaultPath(path);
  return settings.excludedSubtrees.some((root) => isWithin(normalized, root));
}

export function remapNodeGraphSettingPaths(
  settings: NodeGraphSettings,
  oldPath: string,
  newPath: string,
  recursive: boolean,
): boolean {
  const previous = normalizeVaultPath(oldPath);
  const next = normalizeVaultPath(newPath);
  let changed = false;
  for (const paths of [settings.includedSubtrees, settings.excludedNodes, settings.excludedSubtrees]) {
    for (const [index, path] of paths.entries()) {
      const normalized = normalizeVaultPath(path);
      if (normalized !== previous && !(recursive && isWithin(normalized, previous))) continue;
      paths[index] = normalized === previous ? next : `${next}${normalized.slice(previous.length)}`;
      changed = true;
    }
    paths.splice(0, paths.length, ...new Set(paths));
    paths.sort((left, right) => left.localeCompare(right, "en"));
  }
  return changed;
}

export function nodeGraphParentPath(path: string): string | null {
  const normalized = normalizeVaultPath(path);
  return normalized === "" ? null : normalizeVaultPath(dirname(normalized));
}

export function nodeGraphPathDepth(path: string): number {
  const normalized = normalizeVaultPath(path);
  return normalized === "" ? 0 : normalized.split("/").length;
}

export function isWithin(path: string, root: string): boolean {
  const normalizedPath = normalizeVaultPath(path);
  const normalizedRoot = normalizeVaultPath(root);
  return normalizedRoot === "" || normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`);
}

function removeNestedPaths(paths: readonly string[]): string[] {
  const normalized = [...new Set(paths.map(normalizeVaultPath))]
    .sort((left, right) => nodeGraphPathDepth(left) - nodeGraphPathDepth(right) || left.localeCompare(right, "en"));
  return normalized.filter((path, index) => !normalized.some((candidate, candidateIndex) =>
    candidateIndex < index && isWithin(path, candidate)));
}
