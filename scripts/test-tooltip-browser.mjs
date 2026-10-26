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
assert.ok(browser, "Install Chromium/Chrome/Edge or set CHROME_BIN to run real-layout tooltip regressions");
const bundle = await build({ entryPoints: [path.join(root, "tests/browser/tooltip-reset.fixture.ts")], bundle: true,
  write: false, platform: "browser", format: "iife", plugins: [{ name: "obsidian-dom-only", setup(builder) {
    builder.onResolve({ filter: /^obsidian$/ }, () => ({ path: "obsidian", namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: "export function setIcon() {}", loader: "js" }));
  } }] });
const css = readFileSync(path.join(root, "src/ui/node-graph.css"), "utf8");
const html = `<!doctype html><meta charset="utf-8"><style>[hidden]{display:none!important}body{margin:0;font:14px Arial}.surface{position:relative;width:680px;height:590px;--text-normal:#111;--background-secondary-alt:#fff;--background-modifier-border:#ccc;--font-ui-smaller:14px}${css}</style><body><img hidden src="/hold"><script>${bundle.outputFiles[0].text}</script>`;
const server = createServer((request, response) => {
  if (request.url === "/hold") { setTimeout(() => response.end(), 3_000); return; }
  response.setHeader("Content-Type", "text/html; charset=utf-8"); response.end(html);
});
let profile;
let browserClosed = true;
try {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const endpoint = server.address();
  assert.ok(endpoint && typeof endpoint !== "string");
  profile = mkdtempSync(path.join(os.tmpdir(), "folder-nodes-browser-"));
  const output = await new Promise((resolve, reject) => {
    const child = spawn(browser, ["--headless", "--disable-gpu", "--no-first-run", "--disable-extensions", "--disable-background-networking",
      `--user-data-dir=${profile}`, "--dump-dom", "--run-all-compositor-stages-before-draw", `http://127.0.0.1:${endpoint.port}/`], { windowsHide: true });
    browserClosed = false;
    let stdout = "";
    let error;
    let shutdownTimeout;
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.resume();
    const timeout = setTimeout(() => {
      error = new Error("Chromium layout regression timed out");
      child.kill();
      shutdownTimeout = setTimeout(() => reject(new Error(`Chromium did not close; retained profile ${profile}`)), 2_000);
    }, 30_000);
    child.once("error", (cause) => { error = cause; });
    child.once("close", (code) => {
      browserClosed = true;
      clearTimeout(timeout);
      clearTimeout(shutdownTimeout);
      if (error) reject(error);
      else if (code !== 0) reject(new Error(`Chromium exited ${code}`));
      else resolve(stdout);
    });
  });
  const encoded = /data-result="([^"]*)"/u.exec(output)?.[1];
  assert.ok(encoded, "Chromium did not finish the production-renderer layout checks");
  const result = JSON.parse(encoded.replaceAll("&quot;", '"').replaceAll("&amp;", "&"));
  process.stdout.write(`${JSON.stringify(result)}\n`);
  assert.equal(result.passed, true, result.error);
} finally {
  if (server.listening) await new Promise((resolve) => server.close(resolve));
  if (profile && browserClosed) {
    const absolute = path.resolve(profile);
    try {
      assert.equal(realpathSync.native(absolute), absolute);
      assert.equal(path.dirname(absolute), realpathSync.native(os.tmpdir()));
      assert.ok(path.basename(absolute).startsWith("folder-nodes-browser-") && !lstatSync(absolute).isSymbolicLink());
      rmSync(absolute, { recursive: true, force: false });
    } catch (error) {
      process.exitCode = 1;
      process.stderr.write(`Browser profile cleanup failed; retained ${absolute}: ${String(error)}\n`);
    }
  } else if (profile) {
    process.exitCode = 1;
    process.stderr.write(`Browser is not confirmed closed; retained profile ${profile}\n`);
  }
}
