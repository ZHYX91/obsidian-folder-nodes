import type { MigrationConflict, MigrationScan } from "./types";
import { matchesFolderExemption, matchesLeafNoteExemption } from "./exemptions";
import { basename, dirname, isSameVaultName, normalizeVaultPath, sanitizeNodeName } from "./paths";

export interface VaultInventory {
  folders: readonly string[];
  markdown: readonly string[];
  files?: readonly string[];
}

export interface MigrationExemptions {
  leafMarkdown?: readonly string[];
  folders?: readonly string[];
  leafMarkdownPrefixes?: readonly string[];
  folderPrefixes?: readonly string[];
}

export function scanMigration(inventory: VaultInventory, exemptions: MigrationExemptions = {}): MigrationScan {
  const configuredFolders = (exemptions.folders ?? []).map(normalizeVaultPath).filter((path) => path !== "");
  const configuredLeafNotes = (exemptions.leafMarkdown ?? []).map(normalizeVaultPath).filter((path) => path !== "");
  const folderPrefixes = exemptions.folderPrefixes ?? [];
  const leafMarkdownPrefixes = exemptions.leafMarkdownPrefixes ?? [];
  const allFolders = new Set(inventory.folders.map(normalizeVaultPath).filter((path) => path !== ""));
  const allMarkdown = new Set(inventory.markdown.map(normalizeVaultPath).filter((path) => path !== ""));
  const allFiles = new Set((inventory.files ?? inventory.markdown).map(normalizeVaultPath).filter((path) => path !== ""));
  const fileKeys = new Set([...allFiles].map(vaultPathKey));
  const isIgnored = (path: string): boolean => matchesFolderExemption(path, configuredFolders, folderPrefixes);
  const ignoredFolders = [...allFolders].filter((path) => isIgnored(path) && !isIgnored(dirname(path))).sort();
  const folders = new Set([...allFolders].filter((path) => !isIgnored(path)));
  const folderByKey = new Map([...folders].map((path) => [vaultPathKey(path), path] as const));
  const scopedMarkdown = [...allMarkdown].filter((path) => !isIgnored(dirname(path)));
  const leafMarkdown: string[] = [];
  const exemptLeafMarkdown: string[] = [];
  const missingNodeNotes: string[] = [];
  const conflicts: MigrationConflict[] = [];
  const completedByLeafMoves = new Set<string>();
  const canonicalByFolder = new Map<string, string[]>();
  const canonicalNotes = new Set<string>();

  for (const note of scopedMarkdown) {
    const parent = dirname(note);
    const folder = folderByKey.get(vaultPathKey(parent));
    if (folder === undefined || !isSameVaultName(basename(note).slice(0, -3), basename(folder))) continue;
    const folderKey = vaultPathKey(folder);
    const canonical = canonicalByFolder.get(folderKey) ?? [];
    canonical.push(note);
    canonicalByFolder.set(folderKey, canonical);
    canonicalNotes.add(note);
  }

  for (const folder of folders) {
    const canonical = canonicalByFolder.get(vaultPathKey(folder)) ?? [];
    if (canonical.length === 0) missingNodeNotes.push(folder);
    else if (canonical.length > 1) conflicts.push({ path: folder, reason: `Multiple canonical Node Notes: ${canonical.join(", ")}` });
  }
  for (const note of scopedMarkdown) {
    if (canonicalNotes.has(note)) continue;
    if (matchesLeafNoteExemption(note, configuredLeafNotes, leafMarkdownPrefixes)) {
      exemptLeafMarkdown.push(note);
      continue;
    }
    const parent = dirname(note);
    const name = sanitizeNodeName(basename(note).slice(0, -3));
    const targetFolder = parent === "" ? name : `${parent}/${name}`;
    const targetFile = `${targetFolder}/${name}.md`;
    const existingFolder = folderByKey.get(vaultPathKey(targetFolder));
    if (fileKeys.has(vaultPathKey(targetFolder))) {
      conflicts.push({ path: note, reason: `Target folder path is occupied by a file: ${targetFolder}` });
    } else if (isIgnored(existingFolder ?? targetFolder)) {
      conflicts.push({ path: note, reason: `Target belongs to an unmanaged folder: ${targetFolder}` });
    } else if (existingFolder !== undefined && existingFolder !== targetFolder) {
      conflicts.push({ path: note, reason: `Target folder differs only by case: ${existingFolder}` });
    } else if ((canonicalByFolder.get(vaultPathKey(targetFolder))?.length ?? 0) > 0) {
      conflicts.push({ path: note, reason: `Target node already exists: ${targetFile}` });
    } else {
      leafMarkdown.push(note);
      if (existingFolder !== undefined) completedByLeafMoves.add(existingFolder);
    }
  }
  return {
    conflicts: conflicts.sort((a, b) => a.path.localeCompare(b.path)),
    exemptLeafMarkdown: exemptLeafMarkdown.sort(),
    ignoredFolders,
    leafMarkdown: leafMarkdown.sort(),
    missingNodeNotes: missingNodeNotes.filter((path) => !completedByLeafMoves.has(path)).sort(),
  };
}

export async function scanMigrationAsync(
  inventory: VaultInventory,
  exemptions: MigrationExemptions = {},
  onProgress?: (completed: number, total: number) => void,
  signal?: AbortSignal,
): Promise<MigrationScan> {
  const configuredFolders = (exemptions.folders ?? []).map(normalizeVaultPath).filter((path) => path !== "");
  const configuredLeafNotes = (exemptions.leafMarkdown ?? []).map(normalizeVaultPath).filter((path) => path !== "");
  const folderPrefixes = exemptions.folderPrefixes ?? [];
  const leafMarkdownPrefixes = exemptions.leafMarkdownPrefixes ?? [];
  const files = inventory.files ?? inventory.markdown;
  const total = inventory.folders.length * 3 + inventory.markdown.length * 3 + files.length;
  let completed = 0;
  const checkpoint = async (): Promise<void> => {
    completed += 1;
    if (completed % 512 !== 0 && completed !== total) return;
    throwIfScanAborted(signal);
    onProgress?.(completed, Math.max(1, total));
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
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
  const folderByKey = new Map([...folders].map((path) => [vaultPathKey(path), path] as const));
  const fileKeys = new Set([...allFiles].map(vaultPathKey));
  const scopedMarkdown: string[] = [];
  const exemptLeafMarkdown: string[] = [];
  const canonicalNotes = new Set<string>();
  const canonicalByFolder = new Map<string, string[]>();
  for (const path of allMarkdown) {
    if (!isIgnored(dirname(path))) {
      scopedMarkdown.push(path);
      const parent = dirname(path);
      const folder = folderByKey.get(vaultPathKey(parent));
      if (folder !== undefined && isSameVaultName(basename(path).slice(0, -3), basename(folder))) {
        const folderKey = vaultPathKey(folder);
        const canonical = canonicalByFolder.get(folderKey) ?? [];
        canonical.push(path);
        canonicalByFolder.set(folderKey, canonical);
        canonicalNotes.add(path);
      }
    }
    await checkpoint();
  }
  const missingNodeNotes: string[] = [];
  const conflicts: MigrationConflict[] = [];
  const completedByLeafMoves = new Set<string>();
  for (const folder of folders) {
    const canonical = canonicalByFolder.get(vaultPathKey(folder)) ?? [];
    if (canonical.length === 0) missingNodeNotes.push(folder);
    else if (canonical.length > 1) conflicts.push({ path: folder, reason: `Multiple canonical Node Notes: ${canonical.join(", ")}` });
    await checkpoint();
  }
  const leafMarkdown: string[] = [];
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
    const targetFile = `${targetFolder}/${name}.md`;
    const existingFolder = folderByKey.get(vaultPathKey(targetFolder));
    if (fileKeys.has(vaultPathKey(targetFolder))) conflicts.push({ path: note, reason: `Target folder path is occupied by a file: ${targetFolder}` });
    else if (isIgnored(existingFolder ?? targetFolder)) conflicts.push({ path: note, reason: `Target belongs to an unmanaged folder: ${targetFolder}` });
    else if (existingFolder !== undefined && existingFolder !== targetFolder) conflicts.push({ path: note, reason: `Target folder differs only by case: ${existingFolder}` });
    else if ((canonicalByFolder.get(vaultPathKey(targetFolder))?.length ?? 0) > 0) conflicts.push({ path: note, reason: `Target node already exists: ${targetFile}` });
    else {
      leafMarkdown.push(note);
      if (existingFolder !== undefined) completedByLeafMoves.add(existingFolder);
    }
    await checkpoint();
  }
  throwIfScanAborted(signal);
  onProgress?.(Math.max(1, total), Math.max(1, total));
  throwIfScanAborted(signal);
  return {
    conflicts: conflicts.sort((a, b) => a.path.localeCompare(b.path)),
    exemptLeafMarkdown: exemptLeafMarkdown.sort(),
    ignoredFolders: ignoredFolders.sort(),
    leafMarkdown: leafMarkdown.sort(),
    missingNodeNotes: missingNodeNotes.filter((path) => !completedByLeafMoves.has(path)).sort(),
  };
}

function throwIfScanAborted(signal?: AbortSignal): void {
  if (signal?.aborted !== true) return;
  throw signal.reason instanceof Error ? signal.reason : new Error("Folder Nodes operation cancelled");
}

function vaultPathKey(path: string): string {
  return normalizeVaultPath(path).normalize("NFC").toLocaleLowerCase();
}
