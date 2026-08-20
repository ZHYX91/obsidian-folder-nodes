export type AdoptionState = "unadopted" | "migrating" | "managed";
export type SortMode = "natural" | "manual";

export interface NamingPart {
  enabled: boolean;
  source: "current-file" | "current-node" | "current-heading" | "timestamp" | "custom";
  separator: string;
  customText: string;
}

export interface FolderNodesSettings {
  adoptionState: AdoptionState;
  iconInheritance: boolean;
  defaultNodeTemplatePath: string;
  addSelectionAlias: boolean;
  prefix: NamingPart;
  suffix: NamingPart;
  timestampFormat: string;
}

export interface FolderNodeRecord {
  folderPath: string;
  notePath: string;
  name: string;
  parentPath: string | null;
  order: number | null;
  sortMode: SortMode;
}

export interface ChildOrderRecord {
  childPath: string;
  basename: string;
  order: number | null;
}

export interface OrderPatch {
  childPath: string;
  previousOrder: number | null;
  nextOrder: number;
}

export interface ReorderPlan {
  patches: OrderPatch[];
  orderedPaths: string[];
}

export interface MigrationConflict {
  path: string;
  reason: string;
}

export interface MigrationScan {
  leafMarkdown: string[];
  missingNodeNotes: string[];
  conflicts: MigrationConflict[];
}
