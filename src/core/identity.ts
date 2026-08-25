export type FolderIdentity = "missing-note" | "node" | "ordinary";
export type FileIdentity = "conflict" | "missing-folder" | "node-note" | "ordinary";

export function classifyFolderIdentity(ignored: boolean, nodeNoteExists: boolean): FolderIdentity {
  if (ignored) return "ordinary";
  return nodeNoteExists ? "node" : "missing-note";
}

export function classifyFileIdentity(options: {
  canonicalNodeNote: boolean;
  counterpartNodeExists: boolean;
  ignored: boolean;
  leafExempt: boolean;
  markdown: boolean;
}): FileIdentity {
  if (options.ignored) return "ordinary";
  if (options.canonicalNodeNote) return "node-note";
  if (!options.markdown || options.leafExempt) return "ordinary";
  return options.counterpartNodeExists ? "conflict" : "ordinary";
}
