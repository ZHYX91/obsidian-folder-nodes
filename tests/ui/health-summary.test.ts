import type { App } from "obsidian";
import { expect, it } from "vitest";
import type { MigrationScan, PropertyMigrationScan } from "../../src/core/types";
import { t } from "../../src/ui/i18n";
import { MigrationModal } from "../../src/ui/migration-modal";
import { PropertyMigrationModal } from "../../src/ui/property-migration-modal";

const app = { vault: { getName: () => "Vault" } } as App;
const structure: MigrationScan = {
  leafMoves: [{ sourcePath: "Inbox.md", targetPath: "Inbox/Inbox.md", existingFolder: true }], missingNodeNotes: ["", "Projects"], exemptLeafMarkdown: [], ignoredFolders: [], conflicts: [],
};
const properties: PropertyMigrationScan = {
  scannedNotes: 1, canonicalPropertyNotes: 0, legacyPropertyNotes: 0, redundantLegacyNotes: 0,
  changes: [], conflicts: [], nonCanonical: [], invalidIcons: [],
};

it("describes current files and folders in both read-only health views", () => {
  for (const modal of [new MigrationModal(app, structure, async () => {}, true),
    new PropertyMigrationModal(app, properties, async () => {}, true, structure)]) {
    modal.onOpen();
    const [notes, folders] = modal.contentEl.querySelectorAll("details");
    expect(notes?.querySelector("summary")?.textContent).toBe(`${t("leafMarkdown")} (1)`);
    expect(notes?.querySelector("code")?.textContent).toBe("Inbox.md");
    expect(folders?.querySelector("summary")?.textContent).toBe(`${t("foldersMissingNodeNotes")} (2)`);
    expect(Array.from(folders!.querySelectorAll("code"), (item) => item.textContent)).toEqual(["/", "Projects"]);
  }
});

it("keeps the action headings and target note paths in the organization preview", () => {
  const move = { sourcePath: "Cafe\u0301.md", targetPath: "Cafe\u0301/Cafe\u0301.md", existingFolder: true };
  const modal = new MigrationModal(app, { ...structure, leafMoves: [move] }, async () => {});
  modal.onOpen();
  const [notes, folders] = modal.contentEl.querySelectorAll("details");
  expect(notes?.querySelector("summary")?.textContent).toBe(`${t("moveLeafNotes")} (1)`);
  expect(notes?.querySelector("code")?.textContent).toBe(`${move.sourcePath} → ${move.targetPath}`);
  expect(folders?.querySelector("summary")?.textContent).toBe(`${t("createNodeNotes")} (2)`);
  expect(Array.from(folders!.querySelectorAll("code"), (item) => item.textContent)).toEqual(["Vault.md", "Projects/Projects.md"]);
});
