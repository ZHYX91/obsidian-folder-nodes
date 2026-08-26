import { expect, it } from "vitest";

import { scanMigration } from "../src/core/migration";

it("scans a large complete Folder Node inventory in near-linear time", () => {
  const size = import.meta.env.MODE === "large" ? 100_000 : 20_000;
  const folders = Array.from({ length: size }, (_, index) => `Node-${index}`);
  const markdown = folders.map((folder) => `${folder}/${folder}.md`);
  const started = performance.now();

  const scan = scanMigration({ folders, markdown });

  expect(scan.conflicts).toEqual([]);
  expect(scan.leafMarkdown).toEqual([]);
  expect(scan.missingNodeNotes).toEqual([]);
  expect(performance.now() - started).toBeLessThan(import.meta.env.MODE === "large" ? 10_000 : 2_000);
});
