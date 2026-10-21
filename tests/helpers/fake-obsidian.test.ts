import type { TFile } from "obsidian";
import { describe, expect, it, vi } from "vitest";

import { FakeObsidian } from "./fake-obsidian";
import { expectFrontmatterPropertyChanges, parseFrontmatterDocument } from "./frontmatter-oracle";

const ORIGINAL = "---\ntitle: Before\nmetadata: { owner: Bob's }\n---\nBody\n";
const UPDATED = ORIGINAL.replace("title: Before", "title: After");
const writers = {
  modify: (fake: FakeObsidian, file: TFile) => fake.app.vault.modify(file, UPDATED),
  process: (fake: FakeObsidian, file: TFile) => fake.app.vault.process(file, () => UPDATED),
  append: (fake: FakeObsidian, file: TFile) => fake.app.vault.append(file, "More\n"),
  frontmatter: (fake: FakeObsidian, file: TFile) => fake.app.fileManager.processFrontMatter(file, (value) => { value.title = "After"; }),
};

describe("FakeObsidian content, cache, and notification contract", () => {
  it.each(["title: [unfinished", "title: one\ntitle: two", "- list root"])("refuses an unsafe FileManager frontmatter write for %s", async (yaml) => {
    const fake = new FakeObsidian();
    const source = `---\n${yaml}\n---\nBody\n`;
    const file = fake.addFile("Example.md", source);
    await expect(fake.app.fileManager.processFrontMatter(file, (value) => { value.title = "After"; })).rejects.toThrow();
    expect(fake.contents.get(file.path)).toBe(source);
  });

  it("derives a normal cache from real YAML, including CRLF and quoted/plain values", () => {
    const fake = new FakeObsidian();
    const source = "\uFEFF" + ORIGINAL.replaceAll("\n", "\r\n");
    const file = fake.addFile("Example.md", source);
    expect(fake.app.metadataCache.getFileCache(file)?.frontmatter).toEqual(parseFrontmatterDocument(source).data);
    expect(fake.contents.get(file.path)).toBe(source);
  });

  it.each(Object.keys(writers) as Array<keyof typeof writers>)("keeps source and cache consistent and emits notifications for %s", async (operation) => {
    const fake = new FakeObsidian();
    const file = fake.addFile("Example.md", ORIGINAL);
    const modified = vi.fn();
    const changed = vi.fn();
    fake.app.vault.on("modify", modified);
    fake.app.metadataCache.on("changed", changed);
    await writers[operation](fake, file);
    const source = await fake.app.vault.read(file);
    expect(source).not.toBe(ORIGINAL);
    expect(fake.app.metadataCache.getFileCache(file)?.frontmatter).toEqual(parseFrontmatterDocument(source).data);
    expect(modified).toHaveBeenCalledExactlyOnceWith(file);
    expect(changed).toHaveBeenCalledExactlyOnceWith(file, source, fake.app.metadataCache.getFileCache(file));
    if (operation === "frontmatter") expectFrontmatterPropertyChanges(ORIGINAL, source, { title: "After" });
  });

  it("exposes stale metadata explicitly until the deferred refresh is flushed", async () => {
    const fake = new FakeObsidian("Vault", { metadataUpdates: "deferred" });
    const file = fake.addFile("Example.md", ORIGINAL);
    const modifiedTitles: unknown[] = [];
    const changed = vi.fn();
    fake.app.vault.on("modify", () => modifiedTitles.push(fake.app.metadataCache.getFileCache(file)?.frontmatter?.title));
    fake.app.metadataCache.on("changed", changed);
    await fake.app.vault.process(file, () => UPDATED);
    expect(await fake.app.vault.read(file)).toBe(UPDATED);
    expect(modifiedTitles).toEqual(["Before"]);
    expect(changed).not.toHaveBeenCalled();
    fake.flushMetadata();
    expect(fake.app.metadataCache.getFileCache(file)?.frontmatter?.title).toBe("After");
    expect(changed).toHaveBeenCalledOnce();
    fake.flushMetadata();
    expect(changed).toHaveBeenCalledOnce();
  });

  it("can delay modify notifications independently of the refreshed cache", async () => {
    const fake = new FakeObsidian("Vault", { modifyEvents: "deferred" });
    const file = fake.addFile("Example.md", ORIGINAL);
    const modified = vi.fn();
    const ref = fake.app.vault.on("modify", modified);
    await fake.app.vault.modify(file, UPDATED);
    expect(fake.app.metadataCache.getFileCache(file)?.frontmatter?.title).toBe("After");
    expect(modified).not.toHaveBeenCalled();
    fake.flushModifyEvents();
    expect(modified).toHaveBeenCalledExactlyOnceWith(file);
    fake.app.vault.offref(ref);
    await fake.app.vault.modify(file, ORIGINAL);
    fake.flushModifyEvents();
    expect(modified).toHaveBeenCalledOnce();
  });

  it.each(Object.keys(writers) as Array<keyof typeof writers>)("fails %s before touching source, cache, or notifications", async (operation) => {
    const fake = new FakeObsidian();
    const file = fake.addFile("Example.md", ORIGINAL);
    const modified = vi.fn();
    const changed = vi.fn();
    fake.app.vault.on("modify", modified);
    fake.app.metadataCache.on("changed", changed);
    fake.failNext(operation, new Error("Disk unavailable"));
    await expect(writers[operation](fake, file)).rejects.toThrow("Disk unavailable");
    expect(fake.contents.get(file.path)).toBe(ORIGINAL);
    expect(fake.app.metadataCache.getFileCache(file)?.frontmatter).toEqual(parseFrontmatterDocument(ORIGINAL).data);
    expect(modified).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
    await writers[operation](fake, file);
    expect(modified).toHaveBeenCalledOnce();
  });

  it("uses current source for a frontmatter write even when the supplied cache is stale", async () => {
    const fake = new FakeObsidian();
    const file = fake.addFile("Example.md", ORIGINAL, { obsolete: true });
    await fake.app.fileManager.processFrontMatter(file, (value) => { value.title = "After"; });
    expectFrontmatterPropertyChanges(ORIGINAL, await fake.app.vault.read(file), { title: "After" });
    expect(fake.app.metadataCache.getFileCache(file)?.frontmatter).not.toHaveProperty("obsolete");
  });
});
