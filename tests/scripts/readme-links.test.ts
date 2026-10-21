import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

// @ts-expect-error The documentation checker is an executable ESM module.
import { assertReadmeRepositoryLinks } from "../../scripts/check-readme-i18n.mjs";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("offline README link validation", () => {
  it("resolves canonical main URLs and translated relative links against this checkout", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "folder-nodes-readme-"));
    roots.push(root);
    await mkdir(path.join(root, "docs/i18n"), { recursive: true });
    await writeFile(path.join(root, "README.md"), "# Folder Nodes\n");
    await writeFile(path.join(root, "docs/i18n/README.zh-CN.md"), "# Folder Nodes\n");
    await expect(assertReadmeRepositoryLinks(root, "README.md", "[中文](https://github.com/ZHYX91/obsidian-folder-nodes/blob/main/docs/i18n/README.zh-CN.md)")).resolves.toBeUndefined();
    await expect(assertReadmeRepositoryLinks(root, "docs/i18n/README.zh-CN.md", "[English](../../README.md)")).resolves.toBeUndefined();
    await expect(assertReadmeRepositoryLinks(root, "README.md", "[Missing](https://github.com/ZHYX91/obsidian-folder-nodes/blob/main/docs/i18n/README.missing.md)")).rejects.toThrow("missing local repository file");
  });

  it("rejects root-relative repository links and links outside the checkout", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "folder-nodes-readme-"));
    roots.push(root);
    await expect(assertReadmeRepositoryLinks(root, "README.md", "[English](README.md)")).rejects.toThrow("canonical repository URLs");
    await expect(assertReadmeRepositoryLinks(root, "docs/i18n/README.zh-CN.md", "[Outside](../../../other.md)")).rejects.toThrow("escapes the checkout");
  });
});
