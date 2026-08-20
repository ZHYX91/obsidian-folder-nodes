import type { FolderNodesSettings } from "../core/types";

export const DEFAULT_SETTINGS: FolderNodesSettings = {
  adoptionState: "unadopted",
  language: "auto",
  iconInheritance: true,
  defaultNodeTemplatePath: "",
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
  return {
    ...DEFAULT_SETTINGS,
    ...input,
    language,
    prefix: { ...DEFAULT_SETTINGS.prefix, ...input.prefix },
    suffix: { ...DEFAULT_SETTINGS.suffix, ...input.suffix },
  };
}
