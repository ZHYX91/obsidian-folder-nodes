import assert from "node:assert/strict";
import { withBrowserFixture } from "./browser-fixture.mjs";

await withBrowserFixture({
  entry: "tests/browser/album-selection.fixture.ts",
  stylesheet: "src/ui/styles.css",
  ready: "Boolean(window.albumFixture)",
}, async ({ send, evaluate }) => {
  const click = async (key, modifiers = 0) => {
    const { x, y, hit } = await evaluate(`(() => {
      const button = document.querySelector('[data-folder-nodes-focus-key="' + ${JSON.stringify(key)} + '"]');
      button.scrollIntoView({ block: "center" });
      const rect = button.getBoundingClientRect();
      for (const row of [0.5, 0.75, 0.25]) for (const column of [0.5, 0.25, 0.75]) {
        const x = rect.x + rect.width * column;
        const y = rect.y + rect.height * row;
        if (document.elementFromPoint(x, y)?.closest("button") === button) return { x, y, hit: button.dataset.folderNodesFocusKey };
      }
      return { x: rect.x, y: rect.y };
    })()`);
    assert.equal(hit, key, JSON.stringify({key,x,y,hit}));
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, modifiers });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1, modifiers });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1, modifiers });
  };
  for (const [mode, order] of [
    [0, ["image2.png", "image10.png", "image3.png"]],
    [1, ["image2.png", "image3.png", "image10.png"]],
    [2, ["image3.png", "image2.png", "image10.png"]],
  ]) {
    await evaluate("window.albumFixture.prepare()");
    if (mode !== 0) await evaluate(`window.albumFixture.sort(${mode})`);
    assert.deepEqual((await evaluate("window.albumFixture.state()")).shown, order);
    await click("header:selection");
    await click(`media:${order[0]}`);
    await click(`media:${order[1]}`, 8); // Chromium Shift modifier.
    await click("selection:copy");
    const state = await evaluate("window.albumFixture.state()");
    assert.deepEqual(state.selected, order.slice(0, 2), JSON.stringify(state));
    assert.equal(state.copied, order.slice(0, 2).map((name) => `![[${name}]]`).join("\n"));
  }
  console.log("Chromium album Shift range and clipboard match Vault, Name and Created order.");
});
