import { describe, expect, it } from "vitest";
import { NodeService } from "../../src/adapters/node-service";
import { DEFAULT_SETTINGS } from "../../src/shared/settings";
import { FakeObsidian } from "../helpers/fake-obsidian";

const service = (fake: FakeObsidian) => new NodeService(fake.app, () => structuredClone(DEFAULT_SETTINGS));

describe("Native Node Note rename identity", () => {
  it.each([
    ["Alpha.MD", "Bravo.MD", "Bravo"],
    ["Alpha.Md", "Bravo.Md", "Bravo"],
    ["alpha.md", "Bravo.md", "Bravo"],
    ["Alpha.md", "Cafe\u0301.MD", "Café"],
    ["Alpha.MD", "节点.MD", "节点"],
    ["Alpha.MD", "alpha.MD", "Alpha"],
  ])("follows the actual canonical file from %s to %s", async (originalName, nextName, expectedFolder) => {
    const fake = new FakeObsidian();
    const folder = fake.addFolder("Alpha");
    const note = fake.addFile(`Alpha/${originalName}`, "canonical body");
    const attachment = fake.addFile("Alpha/reference.pdf", "attachment bytes");
    const nodes = service(fake);
    expect(nodes.getCanonicalFile("Alpha")).toBe(note);
    const oldPath = note.path;
    await fake.rename(note, `Alpha/${nextName}`);

    await nodes.reconcileRenamed(note, oldPath);
    expect(folder.path).toBe(expectedFolder);
    expect(fake.requireFile(`${expectedFolder}/${nextName}`)).toBe(note);
    expect(nodes.getCanonicalFile(expectedFolder)).toBe(note);
    expect(fake.contents.get(note.path)).toBe("canonical body");
    expect(fake.requireFile(`${expectedFolder}/reference.pdf`)).toBe(attachment);
    expect(fake.contents.get(attachment.path)).toBe("attachment bytes");
    expect(fake.trashed).toEqual([]);
  });

  it.each(["replacement-note", "replacement-folder", "second-canonical"])(
    "rejects a different apparent canonical result after folder rename: %s", async (change) => {
      const fake = new FakeObsidian();
      const folder = fake.addFolder("Alpha");
      const extension = change === "second-canonical" ? "MD" : "md";
      const note = fake.addFile(`Alpha/Alpha.${extension}`, "original body");
      const oldPath = note.path;
      if (change === "second-canonical") fake.addFile("Alpha/Bravo.md", "other body");
      await fake.rename(note, `Alpha/Bravo.${extension}`);
      const rename = fake.app.fileManager.renameFile.bind(fake.app.fileManager);
      fake.app.fileManager.renameFile = async (file, path) => {
        await rename(file, path);
        if (file === folder && path === "Bravo") {
          if (change === "replacement-note") {
            fake.remove(note.path);
            fake.addFile("Bravo/Bravo.md", "external replacement");
          } else if (change === "replacement-folder") {
            fake.remove(folder.path);
            fake.addFolder("Bravo");
            fake.addFile("Bravo/Bravo.md", "external replacement");
          }
        }
      };

      await expect(service(fake).reconcileRenamed(note, oldPath)).rejects.toThrow(
        change === "replacement-folder" ? "rollback was incomplete" : change === "second-canonical" ? "structural validation" : "identity changed",
      );
      if (change === "replacement-folder") expect(fake.contents.get("Bravo/Bravo.md")).toBe("external replacement");
      else {
        expect(fake.requireFolder("Alpha")).toBe(folder);
        if (change === "second-canonical") {
          expect(fake.requireFile("Alpha/Bravo.MD")).toBe(note);
          expect(fake.contents.get(note.path)).toBe("original body");
          expect(fake.contents.get("Alpha/Bravo.md")).toBe("other body");
        } else expect(fake.contents.get("Alpha/Bravo.md")).toBe("external replacement");
      }
      expect(fake.trashed).toEqual([]);
    },
  );

  it("leaves an uppercase-extension Root Node Note rename under native control", async () => {
    const fake = new FakeObsidian();
    const root = fake.root;
    const note = fake.addFile("Vault.MD", "root body");
    await fake.rename(note, "Home.MD");

    await service(fake).reconcileRenamed(note, "Vault.MD");
    expect(fake.root).toBe(root);
    expect(fake.requireFile("Home.MD")).toBe(note);
    expect(fake.renames).toEqual([{ from: "Vault.MD", to: "Home.MD" }]);
  });
});
