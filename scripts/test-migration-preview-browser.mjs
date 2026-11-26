import assert from "node:assert/strict";
import { withBrowserFixture } from "./browser-fixture.mjs";

await withBrowserFixture({
  entry: "tests/browser/migration-preview.fixture.ts",
  stylesheet: "src/ui/styles.css",
  ready: "typeof window.openMigrationPreview === 'function'",
}, async ({ send, evaluate }) => {
  const sectionSelector = 'document.querySelector(".folder-nodes-migration-summary details[open]")';
  const state = () => evaluate(`(() => {
    const section = ${sectionSelector};
    const rows = [...section.querySelectorAll("li")];
    const button = section.querySelector("button");
    return { count: rows.length, last: rows.at(-1)?.textContent, visible: rows.filter(row => row.getClientRects().length > 0).length,
      hasButton: !!button, targetHeight: button?.getBoundingClientRect().height ?? 0,
      fits: section.scrollWidth <= section.clientWidth + 1, direction: getComputedStyle(section).direction, focus: document.activeElement.textContent,
      focusIsRow: document.activeElement.tagName === "LI", writes: window.migrationPreviewWrites() };
  })()`);
  const key = async (key, code) => {
    const text = key === "Enter" ? "\r" : "";
    await send("Input.dispatchKeyEvent", { type: "keyDown", key, code: key, windowsVirtualKeyCode: code, text, unmodifiedText: text });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key, code: key, windowsVirtualKeyCode: code });
  };
  for (const { kind, count, language } of [
    { kind: "property", count: 1001, language: "en" },
    { kind: "structure", count: 501, language: "en" },
    { kind: "health", count: 501, language: "ar" },
  ]) {
    const width = language === "ar" ? 320 : 900;
    await send("Emulation.setDeviceMetricsOverride", { width, height: 780, deviceScaleFactor: 1, mobile: false });
    await evaluate(`window.openMigrationPreview("${kind}", ${count}, "${language}")`);
    let before = await state();
    assert.equal(before.visible, 500, kind);
    assert.equal(before.direction, language === "ar" ? "rtl" : "ltr", kind);
    assert.equal(before.writes, 0, kind);
    assert.ok(before.targetHeight >= (width === 320 ? 44 : 36), kind);
    assert.equal(before.hasButton, true, `${kind}: rows after the first 500 must be reviewable`);
    await evaluate(`${sectionSelector}.querySelector("button").focus()`);
    for (const last of count > 1000 ? [1000, count] : [count]) {
      assert.equal(await evaluate(`document.activeElement === ${sectionSelector}.querySelector("button")`), true, kind);
      await key("Enter", 13);
      const after = await state();
      assert.equal(after.count, last, kind);
      assert.equal(after.visible, last, kind);
      assert.equal(after.fits, true, `${kind}: long paths must wrap rather than overflow`);
      assert.ok(after.last.includes(`Topic-${String(last).padStart(4, "0")}.md`), kind);
      assert.equal(after.hasButton, last < count, kind);
      assert.equal(after.focusIsRow, true, `${kind}: keyboard focus belongs at the newly revealed batch`);
      assert.ok(after.focus.includes(`Topic-${String(before.count + 1).padStart(4, "0")}.md`), kind);
      assert.equal(after.writes, 0, kind);
      before = after;
      if (last < count) await key("Tab", 9);
    }
  }
  console.log("Structure, property and RTL Health previews retain keyboard focus and reveal every row without writing.");
});
