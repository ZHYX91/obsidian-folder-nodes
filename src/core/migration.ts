import type { MigrationConflict, MigrationScan } from "./types";
import { basename, dirname, nodeNotePath, normalizeVaultPath } from "./paths";

export interface VaultInventory {
  folders: readonly string[];
  markdown: readonly string[];
}

export function scanMigration(inventory: VaultInventory): MigrationScan {
  const folders = new Set(inventory.folders.map(normalizeVaultPath));
  const markdown = new Set(inventory.markdown.map(normalizeVaultPath));
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
    if (folders.has(targetFolder) && markdown.has(targetNote)) {
      conflicts.push({ path: note, reason: `Target node already exists: ${targetNote}` });
    } else {
      leafMarkdown.push(note);
    }
  }
  return {
    conflicts: conflicts.sort((a, b) => a.path.localeCompare(b.path)),
    leafMarkdown: leafMarkdown.sort(),
    missingNodeNotes: missingNodeNotes.sort(),
  };
}
