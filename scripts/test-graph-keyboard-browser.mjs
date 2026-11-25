import assert from "node:assert/strict";
import { withBrowserFixture } from "./browser-fixture.mjs";

await withBrowserFixture({
  entry: "tests/browser/graph-keyboard.fixture.ts",
  stylesheet: "src/ui/node-graph.css",
  ready: "Boolean(window.graphKeyboard)",
}, async ({ send, evaluate }) => {
  await send("Emulation.setDeviceMetricsOverride", { width: 360, height: 780, deviceScaleFactor: 1, mobile: false });
  for (const language of ["ar", "de"]) {
    await evaluate(`window.graphKeyboard.prepare("dom", "unbound", {language: "${language}", width: 360})`);
    const summary = await evaluate(`(() => {
      document.querySelector(".folder-nodes-node-graph-links-toggle").click();
      const status = document.querySelector(".folder-nodes-node-graph-link-summary");
      const primary = status.parentElement.getBoundingClientRect();
      const bounds = status.getBoundingClientRect();
      const text = document.createRange();
      text.selectNodeContents(status.querySelector(".folder-nodes-node-graph-link-summary-text"));
      return { text: status.textContent, insideToolbar: bounds.left >= primary.left - 1 && bounds.right <= primary.right + 1,
        fits: [...text.getClientRects()].every(rect => rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1) };
    })()`);
    assert.ok(summary.text && summary.insideToolbar && summary.fits, `${language} graph status is clipped: ${JSON.stringify(summary)}`);
  }
  await send("Emulation.clearDeviceMetricsOverride");
  await evaluate('window.graphKeyboard.prepare("dom", "unbound")');
  const labels = await evaluate(`Array.from(document.querySelectorAll(
    ".folder-nodes-node-graph-links-toggle, .folder-nodes-node-graph-range-button, .folder-nodes-node-graph-scope-button"
  ), button => ({ name: button.textContent.trim(), description: button.dataset.tooltip }))`);
  assert.equal(labels.length, 5);
  const { nodes } = await send("Accessibility.getFullAXTree");
  for (const label of labels) {
    const control = nodes.find((entry) => ["button", "switch"].includes(entry.role.value) && entry.name?.value === label.name);
    assert.equal(control?.description?.value, label.description, `Missing visible name or help for ${label.name}`);
  }
  const results = [];
  for (const kind of ["dom", "canvas", "overlay", "dom-handle", "overlay-handle"]) {
    for (const parent of ["handled", "declined", "unbound"]) {
      for (const key of ["Enter", " "]) {
      for (const modifiers of [0, 1, 8, 2, 4, 6, 9, 3, 10]) {
        const before = await evaluate(`window.graphKeyboard.prepare(${JSON.stringify(kind)},${JSON.stringify(parent)})`);
        assert.equal(before.focused, true, `${kind} target must actually own focus`);
        const code = key === "Enter" ? "Enter" : "Space";
        const keyCode = key === "Enter" ? 13 : 32;
        const text = key === "Enter" ? "\r" : " ";
        await send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: keyCode,
          nativeVirtualKeyCode: keyCode, modifiers, text, unmodifiedText: text });
        await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: keyCode, modifiers });
        await evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
        const after = await evaluate("window.graphKeyboard.state()");
        assert.ok(after.keys.length > 0 && after.keys.every((event) => event.trusted), "Use browser-trusted key events, not DOM dispatchEvent");
        const handle = kind.endsWith("handle");
        const modOpen = key === "Enter" && (modifiers === 2 || modifiers === 4);
        const supported = handle ? modifiers === 0 || modifiers === 1 : (modifiers === 0 && (key === "Enter" || kind !== "dom")) || modOpen;
        const intercepted = parent === "handled" && (handle ? key !== "Enter" || modifiers !== 1 : !modOpen);
        if (handle) {
          assert.equal(after.opens.length, 0);
          if (supported && !intercepted) {
            assert.notEqual(after.expanded, before.expanded, `native default or branch activation missing: ${kind}/${parent}/${modifiers}`);
            if (modifiers === 0) assert.ok(after.clicks.some((event) => event.trusted && event.detail === 0), "plain handle Enter must produce a trusted default click");
          } else assert.equal(after.expanded, before.expanded, `unsupported native click toggled: ${JSON.stringify({ kind, parent, modifiers, after })}`);
        } else if (supported && !intercepted) {
          assert.deepEqual(after.opens, [{ path: "Work", newLeaf: modifiers !== 0 }], `${kind}/${parent}/${modifiers}`);
        } else assert.equal(after.opens.length, 0, `unsupported chord opened: ${kind}/${parent}/${modifiers}`);
        if (kind === "dom" && key === " " && modifiers === 0 && !intercepted) {
          assert.ok(after.clicks.some((event) => event.trusted && event.detail === 0), "DOM Space must retain the native button click without opening");
        }
        results.push({ kind, parent, key, modifiers, opens: after.opens.length, defaultClicks: after.clicks });
      }
      }
    }
  }
  await evaluate("window.graphKeyboard.close()");
  process.stdout.write(`${JSON.stringify({ passed: true, checks: results.length, engine: await evaluate("navigator.userAgent"), results })}\n`);
});
