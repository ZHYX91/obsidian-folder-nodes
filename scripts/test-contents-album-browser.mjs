import assert from "node:assert/strict";
import { withBrowserFixture } from "./browser-fixture.mjs";

await withBrowserFixture({
  entry: "tests/browser/contents-album.fixture.ts",
  stylesheet: "src/ui/styles.css",
  ready: "Boolean(window.contentsAlbum)",
}, async ({ send, evaluate }) => {
  const call = (method, ...args) => evaluate(`window.contentsAlbum.${method}(${args.map((value) => JSON.stringify(value)).join(",")})`);
  const key = async (type) => send("Input.dispatchKeyEvent", {
    type, key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, ...(type === "keyDown" ? { text: "\r" } : {}),
  });
  const enter = async (focusKey) => {
    await call("focus", focusKey);
    await key("keyDown");
    await key("keyUp");
  };
  const click = async (focusKey, modifiers = 0) => {
    const point = await call("point", focusKey);
    await send("Input.dispatchMouseEvent", { ...point, type: "mousePressed", button: "left", buttons: 1, clickCount: 1, modifiers });
    await send("Input.dispatchMouseEvent", { ...point, type: "mouseReleased", button: "left", clickCount: 1, modifiers });
  };

  await call("prepare");
  const { sort } = await call("geometry");
  await enter("album:sort");
  assert.deepEqual(await call("menuAnchor"), { x: sort.left, y: sort.bottom, width: sort.width, mainDocument: true });
  await call("chooseSort", "Name");
  let state = await call("state");
  assert.equal(state.active, "album:sort");
  assert.equal(state.shown.length, 200);
  assert.deepEqual(state.shown.slice(0, 3), ["A.jpg", "B.jpg", "C.jpg"]);

  await click("header:selection");
  await click("media:Album/A.jpg");
  await click("media:Album/B.jpg", 8);
  assert.deepEqual((await call("state")).selected, ["A.jpg", "B.jpg"]);

  await click("media:Album/" + state.shown.at(-1));
  await click("file:Album/readme.txt", 8);
  await enter("more:album");
  state = await call("state");
  assert.equal(state.shown.length, 203);
  assert.equal(state.more, undefined);
  assert.equal(state.active, "media:Album/" + state.shown[200]);
  assert.deepEqual(state.selected, ["A.jpg", "B.jpg", state.shown[199]]);

  // Active-leaf changes send the current folder back to an open Contents view.
  await call("setFolder", "Album");
  assert.equal((await call("state")).shown.length, 203);
  assert.equal((await call("state")).active, state.active);

  await enter("album:copy");
  const [embed] = (await call("state")).copies;
  assert.equal(embed.split("\n").length, 202);
  assert.equal(embed.split("\n")[0], "![A.jpg](Album/A.jpg)");
  assert.ok(embed.includes("![Z \\[最後\\] (1) #%.jpg](Album/Z%20%5B%E6%9C%80%E5%BE%8C%5D%20%281%29%20%23%25.jpg)"));
  assert.ok(embed.includes("![Z198.jpg](Album/Z198.jpg)"));
  assert.ok(!embed.includes(".mp4") && !embed.includes("Notes/A.jpg"));

  await enter("header:selection");
  await send("Emulation.setDeviceMetricsOverride", { width: 360, height: 760, deviceScaleFactor: 2, mobile: true });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await call("useRegularLinks");
  const touchPoint = await call("point", "album:copy");
  const narrow = await call("geometry");
  assert.equal(narrow.width, 360);
  assert.equal(narrow.coarse, true);
  for (const rect of [narrow.sort, narrow.copy]) {
    assert.ok(rect.width >= 44 && rect.height >= 44);
    assert.ok(rect.left >= 0 && rect.right <= narrow.width && rect.bottom <= narrow.grid.top);
  }
  await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [touchPoint] });
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  const [, links] = (await call("state")).copies;
  assert.equal(links, embed.split("\n").map((line) => line.slice(1)).join("\n\n"));
  await call("setFolder", "Notes");
  await call("setFolder", "Album");
  assert.equal((await call("state")).shown.length, 200);
  // The view can be moved to a second document after the plugin loaded in the first.
  const restoredInSecondWindow = await evaluate(`(async () => {
    const frame = document.createElement("iframe");
    frame.src = location.href;
    const loaded = new Promise(resolve => frame.addEventListener("load", resolve, { once: true }));
    document.body.append(frame);
    await loaded;
    const owner = frame.contentDocument;
    window.contentsAlbum.moveToDocument(owner);
    owner.querySelector(".folder-nodes-current").focus();
    window.contentsAlbum.refresh();
    return owner.activeElement?.dataset.folderNodesFocusKey;
  })()`);
  assert.equal(restoredInSecondWindow, "current:Album");
  console.log("Chromium Album keyboard anchor, sort/Shift range, paging, and narrow touch clipboard passed.");
});
