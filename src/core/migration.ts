import type { MigrationConflict, MigrationScan } from "./types";
import { basename, dirname, nodeNotePath, normalizeVaultPath } from "./paths";

export interface VaultInventory {
  folders: readonly string[];
  markdown: readonly string[];
}

export interface MigrationExemptions {
  leafMarkdown?: readonly string[];
  folders?: readonly string[];
}

export function scanMigration(inventory: VaultInventory, exemptions: MigrationExemptions = {}): MigrationScan {
  const configuredFolders = new Set((exemptions.folders ?? []).map(normalizeVaultPath).filter((path) => path !== ""));
  const configuredLeafNotes = new Set((exemptions.leafMarkdown ?? []).map(normalizeVaultPath).filter((path) => path !== ""));
  const allFolders = new Set(inventory.folders.map(normalizeVaultPath));
  const allMarkdown = new Set(inventory.markdown.map(normalizeVaultPath));
  const ignoredFolders = [...configuredFolders].filter((path) => allFolders.has(path)).sort();
  const isIgnored = (path: string): boolean => [...configuredFolders].some((folder) => path === folder || path.startsWith(`${folder}/`));
  const folders = new Set([...allFolders].filter((path) => !isIgnored(path)));
  const markdown = new Set([...allMarkdown].filter((path) => !isIgnored(path) && !configuredLeafNotes.has(path)));
  const exemptLeafMarkdown = [...configuredLeafNotes].filter((path) => allMarkdown.has(path) && !isIgnored(path)).sort();
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
