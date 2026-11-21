import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { NodeService } from "../../src/adapters/node-service";
import { DEFAULT_SETTINGS } from "../../src/shared/settings";
import { FakeObsidian } from "../helpers/fake-obsidian";

function diskVault() {
  const root = mkdtempSync(join(tmpdir(), "folder-nodes-paths-"));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  const disk = (path: string): string => join(root, path);
  const fake = new FakeObsidian();
  function addFile(path: string, content: string) {
    writeFileSync(disk(path), content, { flag: "wx" });
    return fake.addFile(path, content);
  }
  fake.app.vault.adapter.exists = async (path, sensitive) => {
    if (!existsSync(disk(path))) return false;
    if (!sensitive) return true;
    const parts = path.split("/");
    return parts.every((part, index) => readdirSync(join(root, ...parts.slice(0, index))).includes(part));
  };
  fake.app.vault.read = async (file) => readFileSync(disk(file.path), "utf8");
  fake.app.fileManager.renameFile = async (file, target) => {
    renameSync(disk(file.path), disk(target));
    await fake.rename(file, target);
  };
  addFile("Vault.md", "root");
  const nodes = new NodeService(fake.app, () => structuredClone(DEFAULT_SETTINGS));
  return { root, disk, fake, addFile, nodes };
}

it.for([["Case", "case"], ["Café", "Cafe\u0301"]] as const)(
  "moves each original file into its distinct physical folder (%s, %s)", async ([first, second], context) => {
    const { disk, fake, addFile, nodes } = diskVault();
    mkdirSync(disk(first));
    if (existsSync(disk(second))) context.skip("This volume resolves both folder spellings to one entry");
    mkdirSync(disk(second));
    const sources = [first, second].map((name, index) => {
      const folder = fake.addFolder(name);
      const content = `Original note ${index}`;
      const source = `${name}.MD`;
      const note = addFile(source, content);
      return { folder, content, source, note, inode: statSync(disk(source), { bigint: true }).ino };
    });
    const preview = await nodes.scanAsync();
    expect(preview.conflicts).toEqual([]);
    expect(preview.leafMoves).toHaveLength(2);
    await nodes.migrate(preview);
    for (const { folder, source, content, note, inode } of sources) {
      const target = `${folder.path}/${folder.name}.md`;
      expect(nodes.getCanonicalFile(folder.path)).toBe(note);
      expect(note.path).toBe(target);
      expect(existsSync(disk(source))).toBe(false);
      expect(readFileSync(disk(target), "utf8")).toBe(content);
      if (inode !== 0n) expect(statSync(disk(target), { bigint: true }).ino).toBe(inode);
    }
  },
);

it("checks the physical destination before renaming a file to another case", async (context) => {
  const { root, disk, addFile, nodes } = diskVault();
  const note = addFile("Report.txt", "original");
  const target = "report.txt";
  if (existsSync(disk(target))) {
    if (!readdirSync(root).includes("Report.txt")) context.skip("This volume does not retain the supplied spelling");
    await nodes.renameFile(note, target);
    expect(note.path).toBe(target);
    expect(readdirSync(root)).toContain(target);
    expect(readFileSync(disk(target), "utf8")).toBe("original");
  } else {
    writeFileSync(disk(target), "unindexed file", { flag: "wx" });
    await expect(nodes.renameFile(note, target)).rejects.toThrow("Path already exists");
    expect(readFileSync(disk("Report.txt"), "utf8")).toBe("original");
    expect(readFileSync(disk(target), "utf8")).toBe("unindexed file");
  }
});
