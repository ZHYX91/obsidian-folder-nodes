export type FolderNodesErrorCode =
  | "complete_parent_required"
  | "folder_unmanaged"
  | "multiple_canonical_notes"
  | "node_path_required"
  | "root_cannot_delete"
  | "root_cannot_hide"
  | "root_cannot_move"
  | "root_cannot_rename"
  | "selection_changed"
  | "selection_editor_changed"
  | "selection_source_changed"
  | "selection_table_changed"
  | "source_node_changed"
  | "target_folder_unknown"
  | "target_not_complete"
  | "unmanaged_merge";

export class FolderNodesError extends Error {
  public constructor(
    public readonly code: FolderNodesErrorCode,
    public readonly values: Readonly<Record<string, string | number>> = {},
    message: string = code,
  ) {
    super(message);
    this.name = "FolderNodesError";
  }
}
