import { readFileSync } from "node:fs";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";

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
