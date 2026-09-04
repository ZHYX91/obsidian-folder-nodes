import type { EmojiFontPreference } from "./emoji-font";

export type SortMode = "natural" | "manual";
export type NodeDropZone = "before" | "into" | "after";
export type InterfaceLanguage = "auto" | "zh-CN" | "en";
export type ExplorerIconPosition = "before" | "after" | "hidden";
export type NodeGraphDimension = "2d" | "3d";
export type NodeGraphLayoutDirection = "left-to-right" | "top-to-bottom";

export interface NodeGraphSettings {
  enabled: boolean;
  defaultDimension: NodeGraphDimension;
  layoutDirection: NodeGraphLayoutDirection;
  largeGraphThreshold: number;
  overviewEdgeLimit: number;
}

export interface NamingPart {
  enabled: boolean;
  source: "current-file" | "current-node" | "current-heading" | "timestamp" | "custom";
  separator: string;
  customText: string;
  timestampFormat: string;
}

export interface FolderNodesSettings {
  language: InterfaceLanguage;
  homepageEnabled: boolean;
  openHomepageOnStartup: boolean;
  hiddenNodesEnabled: boolean;
  iconInheritance: boolean;
  emojiFont: EmojiFontPreference;
  explorerIconPosition: ExplorerIconPosition;
  showIconInNoteTitle: boolean;
  leafNoteExemptions: string[];
  ignoredFolders: string[];
  leafNotePrefixes: string[];
  ignoredFolderPrefixes: string[];
  addSelectionAlias: boolean;
  nodeGraph: NodeGraphSettings;
  prefix: NamingPart;
  suffix: NamingPart;
}

export interface FolderNodeHiddenState {
  explicit: boolean;
  sourcePath: string | null;
  unmanaged: boolean;
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
  exemptLeafMarkdown: string[];
  ignoredFolders: string[];
  conflicts: MigrationConflict[];
}

export interface PropertyMigrationChange {
  path: string;
  sourceFingerprint: string;
  summary: string;
}

export interface PropertyHealthFinding {
  path: string;
  messages: string[];
}

export interface PropertyMigrationScan {
  scannedNotes: number;
  canonicalPropertyNotes: number;
  legacyPropertyNotes: number;
  redundantLegacyNotes: number;
  changes: PropertyMigrationChange[];
  conflicts: PropertyHealthFinding[];
  nonCanonical: PropertyHealthFinding[];
  invalidIcons: PropertyHealthFinding[];
}

export type VisualKind = "emoji" | "glyph" | "lucide" | "image" | "color" | "fallback";

export interface NodeVisual {
  kind: VisualKind;
  value: string;
  accent: string | null;
  inheritedFrom: string | null;
}
