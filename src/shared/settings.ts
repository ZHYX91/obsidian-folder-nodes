import type { FolderNodesSettings } from "../core/types";

export const DEFAULT_SETTINGS: FolderNodesSettings = {
  adoptionState: "unadopted",
  language: "auto",
  homepageEnabled: false,
  openHomepageOnStartup: false,
  iconInheritance: true,
  explorerIconPosition: "before",
  showIconInNoteTitle: false,
  defaultNodeTemplatePath: "",
  leafNoteExemptions: ["AGENTS.md", "CLAUDE.md"],
  ignoredFolders: [],
  addSelectionAlias: true,
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
    ...DEFAULT_SETTINGS,
    ...input,
    language,
    explorerIconPosition,
    leafNoteExemptions: normalizePaths(input.leafNoteExemptions, DEFAULT_SETTINGS.leafNoteExemptions),
    ignoredFolders: normalizePaths(input.ignoredFolders, DEFAULT_SETTINGS.ignoredFolders),
    prefix: { ...DEFAULT_SETTINGS.prefix, ...input.prefix },
    suffix: { ...DEFAULT_SETTINGS.suffix, ...input.suffix },
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
