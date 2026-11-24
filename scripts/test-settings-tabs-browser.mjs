import assert from "node:assert/strict";
import { withBrowserFixture } from "./browser-fixture.mjs";

await withBrowserFixture({
  entry: "tests/browser/settings-tab-size.fixture.ts",
  stylesheet: "src/ui/styles.css",
  ready: "typeof window.measureTabs === 'function'",
}, async ({ send, evaluate }) => {
  for (const touch of [false, true]) {
    await send("Emulation.setTouchEmulationEnabled", { enabled: touch });
    for (const direction of ["ltr", "rtl"]) {
      for (const opening of ["wide", "hidden", "overflowing"]) {
        const check = await evaluate(`window.checkTabReveal("${direction}", "${opening}")`);
        assert.deepEqual(check, { revealed: true, keptPage: true, keptFocus: true, selected: "Node Graph" },
          `${direction}, ${opening} opening, ${touch ? "coarse" : "fine"} pointer`);
      }
      for (const width of [900, 300]) {
        const result = await evaluate(`window.measureTabs(${width}, "${direction}")`);
        const layout = `${direction}, ${width}px, ${touch ? "coarse" : "fine"} pointer`;
        assert.equal(result.coarse, touch, layout);
        assert.deepEqual(result.arrows, width === 900 ? [] : [touch ? 44 : 32], layout);
        assert.equal(result.heights.length, 5, layout);
        const minimum = touch ? 44 : 34;
        assert.ok(result.heights.every((height) => height >= minimum),
          `${layout}: all tabs must be at least ${minimum}px high, got ${result.heights.join(", ")}`);
      }
    }
  }

  const [active, inactive] = await evaluate("window.mountTabPaintSample()");
  async function pixel(position, offset) {
    const clip = { x: position.x, y: position.y + offset, width: 1, height: 1, scale: 1 };
    return (await send("Page.captureScreenshot", { format: "png", clip })).data;
  }
  for (const mode of ["none", "active"]) {
    await send("Emulation.setEmulatedMedia", { features: [{ name: "forced-colors", value: mode }] });
    assert.equal(await evaluate("matchMedia('(forced-colors: active)').matches"), mode === "active");
    for (const row of [0, 1]) {
      assert.notEqual(await pixel(active, row), await pixel(inactive, row),
        `Selected underline must paint both rows distinctly with forced-colors: ${mode}`);
    }
  }
});
