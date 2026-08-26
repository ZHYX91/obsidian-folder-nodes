import { isEmojiFontPreference } from "../core/emoji-font";
import type { FolderNodesSettings, NamingPart } from "../core/types";

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
    prefix: normalizeNamingPart(input.prefix, DEFAULT_SETTINGS.prefix),
    suffix: normalizeNamingPart(input.suffix, DEFAULT_SETTINGS.suffix),
    timestampFormat: typeof input.timestampFormat === "string" ? input.timestampFormat : DEFAULT_SETTINGS.timestampFormat,
  };
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
