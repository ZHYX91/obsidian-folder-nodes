export type FolderIdentity = "incomplete" | "node" | "ordinary" | "unmanaged";
export type FileIdentity = "conflict" | "incomplete" | "node-note" | "ordinary" | "unmanaged";

export function classifyFolderIdentity(ignored: boolean, unmanagedRoot: boolean, nodeNoteExists: boolean): FolderIdentity {
  if (ignored) return unmanagedRoot ? "unmanaged" : "ordinary";
  return nodeNoteExists ? "node" : "incomplete";
}

export function classifyFileIdentity(options: {
  canonicalNodeNote: boolean;
  counterpartNodeExists: boolean;
  parentUnmanaged: boolean;
  leafExempt: boolean;
  markdown: boolean;
}): FileIdentity {
  if (options.parentUnmanaged) return "ordinary";
  if (options.canonicalNodeNote) return "node-note";
  if (!options.markdown) return "ordinary";
  if (options.leafExempt) return "unmanaged";
  return options.counterpartNodeExists ? "conflict" : "incomplete";
}
