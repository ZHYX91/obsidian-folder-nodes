import { readFileSync } from "node:fs";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { expect, it, vi } from "vitest";

import { FakeObsidian } from "./fake-obsidian";

it("prepares every merge case without canonical-note or reference-file collisions", async () => {
  const fake = new FakeObsidian();
  const notices: string[] = [];
  const module = { exports: undefined as unknown };
  const source = readFileSync(path.resolve("acceptance/fixtures/.obsidian/plugins/folder-nodes-acceptance-provider/main.js"), "utf8");
  runInNewContext(source, {
    module,
    require: (id: string) => {
      if (id !== "obsidian") throw new Error(`Unexpected fixture dependency: ${id}`);
      return { Plugin: class {}, Notice: class { public constructor(message: string) { notices.push(message); } } };
    },
  });
  const Provider = module.exports as new () => { app: typeof fake.app; prepareMergeSafety(): Promise<void> };
  const provider = new Provider();
  provider.app = fake.app;
  await provider.prepareMergeSafety();

  for (const name of ["Inline", "Definition", "Nested", "Safe", "EditorRace", "UnloadRace"]) {
    const root = `MergeSafety/${name}`;
    expect(fake.contents.get(`${root}/${name}.md`)).toBe(`# ${name}\n`);
    expect(fake.contents.get(`${root}/Reference.md`)).toBe("Original reference.\n");
    expect(fake.contents.get(`${root}/Deep/Reference.md`)).toContain("Different reference");
    expect(fake.requireFile(`${root}/Source/Sub/Child.md`)).toBeDefined();
    expect(fake.requireFile(`${root}/Source/asset.bin`)).toBeDefined();
    expect(fake.contents.get(`${root}/Deep/Target/Target.md`)).toBe("# Target\n");
  }
  expect(fake.contents.get("MergeSafety/Definition/Source/Source.md")).toBe("[ref]\n\n[ref]:\n  ../Reference.md\n");
  expect(notices.at(-1)).toContain("MergeSafety ready");
});

it("prepares contextual WikiLink, rank batch and content ownership cases without collisions", async () => {
  const fake = new FakeObsidian();
  const notices: string[] = [];
  const module = { exports: undefined as unknown };
  const source = readFileSync(path.resolve("acceptance/fixtures/.obsidian/plugins/folder-nodes-acceptance-provider/main.js"), "utf8");
  runInNewContext(source, {
    module,
    require: (id: string) => {
      if (id !== "obsidian") throw new Error(`Unexpected fixture dependency: ${id}`);
      return { Plugin: class {}, Notice: class { public constructor(message: string) { notices.push(message); } } };
    },
  });
  const Provider = module.exports as new () => { app: typeof fake.app; prepareOwnershipSafety(): Promise<void> };
  const provider = new Provider();
  provider.app = fake.app;
  await provider.prepareOwnershipSafety();
  expect(fake.contents.get("OwnershipSafety/WikiBody/Source/Source.md")).toContain("[[Reference#Heading|Alias]]");
  expect(fake.frontmatters.get("OwnershipSafety/WikiText/Source/Source.md")?.related).toBe("[[Reference#Heading|Alias]]");
  expect(fake.frontmatters.get("OwnershipSafety/WikiList/Source/Source.md")?.related).toEqual(["[[Reference#Heading|Alias]]"]);
  expect(fake.contents.get("OwnershipSafety/WikiChild/Source/child.md")).toContain("[[Reference#Heading|Alias]]");
  expect(fake.contents.get("OwnershipSafety/WikiSafe/Source/Source.md")).toContain("[[OwnershipSafety/WikiSafe/Reference#Heading|Alias]]");
  expect(fake.requireFile("OwnershipSafety/WikiMoving/Source/Moving.md")).toBeDefined();
  expect(fake.requireFile("OwnershipSafety/WikiCompetitor/Source/Reference.md")).toBeDefined();
  expect(fake.frontmatters.get("OwnershipSafety/Ranks/Source/First/First.md")?.["folder-nodes"]).toEqual(["rank=4096"]);
  expect(fake.frontmatters.get("OwnershipSafety/Ranks/Source/Second/Second.md")?.["folder-nodes"]).toEqual(["rank=8192"]);
  expect(fake.frontmatters.get("OwnershipSafety/Ranks/Target/Existing/Existing.md")?.["folder-nodes"]).toEqual(["rank=1024"]);
  expect(fake.requireFile("OwnershipSafety/Drag/document.txt")).toBeDefined();
  expect(fake.requireFile("OwnershipSafety/Drag/clip.mp4")).toBeDefined();
  expect(notices.at(-1)).toContain("Preparation assigns no verdict");
  const count = fake.files.size;
  await provider.prepareOwnershipSafety();
  expect(fake.files.size).toBe(count);
  expect(notices.at(-1)).toContain("fresh disposable Vault");
});

it("injects content replacement after the product source dragstart listener", async () => {
  const fake = new FakeObsidian();
  const cleanups: Array<() => void> = [];
  const module = { exports: undefined as unknown };
  const source = readFileSync(path.resolve("acceptance/fixtures/.obsidian/plugins/folder-nodes-acceptance-provider/main.js"), "utf8");
  runInNewContext(source, {
    module, document,
    require: (id: string) => {
      if (id !== "obsidian") throw new Error(`Unexpected fixture dependency: ${id}`);
      return { Plugin: class { public register(cleanup: () => void) { cleanups.push(cleanup); } }, Notice: class {} };
    },
  });
  const Provider = module.exports as new () => {
    app: typeof fake.app; prepareOwnershipSafety(): Promise<void>; armContentReplacement(kind: string): void;
    ownershipObservations: Array<{ status: string; originalObjectPreserved: boolean }>;
  };
  const provider = new Provider();
  provider.app = fake.app;
  await provider.prepareOwnershipSafety();
  const file = fake.requireFile("OwnershipSafety/Drag/document.txt");
  const button = document.createElement("button");
  button.dataset.folderNodesFocusKey = `file:${file.path}`;
  document.body.append(button);
  let productPath = "";
  button.addEventListener("dragstart", () => { productPath = file.path; });
  try {
    provider.armContentReplacement("source");
    button.dispatchEvent(new Event("dragstart", { bubbles: true }));
    expect(productPath).toBe("OwnershipSafety/Drag/document.txt");
    await vi.waitFor(() => expect(provider.ownershipObservations[0]?.status).toBe("replaced"));
    expect(provider.ownershipObservations[0]?.originalObjectPreserved).toBe(true);
    expect(fake.requireFile("OwnershipSafety/Drag/document.txt.original")).toBe(file);
    expect(fake.requireFile("OwnershipSafety/Drag/document.txt")).not.toBe(file);
  } finally { for (const cleanup of cleanups) cleanup(); button.remove(); }
});
