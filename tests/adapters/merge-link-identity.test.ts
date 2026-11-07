import { describe, expect, it, vi } from "vitest";
import { NodeService } from "../../src/adapters/node-service";
import { DEFAULT_SETTINGS } from "../../src/shared/settings";
import { FakeObsidian } from "../helpers/fake-obsidian";

const service = (fake: FakeObsidian) => new NodeService(fake.app, () => structuredClone(DEFAULT_SETTINGS));

describe("Merge link target identity", () => {
  it.each([
    "[self](Source/Source.md)", "[self](<Source/Source.md>)", "[self](Source/Source.md#Heading)",
    "![self](Source/Source.md#^block)", "[self](Source)", "[self](/Source/Source.md)",
    "[[Source/Source]]", "![[Source/Source#Heading|Alias]]",
  ])("refuses a resolved removed-note link before any writes: %s", async (link) => {
    for (const inChild of [false, true]) {
      const fake = new FakeObsidian();
      const source = fake.addFolder("Source");
      const sourceNote = fake.addFile("Source/Source.md", inChild ? "source" : link);
      if (inChild) fake.addFile("Source/child.md", link);
      const target = fake.addFolder("Target");
      fake.addFile("Target/Target.md", "target");
      fake.app.metadataCache.getFirstLinkpathDest = vi.fn(() => sourceNote);
      const before = new Map(fake.contents);
      const process = vi.spyOn(fake.app.vault, "process");

      await expect(service(fake).mergeNode(source, target)).rejects.toThrow("removed Node Note");
      expect(fake.contents).toEqual(before);
      expect(fake.renames).toEqual([]);
      expect(fake.trashed).toEqual([]);
      expect(process).not.toHaveBeenCalled();
    }
  });

  it.each(["[reference](Reference.md#Heading)", "[[Reference#Heading|Alias]]"])(
    "refuses different host destinations despite unchanged link spelling: %s", async (link) => {
      const fake = new FakeObsidian();
      const source = fake.addFolder("Source");
      fake.addFile("Source/Source.md", link);
      const target = fake.addFolder("Target");
      fake.addFile("Target/Target.md", "target");
      fake.addFolder("Elsewhere");
      const original = fake.addFile("Elsewhere/Reference.md", "original");
      const replacement = fake.addFile("Target/Reference.md", "different");
      fake.app.metadataCache.getFirstLinkpathDest = (_path, from) => from.startsWith("Source/") ? original : replacement;
      const before = new Map(fake.contents);

      await expect(service(fake).mergeNode(source, target)).rejects.toThrow(/change a .*link target/iu);
      expect(fake.contents).toEqual(before);
      expect(fake.renames).toEqual([]);
      expect(fake.trashed).toEqual([]);
    },
  );

  it.each(["[reference](Library/Reference.md#Heading)", "[[Library/Reference#Heading|Alias]]"])(
    "preserves a stable vault-root destination and authored bytes: %s", async (link) => {
      const fake = new FakeObsidian();
      const source = fake.addFolder("Source");
      fake.addFile("Source/Source.md", link);
      const target = fake.addFolder("Target");
      fake.addFile("Target/Target.md", "target");
      fake.addFolder("Library");
      const original = fake.addFile("Library/Reference.md", "# Heading\nreference");
      fake.app.metadataCache.getFirstLinkpathDest = () => original;

      await service(fake).mergeNode(source, target);
      expect(fake.contents.get("Target/Target.md")).toContain(link);
      expect(fake.requireFile("Library/Reference.md")).toBe(original);
      expect(fake.trashed).toEqual(["Source"]);
    },
  );

  it("rechecks a Markdown destination's original object before removing the source", async () => {
    const fake = new FakeObsidian();
    const source = fake.addFolder("Source");
    fake.addFile("Source/Source.md", "[reference](Reference.md)");
    fake.addFile("Source/asset.bin", "attachment");
    const target = fake.addFolder("Target");
    fake.addFile("Target/Target.md", "target");
    const original = fake.addFile("Reference.md", "original");
    let resolved = original;
    fake.app.metadataCache.getFirstLinkpathDest = () => resolved;
    const process = fake.app.vault.process.bind(fake.app.vault);
    fake.app.vault.process = async (file, update) => {
      const result = await process(file, update);
      if (file.path === "Target/Target.md" && resolved === original) {
        fake.remove(original.path);
        resolved = fake.addFile("Reference.md", "external replacement");
      }
      return result;
    };

    await expect(service(fake).mergeNode(source, target)).rejects.toThrow(/change a .*link target/iu);
    expect(fake.requireFolder("Source")).toBe(source);
    expect(fake.contents.get("Target/Target.md")).toBe("target");
    expect(fake.requireFile("Source/asset.bin")).toBeDefined();
    expect(fake.contents.get("Reference.md")).toBe("external replacement");
    expect(fake.trashed).toEqual([]);
  });

  it("preserves a moved relative attachment's identity before and after the move", async () => {
    const fake = new FakeObsidian();
    const source = fake.addFolder("Source");
    fake.addFile("Source/Source.md", "![image](./photo.png)");
    const attachment = fake.addFile("Source/photo.png", "image bytes");
    const target = fake.addFolder("Target");
    fake.addFile("Target/Target.md", "target");
    fake.app.metadataCache.getFirstLinkpathDest = (_path, from) => {
      const expected = from.startsWith("Source/") ? "Source/photo.png" : "Target/photo.png";
      return attachment.path === expected ? attachment : null;
    };

    await service(fake).mergeNode(source, target);
    expect(fake.requireFile("Target/photo.png")).toBe(attachment);
    expect(fake.contents.get("Target/Target.md")).toContain("![image](./photo.png)");
    expect(fake.trashed).toEqual(["Source"]);
  });

  it.each(["missing", "moving-vault-root"])("refuses an unproved Markdown target before moving: %s", async (mode) => {
    const fake = new FakeObsidian();
    const source = fake.addFolder("Source");
    fake.addFile("Source/Source.md", mode === "missing" ? "[asset](missing.bin)" : "[asset](Source/asset.bin)");
    const attachment = fake.addFile("Source/asset.bin", "attachment");
    const target = fake.addFolder("Target");
    fake.addFile("Target/Target.md", "target");
    fake.app.metadataCache.getFirstLinkpathDest = () => mode === "missing" ? null : attachment;
    const before = new Map(fake.contents);

    await expect(service(fake).mergeNode(source, target)).rejects.toThrow("Cannot prove a Markdown link target");
    expect(fake.contents).toEqual(before);
    expect(fake.renames).toEqual([]);
    expect(fake.trashed).toEqual([]);
  });
});
