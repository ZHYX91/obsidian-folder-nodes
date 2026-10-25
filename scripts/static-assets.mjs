import { randomUUID } from "node:crypto";
import { copyFile, lstat, mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";

export const STATIC_ASSETS = Object.freeze(["manifest.json", "styles.css"]);
const activeSyncs = new Map();

export function syncStaticAssets({
  projectRoot = process.cwd(),
  outputDirectory = path.join(projectRoot, "dist"),
} = {}) {
  const key = path.resolve(outputDirectory);
  const previous = activeSyncs.get(key) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(() => copyStaticAssets(projectRoot, key));
  activeSyncs.set(key, current);
  void current.finally(() => {
    if (activeSyncs.get(key) === current) activeSyncs.delete(key);
  }).catch(() => undefined);
  return current;
}

async function copyStaticAssets(projectRoot, outputDirectory) {
  const sources = await Promise.all(STATIC_ASSETS.map(async (asset) => {
    const source = path.join(projectRoot, asset);
    const sourceStats = await lstat(source);
    if (!sourceStats.isFile() || sourceStats.isSymbolicLink()) {
      throw new Error(`Static asset must be a regular file: ${asset}`);
    }
    return { asset, source };
  }));
  await mkdir(outputDirectory, { recursive: true });
  for (const { asset, source } of sources) {
    const destination = path.join(outputDirectory, asset);
    const temporary = `${destination}.folder-nodes-${process.pid}-${randomUUID()}.tmp`;
    try {
      await copyFile(source, temporary);
      await rename(temporary, destination);
    } finally {
      await rm(temporary, { force: true });
    }
  }
}

export function createStaticAssetSync({
  projectRoot = process.cwd(),
  outputDirectory = path.join(projectRoot, "dist"),
  debounceMilliseconds = 50,
  retryDelays = [25, 75, 150],
  synchronize = syncStaticAssets,
  logger = console,
} = {}) {
  let timer;
  let tail = Promise.resolve();
  let closed = false;
  let lastError;

  async function synchronizeWithRetry() {
    for (let attempt = 0; ; attempt += 1) {
      try {
        await synchronize({ projectRoot, outputDirectory });
        return;
      } catch (error) {
        if (error?.code !== "ENOENT" || attempt >= retryDelays.length) throw error;
        await new Promise((resolve) => setTimeout(resolve, retryDelays[attempt]));
      }
    }
  }

  function enqueue() {
    timer = undefined;
    tail = tail.then(synchronizeWithRetry).then(
      () => { lastError = undefined; },
      (error) => {
        lastError = error;
        logger.error("Failed to synchronize static assets", error);
      },
    );
  }

  function schedule(filename) {
    if (closed || (filename != null && !STATIC_ASSETS.includes(filename.toString()))) return;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(enqueue, debounceMilliseconds);
  }

  async function flush() {
    if (timer !== undefined) {
      clearTimeout(timer);
      enqueue();
    }
    await tail;
    if (lastError !== undefined) throw lastError;
  }

  async function close() {
    closed = true;
    await flush();
  }

  return { close, flush, schedule };
}
