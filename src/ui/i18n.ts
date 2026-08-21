import { getLanguage } from "obsidian";
import type { InterfaceLanguage } from "../core/types";

const zh = {
  settings: "Folder Nodes 设置", general: "常规", naming: "选区与命名",
  initialize: "初始化 Folder Nodes", migration: "扫描并迁移 Vault", health: "扫描节点健康状态",
  createChild: "创建子节点", createSelection: "从选中文字创建 Folder Node",
  contents: "打开节点内容视图", moveUp: "节点上移", moveDown: "节点下移",
  rename: "重命名节点", delete: "删除节点", move: "移动节点", merge: "合并节点",
  managed: "当前 Vault 已由 Folder Nodes 管理。", unadopted: "当前 Vault 尚未接管；不会自动修改已有结构。",
  language: "界面语言", languageDesc: "选择“跟随 Obsidian”可使用 Obsidian 的界面语言。", auto: "跟随 Obsidian",
  chinese: "简体中文", english: "English", iconInheritance: "图标继承",
  iconInheritanceDesc: "当前节点没有有效 icon 时，使用最近祖先节点的视觉标识。",
  template: "默认节点笔记模板",
  templateDesc: "Vault 内的 Markdown 模板路径；支持 {{name}}、{{path}}、{{parent}} 和 {{date}}。",
  initializeDesc: "仅用于空 Vault 或已经符合 Folder Nodes 结构的 Vault。",
  migrationDesc: "始终先显示只读预览，明确提交前不会修改文件。",
  aliases: "添加 aliases 属性", aliasesDesc: "alias 只使用选中文字；前后缀仅影响文件名。",
  prefix: "前缀", suffix: "后缀", enabled: "启用", source: "来源", separator: "连接符",
  customText: "自定义文本", currentFile: "当前文件名", currentNode: "当前 Folder Node",
  currentHeading: "当前标题", timestamp: "时间戳", timestampFormat: "时间戳格式",
  timestampFormatDesc: "支持：%Y %m %d %H %M %S", preview: "预览", create: "创建",
  cancel: "取消", confirm: "确认", moveToTrash: "移到回收站", nodeContents: "节点内容",
  nodes: "节点", files: "文件", openParent: "打开父节点",
  noCurrentNode: "打开 Folder Node 中的笔记以查看其内容。", showMore: "再显示 {count} 项",
  editVisual: "设置节点视觉", visualValue: "icon 值",
  visualValueDesc: "输入 Emoji、Lucide 名称、颜色或 Vault 图片 WikiLink；留空可删除。",
  selectionPreview: "从选中文字创建 Folder Node", targetNode: "目标节点", notePath: "节点笔记",
  aliasValue: "Alias", wikiLink: "WikiLink", reloadLanguage: "命令名称将在插件下次加载时使用新语言。",
  leafMarkdown: "叶子 Markdown", missingNotes: "缺失节点笔记", conflicts: "阻塞冲突",
  healthSummary: "Folder Nodes 健康状态", root: "根节点", visualInherited: "继承自 {name}",
  templateNotFound: "未找到模板：{path}；已创建空白节点笔记。",
  sampleSelection: "选中文字",
  errorPathExists: "目标已存在：{path}", errorInvalidMove: "节点不能移动或合并到自身或后代节点。",
  errorMissingNote: "缺少节点笔记：{path}", errorMergeConflict: "合并冲突：{detail}",
  errorMigrationConflict: "迁移存在阻塞冲突。", errorSelectionChanged: "预览后选区已改变，创建已停止。",
  errorUnknownTarget: "找不到目标节点：{path}", errorGeneric: "操作安全停止：{message}",
};

const en: typeof zh = {
  settings: "Folder Nodes settings", general: "General", naming: "Selection & naming",
  initialize: "Initialize Folder Nodes", migration: "Scan and migrate Vault", health: "Scan node tree health",
  createChild: "Create child node", createSelection: "Create Folder Node from selection",
  contents: "Open node contents", moveUp: "Move node up", moveDown: "Move node down",
  rename: "Rename node", delete: "Delete node", move: "Move node", merge: "Merge node",
  managed: "This Vault is managed by Folder Nodes.", unadopted: "This Vault is not adopted; existing structure is read-only.",
  language: "Interface language", languageDesc: "Choose Follow Obsidian to use Obsidian's interface language.", auto: "Follow Obsidian",
  chinese: "简体中文", english: "English", iconInheritance: "Icon inheritance",
  iconInheritanceDesc: "Use the nearest ancestor visual when the current node has no valid icon.",
  template: "Default Node Note template",
  templateDesc: "Vault-relative Markdown template path. Supports {{name}}, {{path}}, {{parent}}, and {{date}}.",
  initializeDesc: "Use only for an empty or already structured Vault.",
  migrationDesc: "Always shows a read-only preview. Nothing changes until you explicitly commit.",
  aliases: "Add aliases property", aliasesDesc: "The alias uses only selected text; prefixes and suffixes affect only the file name.",
  prefix: "Prefix", suffix: "Suffix", enabled: "Enabled", source: "Source", separator: "Separator",
  customText: "Custom text", currentFile: "Current file name", currentNode: "Current Folder Node",
  currentHeading: "Current heading", timestamp: "Timestamp", timestampFormat: "Timestamp format",
  timestampFormatDesc: "Supported: %Y %m %d %H %M %S", preview: "Preview", create: "Create",
  cancel: "Cancel", confirm: "Confirm", moveToTrash: "Move to trash", nodeContents: "Node contents",
  nodes: "Nodes", files: "Files", openParent: "Open parent node",
  noCurrentNode: "Open a note inside a Folder Node to view its contents.", showMore: "Show {count} more",
  editVisual: "Set node visual", visualValue: "Icon value",
  visualValueDesc: "Enter an emoji, Lucide name, color, or Vault image wikilink; leave empty to remove it.",
  selectionPreview: "Create Folder Node from selection", targetNode: "Target node", notePath: "Node note",
  aliasValue: "Alias", wikiLink: "WikiLink", reloadLanguage: "Command names will use the new language after the plugin reloads.",
  leafMarkdown: "Leaf Markdown", missingNotes: "Missing node notes", conflicts: "Blocking conflicts",
  healthSummary: "Folder Nodes health", root: "Root", visualInherited: "Inherited from {name}",
  templateNotFound: "Template not found: {path}; a blank Node Note was created.",
  sampleSelection: "Selected text",
  errorPathExists: "Target already exists: {path}", errorInvalidMove: "A node cannot be moved or merged into itself or a descendant.",
  errorMissingNote: "Missing Node Note: {path}", errorMergeConflict: "Merge conflict: {detail}",
  errorMigrationConflict: "Migration contains blocking conflicts.", errorSelectionChanged: "The selection changed after preview; creation stopped.",
  errorUnknownTarget: "Target node not found: {path}", errorGeneric: "Operation stopped safely: {message}",
};

export type TranslationKey = keyof typeof zh;
let configuredLanguage: InterfaceLanguage = "auto";

export function setLanguage(language: InterfaceLanguage): void { configuredLanguage = language; }

export function resolvedLanguage(): "zh-CN" | "en" {
  if (configuredLanguage !== "auto") return configuredLanguage;
  return getLanguage().toLocaleLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

export function t(key: TranslationKey, values: Record<string, string | number> = {}): string {
  const dictionary = resolvedLanguage() === "zh-CN" ? zh : en;
  return Object.entries(values).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    dictionary[key],
  );
}

export function formatError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const pathExists = /^Path already exists:\s*(.+)$/u.exec(message)?.[1];
  if (pathExists !== undefined) return t("errorPathExists", { path: pathExists });
  if (/cannot be moved|cannot be merged/u.test(message)) return t("errorInvalidMove");
  const missing = /^(?:Missing node note|Cannot update missing node note):\s*(.+)$/u.exec(message)?.[1];
  if (missing !== undefined) return t("errorMissingNote", { path: missing });
  const merge = /^Merge (?:property )?conflict:\s*(.+)$/u.exec(message)?.[1];
  if (merge !== undefined) return t("errorMergeConflict", { detail: merge });
  if (message === "Migration contains blocking conflicts") return t("errorMigrationConflict");
  if (message === "Selection changed after preview") return t("errorSelectionChanged");
  const target = /^Unknown target node:\s*(.+)$/u.exec(message)?.[1];
  if (target !== undefined) return t("errorUnknownTarget", { path: target });
  return t("errorGeneric", { message });
}
