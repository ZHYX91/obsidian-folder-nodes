import assert from "node:assert/strict";
import { withBrowserFixture } from "./browser-fixture.mjs";

await withBrowserFixture({
  entry: "tests/browser/contents-drag.fixture.ts",
  stylesheet: "src/ui/styles.css",
  ready: "Boolean(window.contentsDrag)",
}, async ({ send, evaluate, pause }) => {
  for (const scenario of ["release", "hidden", "cancel"]) {
    const { from, to } = await evaluate(`window.contentsDrag.prepare(${scenario === "hidden"})`);
    const mouse = (type, [x, y], options = {}) => send("Input.dispatchMouseEvent", { type, x, y, ...options });
    await mouse("mouseMoved", from);
    await mouse("mousePressed", from, { button: "left", buttons: 1, clickCount: 1 });
    for (let step = 1; step <= 20; step++) {
      const point = from.map((start, i) => Math.round(start + (to[i] - start) * step / 20));
      await mouse("mouseMoved", point, { button: "left", buttons: 1 });
      await pause(40);
    }
    if (scenario === "cancel") await send("Input.cancelDragging");
    await mouse("mouseReleased", to, { button: "left", clickCount: 1 });
    const { events, order } = await evaluate("window.contentsDrag.state()");
    assert.ok(events.some((event) => event.type === "dragstart") && events.every((event) => event.trusted));
    if (scenario === "release") {
      const drop = events.findIndex((event) => event.type === "drop");
      assert.notEqual(drop, -1, "The browser must dispatch a drop on the card");
      const targetEvents = events.slice(0, drop).filter((event) => event.path === "A");
      assert.equal(targetEvents.at(-2)?.tag, "svg");
      assert.deepEqual(targetEvents.at(-1), { type: "dragenter", path: "A", tag: "button", trusted: true });
      assert.deepEqual(order, ["C", "A", "Hidden", "B"]);
    } else {
      assert.ok(!events.some((event) => event.type === "drop"), `Unexpected drop in ${scenario}`);
      assert.deepEqual(order, ["A", "Hidden", "B", "C"]);
    }
  }
  console.log("Chromium sibling reorder, hidden gap and cancelled drag passed.");
});
