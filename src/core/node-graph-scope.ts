import { dirname, normalizeVaultPath } from "./paths";

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

export function nodeGraphTraversalRoots(scope: NodeGraphScope): string[] {
  return [scope.mode === "global" ? "" : normalizeVaultPath(scope.rootPath)];
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
