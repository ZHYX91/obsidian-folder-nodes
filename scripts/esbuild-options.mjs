import { readFileSync } from "node:fs";
import path from "node:path";

const notices = readFileSync(new URL("../THIRD_PARTY_NOTICES.txt", import.meta.url), "utf8").trimEnd();

export function createEsbuildOptions({
  production = false,
  projectRoot = process.cwd(),
} = {}) {
  return {
    absWorkingDir: projectRoot,
    banner: { js: `/*!\n${notices}\n*/` },
    bundle: true,
    charset: "utf8",
    entryPoints: ["main.ts"],
    external: ["obsidian", "electron", "@codemirror/state", "@codemirror/view"],
    format: "cjs",
    loader: { ".css": "text" },
    target: "es2020",
    logLevel: "info",
    minify: production,
    sourcemap: production ? false : "inline",
    treeShaking: true,
    outfile: path.join(projectRoot, "dist", "main.js"),
  };
}
