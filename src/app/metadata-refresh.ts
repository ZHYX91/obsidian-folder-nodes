import {
  FOLDER_NODES_PROPERTY,
  ICON_PROPERTY,
  LEGACY_FOLDER_NODES_PROPERTIES,
} from "../core/properties";

const RELEVANT_KEYS = [FOLDER_NODES_PROPERTY, ...LEGACY_FOLDER_NODES_PROPERTIES, ICON_PROPERTY] as const;

/**
 * Fingerprint only metadata that can change Folder Nodes structure/visibility/order or visuals.
 * Ordinary body edits and unrelated frontmatter must not trigger Explorer decoration work.
 */
export function folderNodesMetadataFingerprint(
  frontmatter: Readonly<Record<string, unknown>> | null | undefined,
): string {
  const record = frontmatter ?? {};
  return JSON.stringify(RELEVANT_KEYS.map((key) => [
    key,
    Object.prototype.hasOwnProperty.call(record, key),
    stableValue(record[key]),
  ]));
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (typeof value === "object" && value !== null) {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => [key, stableValue((value as Record<string, unknown>)[key])]);
  }
  if (typeof value === "number" && !Number.isFinite(value)) return String(value);
  return value;
}
