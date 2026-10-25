import { mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

// @ts-expect-error The development build helper is plain ESM.
import { createStaticAssetSync, syncStaticAssets } from "../../scripts/static-assets.mjs";

const roots: string[] = [];

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "folder-nodes-static-assets-"));
  roots.push(root);
  await writeFile(path.join(root, "manifest.json"), '{"version":"test"}\n');
  await writeFile(path.join(root, "styles.css"), ".old {}\n");
  return { projectRoot: root, outputDirectory: path.join(root, "dist") };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith("folder-nodes-static-assets-")) {
      throw new Error("Refusing to clean an unexpected static asset fixture");
    }
    await rm(root, { recursive: true, force: true });
  }
});

describe("development static assets", () => {
  it("gives concurrent copies independent temporary files", async () => {
    const options = await fixture();
    const css = ".latest {}\n".repeat(100_000);
    await writeFile(path.join(options.projectRoot, "styles.css"), css);

    await Promise.all(Array.from({ length: 12 }, () => syncStaticAssets(options)));

    expect(await readFile(path.join(options.outputDirectory, "styles.css"), "utf8")).toBe(css);
    expect(await readFile(path.join(options.outputDirectory, "manifest.json"), "utf8")).toBe('{"version":"test"}\n');
    expect((await readdir(options.outputDirectory)).sort()).toEqual(["manifest.json", "styles.css"]);
  });

  it("serializes saves, coalesces pending events, and flushes the newest atomic save before closing", async () => {
    const options = await fixture();
    const started = deferred();
    const release = deferred();
    let active = 0;
    let maxActive = 0;
    let copies = 0;
    const synchronize = async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      copies += 1;
      await syncStaticAssets(options);
      if (copies === 1) {
        started.resolve();
        await release.promise;
      }
      active -= 1;
    };
    const sync = createStaticAssetSync({ ...options, synchronize });
    sync.schedule("styles.css");
    const firstFlush = sync.flush();
    await started.promise;
    await writeFile(path.join(options.projectRoot, "styles.swap"), ".newest {}\n");
    await rename(path.join(options.projectRoot, "styles.swap"), path.join(options.projectRoot, "styles.css"));
    await writeFile(path.join(options.projectRoot, "manifest.json"), '{"version":"newest"}\n');
    sync.schedule(Buffer.from("styles.css"));
    sync.schedule("manifest.json");
    sync.schedule(null);
    let closed = false;
    const closing = sync.close().then(() => { closed = true; });
    await Promise.resolve();
    expect(closed).toBe(false);
    release.resolve();
    await Promise.all([firstFlush, closing]);

    expect(maxActive).toBe(1);
    expect(copies).toBe(2);
    expect(await readFile(path.join(options.outputDirectory, "styles.css"), "utf8")).toBe(".newest {}\n");
    expect(await readFile(path.join(options.outputDirectory, "manifest.json"), "utf8")).toBe('{"version":"newest"}\n');
    sync.schedule("styles.css");
    await sync.flush();
    expect(copies).toBe(2);
  });

  it("retries a source temporarily absent during an editor replacement", async () => {
    const options = await fixture();
    const logger = { error: vi.fn() };
    const synchronize = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error("source being replaced"), { code: "ENOENT" }))
      .mockImplementation(() => syncStaticAssets(options));
    const sync = createStaticAssetSync({ ...options, logger, retryDelays: [0], synchronize });
    sync.schedule("styles.css");
    await sync.close();

    expect(synchronize).toHaveBeenCalledTimes(2);
    expect(logger.error).not.toHaveBeenCalled();
    expect(await readFile(path.join(options.outputDirectory, "styles.css"), "utf8")).toBe(".old {}\n");
  });

  it("reports a failed save without an unhandled rejection and lets a later save recover", async () => {
    const options = await fixture();
    const logger = { error: vi.fn() };
    const failure = Object.assign(new Error("permission denied"), { code: "EACCES" });
    const synchronize = vi.fn()
      .mockRejectedValueOnce(failure)
      .mockImplementation(() => syncStaticAssets(options));
    const sync = createStaticAssetSync({ ...options, logger, synchronize });
    sync.schedule("styles.css");
    await expect(sync.flush()).rejects.toBe(failure);
    expect(logger.error).toHaveBeenCalledWith("Failed to synchronize static assets", failure);
    sync.schedule("styles.css");
    await sync.close();
    expect(synchronize).toHaveBeenCalledTimes(2);
  });

  it("ignores unrelated files and rejects shutdown when the last save failed", async () => {
    const failure = new Error("static source is not a file");
    const synchronize = vi.fn().mockRejectedValue(failure);
    const sync = createStaticAssetSync({ logger: { error: vi.fn() }, synchronize });
    sync.schedule("main.ts");
    await sync.flush();
    expect(synchronize).not.toHaveBeenCalled();
    sync.schedule("manifest.json");
    await expect(sync.close()).rejects.toBe(failure);
  });
});
