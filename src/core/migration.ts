import type { LeafMove, MigrationConflict, MigrationScan } from "./types";
import { SiblingPathIndex } from "./sibling-path-index";
import { resolveLeafTarget } from "./leaf-target";
import { matchesFolderExemption, matchesLeafNoteExemption } from "./exemptions";
import { basename, dirname, isSameVaultName, nodeNotePath, normalizeVaultPath, sanitizeNodeName } from "./paths";

const SCAN_SLICE_MS = 8;

export interface VaultInventory {
  folders: readonly string[];
  markdown: readonly string[];
  files?: readonly string[];
  rootNotePath?: string;
  configDir?: string;
}

export interface MigrationExemptions {
  leafMarkdown?: readonly string[];
  folders?: readonly string[];
  leafMarkdownPrefixes?: readonly string[];
  folderPrefixes?: readonly string[];
}

export async function scanMigrationAsync(
  inventory: VaultInventory,
  exemptions: MigrationExemptions = {},
  onProgress?: (completed: number, total: number) => void,
  signal?: AbortSignal,
): Promise<MigrationScan> {
  const configuredFolders = (exemptions.folders ?? []).map(normalizeVaultPath).filter((path) => path !== "");
  if (inventory.configDir) configuredFolders.push(normalizeVaultPath(inventory.configDir));
  const configuredLeafNotes = (exemptions.leafMarkdown ?? []).map(normalizeVaultPath).filter((path) => path !== "");
  const folderPrefixes = exemptions.folderPrefixes ?? [];
  const leafMarkdownPrefixes = exemptions.leafMarkdownPrefixes ?? [];
  const files = inventory.files ?? inventory.markdown;
  const total = inventory.folders.length * 3 + inventory.markdown.length * 3 + files.length + (inventory.rootNotePath === undefined ? 0 : 1);
  let completed = 0;
  let nextYieldAt = 0;
  const checkpoint = async (): Promise<void> => {
    completed += 1;
    if (completed % 512 !== 0 && completed !== total) return;
    throwIfScanAborted(signal);
    onProgress?.(completed, Math.max(1, total));
    // Keep progress checkpoints frequent without paying for a host timer at every checkpoint.
    if (performance.now() < nextYieldAt) return;
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    throwIfScanAborted(signal);
    nextYieldAt = performance.now() + SCAN_SLICE_MS;
  };
  const allFolders = new Set<string>();
  const allMarkdown = new Set<string>();
  const allFiles = new Set<string>();
  for (const path of inventory.folders) { const normalized = normalizeVaultPath(path); if (normalized !== "") allFolders.add(normalized); await checkpoint(); }
  for (const path of inventory.markdown) { const normalized = normalizeVaultPath(path); if (normalized !== "") allMarkdown.add(normalized); await checkpoint(); }
  for (const path of files) { const normalized = normalizeVaultPath(path); if (normalized !== "") allFiles.add(normalized); await checkpoint(); }
  const isIgnored = (path: string): boolean => matchesFolderExemption(path, configuredFolders, folderPrefixes);
  const ignoredFolders: string[] = [];
  const folders = new Set<string>();
  for (const path of allFolders) {
    const ignored = isIgnored(path);
    if (ignored && !isIgnored(dirname(path))) ignoredFolders.push(path);
    if (!ignored) folders.add(path);
    await checkpoint();
  }
  if (inventory.rootNotePath !== undefined) folders.add("");
  const rootBasename = inventory.rootNotePath?.slice(0, -3);
  // The host can omit its configuration directory from the loaded entries.
  if (inventory.configDir) allFolders.add(normalizeVaultPath(inventory.configDir));
  const foldersByKey = new SiblingPathIndex<string[]>();
  for (const path of allFolders) {
    const siblings = foldersByKey.get(path);
    if (siblings === undefined) foldersByKey.set(path, [path]);
    else siblings.push(path);
  }
  const fileKeys = new SiblingPathIndex<true>();
  for (const path of allFiles) fileKeys.set(path, true);
  const scopedMarkdown: string[] = [];
  const exemptLeafMarkdown: string[] = [];
  const canonicalNotes = new Set<string>();
  const canonicalByFolder = new Map<string, string[]>();
  for (const path of allMarkdown) {
    if (!isIgnored(dirname(path))) {
      scopedMarkdown.push(path);
      const parent = dirname(path);
      const expectedName = parent === "" ? rootBasename : basename(parent);
      if (folders.has(parent) && expectedName !== undefined && isSameVaultName(basename(path).slice(0, -3), expectedName)) {
        const canonical = canonicalByFolder.get(parent) ?? [];
        canonical.push(path);
        canonicalByFolder.set(parent, canonical);
        canonicalNotes.add(path);
      }
    }
    await checkpoint();
  }
  const missingNodeNotes: string[] = [];
  const conflicts: MigrationConflict[] = [];
  const requiredNotePaths = new SiblingPathIndex<true>();
  const completedByLeafMoves = new Set<string>();
  const plannedExisting = new Map<string, LeafMove[]>();
  const plannedNew = new SiblingPathIndex<LeafMove[]>();
  for (const folder of folders) {
    const canonical = canonicalByFolder.get(folder) ?? [];
    if (canonical.length === 0) {
      const notePath = folder === "" ? inventory.rootNotePath! : nodeNotePath(folder);
      requiredNotePaths.set(notePath, true);
      const occupant = foldersByKey.get(notePath)?.[0];
      if (occupant === undefined) missingNodeNotes.push(folder);
      else conflicts.push({ path: folder, reason: `Node Note path is occupied by a folder: ${occupant}` });
    } else if (canonical.length > 1) {
      const label = folder === "" ? "Root" : "canonical";
      conflicts.push({ path: folder, reason: `Multiple ${label} Node Notes: ${canonical.join(", ")}` });
    }
    await checkpoint();
  }
  const leafMoves: LeafMove[] = [];
  for (const note of scopedMarkdown) {
    if (canonicalNotes.has(note)) { await checkpoint(); continue; }
    if (matchesLeafNoteExemption(note, configuredLeafNotes, leafMarkdownPrefixes)) {
      exemptLeafMarkdown.push(note);
      await checkpoint();
      continue;
    }
    const parent = dirname(note);
    const name = sanitizeNodeName(basename(note).slice(0, -3));
    const targetFolder = parent === "" ? name : `${parent}/${name}`;
    const matchingFolders = foldersByKey.get(targetFolder) ?? [];
    const target = resolveLeafTarget(note, matchingFolders);
    if (fileKeys.has(targetFolder)) conflicts.push({ path: note, reason: `Target folder path is occupied by a file: ${targetFolder}` });
    else if (isIgnored(target?.folderPath ?? targetFolder)) conflicts.push({ path: note, reason: `Target belongs to an unmanaged folder: ${targetFolder}` });
    else if (requiredNotePaths.has(targetFolder)) conflicts.push({ path: note, reason: `Target folder path is required for a Node Note: ${targetFolder}` });
    else if (target === null) conflicts.push({ path: note, reason: `Target folder differs only by case: ${[...matchingFolders].sort().join(", ")}` });
    else if (foldersByKey.has(target.notePath)) conflicts.push({ path: note, reason: `Target Node Note path is occupied by a folder: ${target.notePath}` });
    else if (canonicalByFolder.has(target.folderPath)) conflicts.push({ path: note, reason: `Target node already exists: ${target.notePath}` });
    else {
      const plannedTargets = target.existing ? plannedExisting : plannedNew;
      const move = { sourcePath: note, targetPath: target.notePath, existingFolder: target.existing };
      const planned = plannedTargets.get(target.folderPath);
      if (planned === undefined) plannedTargets.set(target.folderPath, [move]);
      else planned.push(move);
    }
    await checkpoint();
  }
  for (const planned of [...plannedExisting.values(), ...plannedNew.values()]) {
    if (planned.length === 1) {
      const move = planned[0]!;
      leafMoves.push(move);
      completedByLeafMoves.add(dirname(move.targetPath));
    } else {
      for (const move of planned) conflicts.push({ path: move.sourcePath, reason: `Multiple leaf notes resolve to the same target: ${move.targetPath}` });
    }
  }
  throwIfScanAborted(signal);
  onProgress?.(Math.max(1, total), Math.max(1, total));
  throwIfScanAborted(signal);
  return {
    conflicts: conflicts.sort((a, b) => a.path.localeCompare(b.path)),
    exemptLeafMarkdown: exemptLeafMarkdown.sort(),
    ignoredFolders: ignoredFolders.sort(),
    leafMoves: leafMoves.sort((a, b) => a.sourcePath < b.sourcePath ? -1 : a.sourcePath > b.sourcePath ? 1 : 0),
    missingNodeNotes: missingNodeNotes.filter((path) => !completedByLeafMoves.has(path)).sort(),
  };
}

function throwIfScanAborted(signal?: AbortSignal): void {
  if (signal?.aborted !== true) return;
  throw signal.reason instanceof Error ? signal.reason : new Error("Folder Nodes operation cancelled");
}
