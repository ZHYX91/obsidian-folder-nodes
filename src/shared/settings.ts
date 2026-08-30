import { isEmojiFontPreference } from "../core/emoji-font";
import type { FolderNodesSettings, NamingPart, NodeGraphSettings } from "../core/types";

export const DEFAULT_NODE_GRAPH_SETTINGS: NodeGraphSettings = {
  enabled: true,
  defaultDimension: "2d",
  defaultRelationMode: "structure",
  includedSubtrees: [],
  excludedNodes: [],
  excludedSubtrees: [],
  localDepth: 2,
  showBoundaryNodes: false,
  largeGraphThreshold: 500,
  overviewEdgeLimit: 6_000,
};

export const DEFAULT_SETTINGS: FolderNodesSettings = {
  language: "auto",
  homepageEnabled: false,
  openHomepageOnStartup: false,
  iconInheritance: true,
  emojiFont: "system",
  explorerIconPosition: "before",
  showIconInNoteTitle: false,
  leafNoteExemptions: ["AGENTS.md", "CLAUDE.md"],
  ignoredFolders: [],
  leafNotePrefixes: [".", "_"],
  ignoredFolderPrefixes: [".", "_"],
  addSelectionAlias: true,
  nodeGraph: structuredClone(DEFAULT_NODE_GRAPH_SETTINGS),
  prefix: {
    enabled: false,
    source: "current-file",
    separator: "_",
    customText: "",
  },
  suffix: {
    enabled: false,
    source: "timestamp",
    separator: "_",
    customText: "",
  },
  timestampFormat: "%Y%m%d-%H%M%S",
};

export function normalizeSettings(value: unknown): FolderNodesSettings {
  const input = typeof value === "object" && value !== null ? value as Partial<FolderNodesSettings> : {};
  const language = input.language === "zh-CN" || input.language === "en" ? input.language : "auto";
  const explorerIconPosition = input.explorerIconPosition === "after" || input.explorerIconPosition === "hidden"
    ? input.explorerIconPosition
    : "before";
  return {
    language,
    homepageEnabled: input.homepageEnabled === true,
    openHomepageOnStartup: input.openHomepageOnStartup === true,
    iconInheritance: input.iconInheritance !== false,
    emojiFont: isEmojiFontPreference(input.emojiFont) ? input.emojiFont : "system",
    explorerIconPosition,
    showIconInNoteTitle: input.showIconInNoteTitle === true,
    leafNoteExemptions: normalizePaths(input.leafNoteExemptions, DEFAULT_SETTINGS.leafNoteExemptions),
    ignoredFolders: normalizePaths(input.ignoredFolders, DEFAULT_SETTINGS.ignoredFolders),
    leafNotePrefixes: normalizePrefixes(input.leafNotePrefixes, DEFAULT_SETTINGS.leafNotePrefixes),
    ignoredFolderPrefixes: normalizePrefixes(input.ignoredFolderPrefixes, DEFAULT_SETTINGS.ignoredFolderPrefixes),
    addSelectionAlias: input.addSelectionAlias !== false,
    nodeGraph: normalizeNodeGraphSettings(input.nodeGraph),
    prefix: normalizeNamingPart(input.prefix, DEFAULT_SETTINGS.prefix),
    suffix: normalizeNamingPart(input.suffix, DEFAULT_SETTINGS.suffix),
    timestampFormat: typeof input.timestampFormat === "string" ? input.timestampFormat : DEFAULT_SETTINGS.timestampFormat,
  };
}

function normalizeNodeGraphSettings(value: unknown): NodeGraphSettings {
  const input = typeof value === "object" && value !== null ? value as Partial<NodeGraphSettings> : {};
  return {
    enabled: input.enabled !== false,
    defaultDimension: input.defaultDimension === "3d" ? "3d" : "2d",
    defaultRelationMode: input.defaultRelationMode === "links" || input.defaultRelationMode === "hybrid"
      ? input.defaultRelationMode
      : "structure",
    includedSubtrees: normalizePaths(input.includedSubtrees, DEFAULT_NODE_GRAPH_SETTINGS.includedSubtrees),
    excludedNodes: normalizePaths(input.excludedNodes, DEFAULT_NODE_GRAPH_SETTINGS.excludedNodes),
    excludedSubtrees: normalizePaths(input.excludedSubtrees, DEFAULT_NODE_GRAPH_SETTINGS.excludedSubtrees),
    localDepth: normalizeInteger(input.localDepth, 1, 8, DEFAULT_NODE_GRAPH_SETTINGS.localDepth),
    showBoundaryNodes: input.showBoundaryNodes === true,
    largeGraphThreshold: normalizeInteger(input.largeGraphThreshold, 50, 10_000, DEFAULT_NODE_GRAPH_SETTINGS.largeGraphThreshold),
    overviewEdgeLimit: normalizeInteger(input.overviewEdgeLimit, 100, 100_000, DEFAULT_NODE_GRAPH_SETTINGS.overviewEdgeLimit),
  };
}

function normalizeInteger(value: unknown, minimum: number, maximum: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(minimum, Math.min(maximum, Math.round(value)))
    : fallback;
}

function normalizeNamingPart(value: unknown, fallback: NamingPart): NamingPart {
  const input = typeof value === "object" && value !== null ? value as Partial<NamingPart> : {};
  const source = input.source === "current-file" || input.source === "current-node" || input.source === "current-heading" ||
    input.source === "timestamp" || input.source === "custom" ? input.source : fallback.source;
  return {
    enabled: input.enabled === true,
    source,
    separator: typeof input.separator === "string" ? input.separator : fallback.separator,
    customText: typeof input.customText === "string" ? input.customText : fallback.customText,
  };
}

function normalizePaths(value: unknown, fallback: readonly string[]): string[] {
  const input = Array.isArray(value) ? value : fallback;
  return [...new Set(input.flatMap((path) => {
    if (typeof path !== "string") return [];
    const normalized = path.trim().replaceAll("\\", "/").replace(/^\/+|\/+$/gu, "");
    return normalized === "" ? [] : [normalized];
  }))].sort((a, b) => a.localeCompare(b));
}

function compareText(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }

function normalizePrefixes(value: unknown, fallback: readonly string[]): string[] {
  const input = Array.isArray(value) ? value : fallback;
  return [...new Set(input.flatMap((prefix) => {
    if (typeof prefix !== "string") return [];
    const normalized = prefix.trim();
    return normalized === "" || normalized.includes("/") || normalized.includes("\\") ? [] : [normalized];
  }))].sort(compareText);
}
