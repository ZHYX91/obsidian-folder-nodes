import { basename, childVaultPath, dirname, nodeNotePath, sanitizeNodeName } from "./paths";

export interface LeafTarget {
  folderPath: string;
  notePath: string;
  existing: boolean;
}

/** Candidates are same-name folders in the source note's actual parent. */
export function resolveLeafTarget(sourcePath: string, matchingFolders: readonly string[]): LeafTarget | null {
  const parent = dirname(sourcePath);
  const rawName = basename(sourcePath).slice(0, -3);
  const name = sanitizeNodeName(rawName);
  const rawPath = childVaultPath(parent, rawName);
  const sanitizedPath = childVaultPath(parent, name);
  const folderPath = rawName.normalize("NFC") === name && matchingFolders.includes(rawPath) ? rawPath : sanitizedPath;
  const existing = matchingFolders.includes(folderPath);
  if (!existing && matchingFolders.length > 0) return null;
  return { folderPath, notePath: nodeNotePath(folderPath), existing };
}
