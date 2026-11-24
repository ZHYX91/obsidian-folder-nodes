import assert from "node:assert/strict";
import { withBrowserFixture } from "./browser-fixture.mjs";

await withBrowserFixture({
  entry: "tests/browser/visual-picker.fixture.ts",
  stylesheet: "src/ui/styles.css",
  ready: "typeof window.openVisualPicker === 'function'",
}, async ({ send, evaluate }) => {
  for (const touch of [false, true]) {
    await send("Emulation.setTouchEmulationEnabled", { enabled: touch });
    for (const direction of ["ltr", "rtl"]) {
      for (const width of [220, 560]) {
        await evaluate(`window.openVisualPicker(${width}, "${direction}")`);
        const result = await evaluate(`(() => {
          const row = document.querySelector(".folder-nodes-visual-candidate");
          const input = row.querySelector("input").getBoundingClientRect();
          const targets = Array.from(document.querySelectorAll(
            ".folder-nodes-visual-presets button, .folder-nodes-visual-candidate button, .folder-nodes-visual-candidate input"
          ), button => button.getBoundingClientRect());
          return {
            targets: targets.map(({ width, height }) => [width, height]),
            input: input.width,
            row: row.clientWidth,
            overflow: row.scrollWidth - row.clientWidth
          };
        })()`);
        const minimum = touch ? 44 : 36;
        const context = JSON.stringify({ width, direction, touch, result });
        assert.ok(result.targets.length > 6 && result.targets.every(([w, h]) => w >= minimum && h >= minimum), context);
        assert.ok(result.overflow <= 1, context);
        if (width === 220) assert.ok(result.input >= result.row - 1, context);
      }
    }
  }
  console.log("Icon candidate input and actions fit eight width, direction and pointer combinations.");
});
