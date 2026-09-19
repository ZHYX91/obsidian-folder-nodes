export type FolderIdentity = "conflict" | "incomplete" | "node" | "ordinary" | "unmanaged";
export type FileIdentity = "conflict" | "incomplete" | "node-note" | "ordinary" | "unmanaged";
export type CanonicalRole = "conflict" | "none" | "unique";

export function classifyFolderIdentity(ignored: boolean, unmanagedRoot: boolean, nodeNoteCandidates: number): FolderIdentity {
  if (ignored) return unmanagedRoot ? "unmanaged" : "ordinary";
  if (nodeNoteCandidates > 1) return "conflict";
  return nodeNoteCandidates === 1 ? "node" : "incomplete";
}

export function classifyFileIdentity(options: {
  canonicalRole: CanonicalRole;
  counterpartNodeExists: boolean;
  parentUnmanaged: boolean;
  leafExempt: boolean;
  markdown: boolean;
}): FileIdentity {
  if (options.parentUnmanaged) return "ordinary";
  if (options.canonicalRole === "unique") return "node-note";
  if (options.canonicalRole === "conflict") return "conflict";
  if (!options.markdown) return "ordinary";
  if (options.leafExempt) return "unmanaged";
  return options.counterpartNodeExists ? "conflict" : "incomplete";
}
