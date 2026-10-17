import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { assertSemanticAnchors } from "./markdown-contract.mjs";

const REQUIRED_ENGLISH = [
  "Screenshots",
  "Features",
  "Requirements and compatibility",
  "Installation",
  "Usage",
  "Settings",
  "Folder Nodes property",
  "Icon property",
  "Limitations",
  "Privacy and security",
  "Development",
  "Support",
  "License",
];
const REQUIRED_CHINESE = [
  "截图",
  "功能特性",
  "使用要求与兼容性",
  "安装",
  "使用",
  "设置",
  "Folder Nodes 属性",
  "icon 属性",
  "限制",
  "隐私与安全",
  "开发",
  "支持",
  "许可证",
];
const SEMANTIC_ANCHORS = [
  ["GIFs use still thumbnails", "GIF 使用静态缩略图"],
  ["video and audio never receive inline playback controls", "视频和音频不提供内嵌播放控件"],
  ["never reads the clipboard", "从不读取剪贴板"],
  ["Obsidian 1.12.7 or later", "Obsidian 1.12.7 或更高版本"],
];

function headings(source) {
  return [...source.matchAll(/^##\s+(.+)$/gmu)].map((match) => match[1]);
}

export async function checkReadmeI18n(projectRoot = process.cwd()) {
  const [english, chinese] = await Promise.all([
    readFile(path.join(projectRoot, "README.md"), "utf8"),
    readFile(path.join(projectRoot, "docs/i18n/README.zh-CN.md"), "utf8"),
  ]);
  for (const [source, required, label] of [[english, REQUIRED_ENGLISH, "README.md"], [chinese, REQUIRED_CHINESE, "Chinese README"]]) {
    if (!source.startsWith("# Folder Nodes\n")) throw new Error(`${label} must identify Folder Nodes`);
    const actual = headings(source);
    if (JSON.stringify(actual) !== JSON.stringify(required)) {
      throw new Error(`${label} H2 structure must be exactly: ${required.join(" -> ")}`);
    }
  }
  if (!english.includes("docs/i18n/README.zh-CN.md")) throw new Error("README.md must link its Chinese translation");
  assertSemanticAnchors(english, SEMANTIC_ANCHORS.map(([anchor]) => anchor), "README.md");
  assertSemanticAnchors(chinese, SEMANTIC_ANCHORS.map(([, anchor]) => anchor), "Chinese README");
  // The two complete references and ten localized getting-started guides must
  // link to every supported reading language. This also checks the draft branch,
  // where absolute links to main would hide missing translations.
  const LOCALES = ["zh-CN", "zh-TW", "ja", "ko", "de", "fr", "es", "pt-BR", "ru", "vi", "ar"];
  const expectedInnerLinks = ["../../README.md", ...LOCALES.map((locale) => `README.${locale}.md`)];
  const rootNavigation = english.split("\n")[2] ?? "";
  for (const locale of LOCALES) {
    if (!rootNavigation.includes(`docs/i18n/README.${locale}.md`)) {
      throw new Error(`Root README lacks the ${locale} navigation link`);
    }
  }
  if (!rootNavigation.includes("(README.md)")) {
    throw new Error("Root README lacks the English navigation link");
  }

  for (const locale of LOCALES) {
    const relativePath = `docs/i18n/README.${locale}.md`;
    const source = locale === "zh-CN" ? chinese : await readFile(path.join(projectRoot, relativePath), "utf8");
    if (!source.startsWith("# Folder Nodes\n\n")) {
      throw new Error(`${relativePath} must identify Folder Nodes`);
    }
    const navigation = source.split("\n")[2] ?? "";
    for (const link of expectedInnerLinks) {
      if (!navigation.includes(`(${link})`)) {
        throw new Error(`${relativePath} lacks navigation to ${link}`);
      }
    }
    for (const term of ["A/A.md", "hidden=true", "icon", "Node Graph", "Obsidian 1.12.7"]) {
      if (locale !== "zh-CN" && !source.includes(term)) {
        throw new Error(`${relativePath} lacks essential guidance: ${term}`);
      }
    }
    if (locale !== "zh-CN") {
      if (headings(source).length !== REQUIRED_ENGLISH.length) {
        throw new Error(`${relativePath} must cover all ${REQUIRED_ENGLISH.length} canonical chapters`);
      }
      const essential = [
        "data.json", "order=manual", "rank=N", "hidden=true",
        "folderNodeChildrenSort", "folderNodeSiblingRank", "folderNodeHidden",
        "frontmatter", "Canvas", "HEIC/HEIF", "README.md",
        "index.md", "_A.md", "npm ci", "npm run check",
        "npm run release:check", "24.19.0", "11.17.0",
        "AGENTS.md", "CLAUDE.md",
      ];
      // These safeguards must have equivalent localized explanations, not
      // merely a top navigation bar and a brief introduction.
      for (const token of essential.filter((value) => value !== "AGENTS.md" && value !== "CLAUDE.md")) {
        if (!source.includes(token)) throw new Error(`${relativePath} lacks ${token}`);
      }
      for (const file of [
        "folder-nodes-contents-en.png", "folder-nodes-explorer-en.png",
        "folder-nodes-graph-en.png", "folder-nodes-settings-icons-en.png",
        "folder-nodes-creation-en.png",
      ]) {
        if (!source.includes(file)) throw new Error(`${relativePath} lacks screenshot ${file}`);
      }
      if (!source.includes("https://github.com/ZHYX91/obsidian-folder-nodes/issues/new/choose")) {
        throw new Error(`${relativePath} must link to actionable support`);
      }
      const chapters = source.split(/^## .+$/gmu).slice(1);
      if (chapters.length !== REQUIRED_ENGLISH.length || chapters.some((chapter) => chapter.trim().length < 60)) {
        throw new Error(`${relativePath} has missing or empty translated chapters`);
      }
    }
  }
  return 12;
}

const entryPoint = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : undefined;
if (import.meta.url === entryPoint) {
  const count = await checkReadmeI18n();
  process.stdout.write(`README translation contract passed for ${count} files.\n`);
}
