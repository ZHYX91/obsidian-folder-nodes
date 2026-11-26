import "../setup/obsidian-dom";
import type { App } from "obsidian";

import type { MigrationScan, PropertyMigrationScan } from "../../src/core/types";
import { setLanguage } from "../../src/ui/i18n";
import { MigrationModal } from "../../src/ui/migration-modal";
import { PropertyMigrationModal } from "../../src/ui/property-migration-modal";

let writes = 0;

function openMigrationPreview(kind: "structure" | "property" | "health", count: number, language: "en" | "ar"): void {
  document.body.replaceChildren();
  setLanguage(language);
  writes = 0;
  const path = (index: number): string => `Notes/${index === 500 ? "Archive".repeat(24) + "/" : ""}Topic-${String(index + 1).padStart(4, "0")}.md`;
  const moves: MigrationScan = {
    leafMoves: Array.from({ length: count }, (_, index) => ({ sourcePath: path(index), targetPath: `Folder/${path(index)}`, existingFolder: true })),
    missingNodeNotes: [], exemptLeafMarkdown: [], ignoredFolders: [], conflicts: [],
  };
  const properties: PropertyMigrationScan = {
    scannedNotes: count, canonicalPropertyNotes: 0, legacyPropertyNotes: count, redundantLegacyNotes: 0,
    changes: Array.from({ length: count }, (_, index) => ({ path: path(index), sourceFingerprint: String(index), summary: "rank → folder-nodes" })),
    conflicts: [], nonCanonical: [], invalidIcons: [],
  };
  const onCommit = async (): Promise<void> => { writes += 1; };
  const app = {} as App;
  const modal = kind === "structure" ? new MigrationModal(app, moves, onCommit)
    : new PropertyMigrationModal(app, properties, onCommit, kind === "health");
  modal.open();
}

Object.assign(window, { openMigrationPreview, migrationPreviewWrites: () => writes });
