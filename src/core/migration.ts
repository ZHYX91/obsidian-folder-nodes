import type { MigrationConflict, MigrationScan } from "./types";
import { matchesFolderExemption, matchesLeafNoteExemption } from "./exemptions";
import { basename, dirname, nodeNotePath, normalizeVaultPath } from "./paths";

export interface VaultInventory {
  folders: readonly string[];
  markdown: readonly string[];
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
  const isIgnored = (path: string): boolean => matchesFolderExemption(path, configuredFolders, folderPrefixes);
  const ignoredFolders = [...allFolders].filter((path) => isIgnored(path) && !isIgnored(dirname(path))).sort();
  const folders = new Set([...allFolders].filter((path) => !isIgnored(path)));
  const markdown = new Set([...allMarkdown].filter((path) => !isIgnored(dirname(path)) && !matchesLeafNoteExemption(path, configuredLeafNotes, leafMarkdownPrefixes)));
  const exemptLeafMarkdown = [...allMarkdown]
    .filter((path) => !isIgnored(dirname(path)) && matchesLeafNoteExemption(path, configuredLeafNotes, leafMarkdownPrefixes))
    .sort();
  const leafMarkdown: string[] = [];
  const missingNodeNotes: string[] = [];
  const conflicts: MigrationConflict[] = [];

  for (const folder of folders) {
    const note = nodeNotePath(folder);
    if (note !== "" && !markdown.has(note)) missingNodeNotes.push(folder);
  }
  for (const note of markdown) {
    const parent = dirname(note);
    if (nodeNotePath(parent) === note) continue;
    const name = basename(note).slice(0, -3);
    const targetFolder = parent === "" ? name : `${parent}/${name}`;
    const targetNote = `${targetFolder}/${name}.md`;
    if (isIgnored(targetFolder)) {
      conflicts.push({ path: note, reason: `Target belongs to an unmanaged folder: ${targetFolder}` });
    } else if (folders.has(targetFolder) && markdown.has(targetNote)) {
      conflicts.push({ path: note, reason: `Target node already exists: ${targetNote}` });
    } else {
      leafMarkdown.push(note);
    }
  }
  return {
    conflicts: conflicts.sort((a, b) => a.path.localeCompare(b.path)),
    exemptLeafMarkdown,
    ignoredFolders,
    leafMarkdown: leafMarkdown.sort(),
    missingNodeNotes: missingNodeNotes.sort(),
  };
}
