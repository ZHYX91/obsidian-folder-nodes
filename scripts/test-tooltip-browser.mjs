import assert from "node:assert/strict";
import { withBrowserFixture } from "./browser-fixture.mjs";

await withBrowserFixture({
  entry: "tests/browser/tooltip-reset.fixture.ts",
  stylesheet: "src/ui/node-graph.css",
  fixtureStyles: "body{font:14px Arial}.surface{position:relative;width:680px;height:590px;--text-normal:#111;--background-secondary-alt:#fff;--background-modifier-border:#ccc;--font-ui-smaller:14px}",
  ready: "Boolean(document.body?.dataset.result)",
}, async ({ evaluate }) => {
  const result = await evaluate("JSON.parse(document.body.dataset.result)");
  process.stdout.write(`${JSON.stringify(result)}\n`);
  assert.equal(result.passed, true, result.error);
});
