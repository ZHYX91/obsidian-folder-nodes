import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const REQUIRED_ENGLISH = ["Features", "Requirements and compatibility", "Installation", "Usage", "Settings", "Limitations", "Privacy and security", "Development", "Support", "License"];
const REQUIRED_CHINESE = ["功能特性", "使用要求与兼容性", "安装", "使用", "设置", "限制", "隐私与安全", "开发", "支持", "许可证"];

export async function checkReadmeI18n(projectRoot = process.cwd()) {
  const [english, chinese] = await Promise.all([
    readFile(path.join(projectRoot, "README.md"), "utf8"),
    readFile(path.join(projectRoot, "docs/i18n/README.zh-CN.md"), "utf8"),
  ]);
  for (const [source, headings, label] of [[english, REQUIRED_ENGLISH, "README.md"], [chinese, REQUIRED_CHINESE, "Chinese README"]]) {
    if (!source.startsWith("# Folder Nodes\n")) throw new Error(`${label} must identify Folder Nodes`);
    for (const heading of headings) {
      if (!source.includes(`\n## ${heading}\n`)) throw new Error(`${label} is missing ${heading}`);
    }
  }
  if (!english.includes("docs/i18n/README.zh-CN.md")) throw new Error("README.md must link its Chinese translation");
  return 2;
}

const entryPoint = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : undefined;
if (import.meta.url === entryPoint) {
  const count = await checkReadmeI18n();
  process.stdout.write(`README translation contract passed for ${count} files.\n`);
}
