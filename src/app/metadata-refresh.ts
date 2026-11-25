import {
  FOLDER_NODES_PROPERTY,
  ICON_PROPERTY,
  LEGACY_FOLDER_NODES_PROPERTIES,
} from "../core/properties";
import { TFolder, type MetadataCache, type TAbstractFile } from "obsidian";
import type { ReferenceIndex } from "../core/reference-index";

export function registerFolderNodesMetadataEvents(
  cache: MetadataCache,
  fingerprints: Map<string, string>,
  references: ReferenceIndex,
  refresh: (path: string, reason: "metadata" | "reference") => void,
): ReturnType<MetadataCache["on"]>[] {
  return [
    cache.on("changed", (file) => {
      const next = folderNodesMetadataFingerprint(cache.getFileCache(file)?.frontmatter);
      const previous = fingerprints.get(file.path);
      fingerprints.set(file.path, next);
      if (previous !== next) refresh(file.path, "metadata");
    }),
    cache.on("resolve", (file) => {
      const affected = references.updateSource(file.path, cache.resolvedLinks[file.path] ?? {});
      if (affected.size > 0) refresh(file.path, "reference");
      for (const path of affected) refresh(path, "reference");
    }),
  ];
}

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

export function moveFolderNodesReferences(
  index: ReferenceIndex, entry: TAbstractFile, oldPath: string, resolved: MetadataCache["resolvedLinks"],
): Set<string> {
  const affected = index.removeSource(oldPath, entry instanceof TFolder);
  const pending = [entry];
  while (pending.length > 0) {
    const moved = pending.pop()!;
    if (moved instanceof TFolder) {
      for (const child of moved.children) pending.push(child);
    } else {
      // A previously unresolved relative link may first acquire a target here.
      const targets = resolved[moved.path];
      if (targets === undefined) continue;
      for (const path of index.updateSource(moved.path, targets)) affected.add(path);
    }
  }
  return affected;
}
