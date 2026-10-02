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
  return 2;
}

const entryPoint = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : undefined;
if (import.meta.url === entryPoint) {
  const count = await checkReadmeI18n();
  process.stdout.write(`README translation contract passed for ${count} files.\n`);
}
