import { basename, childVaultPath, normalizeVaultPath, sanitizeNewNodeName } from "./paths";

export interface UnresolvedNodePlan {
  nodeName: string;
  nodePath: string;
  notePath: string;
  leafPath: string;
}

export interface LinkAliasCandidate {
  linkPath: string;
  original: string;
  displayText?: string;
}

export function planUnresolvedNode(linkPath: string, defaultParentPath: string): UnresolvedNodePlan | null {
  const raw = linkPath.trim().replaceAll("\\", "/");
  if (raw === "" || raw.startsWith("/")) return null;
  const parts = raw.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) return null;

  const lastIndex = parts.length - 1;
  let nodeName = parts[lastIndex] ?? "";
  if (nodeName.toLocaleLowerCase().endsWith(".md")) nodeName = nodeName.slice(0, -3);
  else if (nodeName.lastIndexOf(".") > 0) return null;
  if (nodeName === "" || sanitizeNewNodeName(nodeName) !== nodeName.normalize("NFC")) return null;
  parts[lastIndex] = nodeName;
  if (parts.some((part) => sanitizeNewNodeName(part) !== part.normalize("NFC"))) return null;

  const explicitPath = parts.length > 1;
  const parentPath = explicitPath ? parts.slice(0, -1).join("/") : normalizeVaultPath(defaultParentPath);
  const nodePath = childVaultPath(parentPath, nodeName);
  return {
    nodeName,
    nodePath,
    notePath: `${nodePath}/${nodeName}.md`,
    leafPath: parentPath === "" ? `${nodeName}.md` : `${parentPath}/${nodeName}.md`,
  };
}

/** Existing Vault entries keep their spelling. Only genuinely new segments
 * use the NFC spelling accepted by the creation path. */
export function projectUnresolvedNode(plan: UnresolvedNodePlan, lookupPath: (path: string) => string | null) {
  let nodePath = "";
  let conflict: string | null = null;
  for (const name of plan.nodePath.split("/")) {
    const prefix = nodePath === "" ? "" : nodePath + "/";
    const requested = prefix + name;
    const generated = prefix + name.normalize("NFC");
    nodePath = requested;
    if (requested === generated) continue;
    const existing = lookupPath(requested);
    if (existing === requested) continue;
    nodePath = generated;
    if (existing !== null || lookupPath(generated) !== null) conflict ??= generated;
  }
  return { nodePath, leafPath: nodePath + ".md", conflict };
}

export function aliasFromLinkDisplay(
  linkPath: string,
  visibleText: string,
  candidates: readonly LinkAliasCandidate[],
  allowVisibleFallback: boolean,
): string | null {
  const visible = visibleText.trim();
  if (visible === "") return null;
  const explicit = candidates.find((candidate) =>
    candidate.linkPath === linkPath &&
    candidate.displayText?.trim() === visible &&
    /^\[\[[\s\S]*\|[\s\S]*\]\]$/u.test(candidate.original.trim()));
  if (explicit?.displayText !== undefined) return explicit.displayText.trim() || null;
  if (!allowVisibleFallback) return null;

  const normalized = normalizeVaultPath(linkPath).replace(/\.md$/iu, "");
  const defaultLabels = new Set([normalized, basename(normalized)]);
  return defaultLabels.has(visible) ? null : visible;
}
