import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const choices = [process.env.CHROME_BIN, process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, "Google/Chrome/Application/chrome.exe"),
  process.env["PROGRAMFILES(X86)"] && path.join(process.env["PROGRAMFILES(X86)"], "Microsoft/Edge/Application/msedge.exe"),
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
const browser = choices.find((candidate) => candidate && existsSync(candidate));
assert.ok(browser, "Install Chromium/Chrome/Edge or set CHROME_BIN to run native keyboard regressions");
const bundle = await build({ entryPoints: [path.join(root, "tests/browser/graph-keyboard.fixture.ts")], bundle: true, write: false,
  platform: "browser", format: "iife", alias: { obsidian: path.join(root, "tests/mocks/obsidian.ts") } });
const css = readFileSync(path.join(root, "src/ui/node-graph.css"), "utf8");
const server = createServer((_request, response) => { response.setHeader("Content-Type", "text/html; charset=utf-8");
  response.end(`<!doctype html><meta charset="utf-8"><style>[hidden]{display:none!important}body{margin:0}${css}</style><script>${bundle.outputFiles[0].text}</script>`); });
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let profile;
let child;
let childClosed;
let socket;
let closed = true;
let launchError;
const pending = new Map();
let nextId = 0;
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`Chromium request timed out: ${method}`)); }, 5_000);
    pending.set(id, { resolve, reject, timeout });
    try { socket.send(JSON.stringify({ id, method, params })); }
    catch (error) { clearTimeout(timeout); pending.delete(id); reject(error); }
  });
}
async function evaluate(expression) {
  const response = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  assert.equal(response.exceptionDetails, undefined, JSON.stringify(response.exceptionDetails));
  return response.result.value;
}
try {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const endpoint = server.address();
  assert.ok(endpoint && typeof endpoint !== "string");
  profile = mkdtempSync(path.join(os.tmpdir(), "folder-nodes-keys-"));
  child = spawn(browser, ["--headless", "--window-size=1024,1000", "--disable-gpu", "--no-first-run", "--disable-extensions",
    "--disable-background-networking", "--remote-debugging-port=0", `--user-data-dir=${profile}`, `http://127.0.0.1:${endpoint.port}/`], { windowsHide: true });
  closed = false;
  childClosed = new Promise((resolve) => { child.once("close", () => { closed = true; resolve(); }); });
  child.once("error", (error) => { launchError = error; });
  child.stdout.resume(); child.stderr.resume();
  const deadline = Date.now() + 15_000;
  const portFile = path.join(profile, "DevToolsActivePort");
  while (!existsSync(portFile) && Date.now() < deadline && !closed && !launchError) await pause(50);
  assert.ok(existsSync(portFile), `Owned Chromium debugging endpoint did not become ready: ${String(launchError ?? "timeout")}`);
  const port = Number(readFileSync(portFile, "utf8").split("\n")[0]);
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(5_000) })).json();
  const tab = tabs.find((entry) => entry.type === "page" && entry.url === `http://127.0.0.1:${endpoint.port}/`);
  assert.ok(tab, "Owned test page not found");
  socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Owned Chromium socket did not open")), 5_000);
    socket.addEventListener("open", () => { clearTimeout(timeout); resolve(); }, { once: true });
    socket.addEventListener("error", (event) => { clearTimeout(timeout); reject(event); }, { once: true });
  });
  socket.addEventListener("message", (event) => { const response = JSON.parse(String(event.data)); const request = pending.get(response.id);
    if (!request) return; clearTimeout(request.timeout); pending.delete(response.id);
    if (response.error) request.reject(new Error(JSON.stringify(response.error))); else request.resolve(response.result); });
  socket.addEventListener("close", () => { for (const request of pending.values()) {
    clearTimeout(request.timeout); request.reject(new Error("Owned Chromium connection closed"));
  } pending.clear(); });
  await send("Page.bringToFront");
  while (!(await evaluate("Boolean(window.graphKeyboard)")) && Date.now() < deadline) await pause(50);
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
} finally {
  if (socket?.readyState === WebSocket.OPEN) { try { await send("Browser.close"); } catch { /* process close may win its response */ } }
  socket?.close();
  if (childClosed) await Promise.race([childClosed, pause(3_000)]);
  if (!closed && child) { child.kill(); await Promise.race([childClosed, pause(3_000)]); }
  if (server.listening) await new Promise((resolve) => server.close(resolve));
  if (profile && closed) {
    const absolute = path.resolve(profile);
    try {
      assert.equal(realpathSync.native(absolute), absolute);
      assert.equal(path.dirname(absolute), realpathSync.native(os.tmpdir()));
      assert.ok(path.basename(absolute).startsWith("folder-nodes-keys-") && !lstatSync(absolute).isSymbolicLink());
      rmSync(absolute, { recursive: true, force: false });
    } catch (error) {
      process.exitCode = 1; process.stderr.write(`Browser cleanup failed; retained ${absolute}: ${String(error)}\n`);
    }
  } else if (profile) {
    process.exitCode = 1; process.stderr.write(`Chromium did not close; retained profile ${profile}\n`);
  }
}
