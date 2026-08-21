import { getLanguage } from "obsidian";
import type { InterfaceLanguage } from "../core/types";

const zh = {
  settings: "Folder Nodes 设置", general: "常规", homepage: "主页", icons: "图标与外观", naming: "选区与命名",
  initialize: "初始化 Folder Nodes", migration: "扫描并迁移 Vault", maintenance: "初始化与维护", health: "检查结构健康状态",
  maintenanceDesc: "先预览将创建、移动、跳过和阻止的具体路径；确认前不会修改 Vault。", reviewChanges: "查看变更",
  healthDesc: "只读检查当前结构，不提供写入按钮。",
  createChild: "创建子节点", createSelection: "从选中文字创建 Folder Node",
  contents: "打开节点内容视图", moveUp: "节点上移", moveDown: "节点下移",
  rename: "重命名节点", delete: "删除节点", move: "移动节点", merge: "合并节点",
  managed: "当前 Vault 已由 Folder Nodes 管理。", unadopted: "当前 Vault 尚未接管；不会自动修改已有结构。",
  language: "界面语言", languageDesc: "选择“跟随 Obsidian”可使用 Obsidian 的界面语言。", auto: "跟随 Obsidian",
  chinese: "简体中文", english: "English", iconInheritance: "图标继承",
  iconInheritanceDesc: "当前节点没有有效 icon 时，使用最近祖先节点的视觉标识。",
  template: "默认节点笔记模板",
  templateDesc: "Vault 内的 Markdown 模板路径；支持 {{name}}、{{path}}、{{parent}} 和 {{date}}。",
  enableHomepage: "启用主页", enableHomepageDesc: "将 Vault 根节点的同名 Markdown 作为主页。",
  openHomepage: "打开主页", openHomepageDesc: "打开根节点的同名 Markdown；节点内容视图也会显示主页按钮。",
  openHomepageOnStartup: "启动时打开主页", openHomepageOnStartupDesc: "Obsidian 完成 Vault 布局恢复后打开主页。",
  homepageDisabled: "主页尚未启用。", homepageMissing: "根节点笔记尚不存在；请先在“初始化与维护”中查看并应用变更。",
  explorerIconPosition: "文件列表图标位置", explorerIconPositionDesc: "节点有明确图标时，显示在名称之前、之后或隐藏。",
  beforeName: "名称之前", afterName: "名称之后", hidden: "隐藏",
  showIconInNoteTitle: "在笔记标题中显示图标", showIconInNoteTitleDesc: "在 Folder Node 的行内标题前显示同一个图标。",
  initializeDesc: "仅用于空 Vault 或已经符合 Folder Nodes 结构的 Vault。",
  migrationDesc: "始终先显示只读预览，明确提交前不会修改文件。",
  aliases: "添加 aliases 属性", aliasesDesc: "alias 只使用选中文字；前后缀仅影响文件名。",
  prefix: "前缀", suffix: "后缀", enabled: "启用", source: "来源", separator: "连接符",
  customText: "自定义文本", currentFile: "当前文件名", currentNode: "当前 Folder Node",
  currentHeading: "当前标题", timestamp: "时间戳", timestampFormat: "时间戳格式",
  timestampFormatDesc: "支持：%Y %m %d %H %M %S", preview: "预览", create: "创建",
  cancel: "取消", confirm: "确认", moveToTrash: "移到回收站", nodeContents: "节点内容",
  nodes: "节点", album: "相册", files: "文件", video: "视频", openParent: "打开父节点",
  noCurrentNode: "打开 Folder Node 中的笔记以查看其内容。", showMore: "再显示 {count} 项",
  editVisual: "设置节点视觉", visualValue: "icon 值",
  visualValueDesc: "输入 Emoji、Lucide 名称、颜色或 Vault 图片 WikiLink；留空可删除。",
  selectionPreview: "从选中文字创建 Folder Node", targetNode: "目标节点", notePath: "节点笔记",
  aliasValue: "Alias", wikiLink: "WikiLink", reloadLanguage: "命令名称将在插件下次加载时使用新语言。",
  leafMarkdown: "叶子 Markdown", missingNotes: "缺失节点笔记", conflicts: "阻塞冲突",
  leafExemptions: "允许的叶子笔记", leafExemptionsDesc: "这些精确路径可保持为叶子 Markdown；默认包含根目录的 AGENTS.md 和 CLAUDE.md。",
  folderExemptions: "不管理的文件夹", folderExemptionsDesc: "Folder Nodes 不初始化、迁移、修复该文件夹及其子目录。豁免不会隐藏内容。",
  leafExemptionItemDesc: "保持为叶子 Markdown", folderExemptionItemDesc: "整个子树不由 Folder Nodes 管理",
  addExemption: "添加豁免", addLeafExemption: "添加叶子笔记路径", addFolderExemption: "添加文件夹路径",
  noExemptions: "暂无路径。", add: "添加", remove: "移除",
  skippedLeafNotes: "因叶子笔记豁免而跳过", skippedFolders: "因文件夹豁免而跳过",
  createNodeNotes: "将创建的节点笔记", moveLeafNotes: "将移动的叶子 Markdown", noChanges: "没有需要应用的结构变更。",
  applyChanges: "应用变更", startManaging: "开始管理", readOnlyHealth: "这是只读检查；此窗口不会修改 Vault。",
  healthSummary: "Folder Nodes 健康状态", root: "根节点", visualInherited: "继承自 {name}",
  templateNotFound: "未找到模板：{path}；已创建空白节点笔记。",
  sampleSelection: "选中文字",
  errorPathExists: "目标已存在：{path}", errorInvalidMove: "节点不能移动或合并到自身或后代节点。",
  errorMissingNote: "缺少节点笔记：{path}", errorMergeConflict: "合并冲突：{detail}",
  errorMigrationConflict: "迁移存在阻塞冲突。", errorSelectionChanged: "预览后选区已改变，创建已停止。",
  errorUnknownTarget: "找不到目标节点：{path}", errorGeneric: "操作安全停止：{message}",
};

const en: typeof zh = {
  settings: "Folder Nodes settings", general: "General", homepage: "Homepage", icons: "Icons & appearance", naming: "Selection & naming",
  initialize: "Initialize Folder Nodes", migration: "Scan and migrate Vault", maintenance: "Initialize & maintain", health: "Check structure health",
  maintenanceDesc: "Preview the exact paths that will be created, moved, skipped, or blocked. Nothing changes before confirmation.", reviewChanges: "Review changes",
  healthDesc: "Inspect the current structure without offering a write action.",
  createChild: "Create child node", createSelection: "Create Folder Node from selection",
  contents: "Open node contents", moveUp: "Move node up", moveDown: "Move node down",
  rename: "Rename node", delete: "Delete node", move: "Move node", merge: "Merge node",
  managed: "This Vault is managed by Folder Nodes.", unadopted: "This Vault is not adopted; existing structure is read-only.",
  language: "Interface language", languageDesc: "Choose Follow Obsidian to use Obsidian's interface language.", auto: "Follow Obsidian",
  chinese: "简体中文", english: "English", iconInheritance: "Icon inheritance",
  iconInheritanceDesc: "Use the nearest ancestor visual when the current node has no valid icon.",
  template: "Default Node Note template",
  templateDesc: "Vault-relative Markdown template path. Supports {{name}}, {{path}}, {{parent}}, and {{date}}.",
  enableHomepage: "Enable homepage", enableHomepageDesc: "Use the same-named Markdown of the Vault root node as the homepage.",
  openHomepage: "Open homepage", openHomepageDesc: "Open the root node's same-named Markdown. Node contents also shows a homepage button.",
  openHomepageOnStartup: "Open homepage on startup", openHomepageOnStartupDesc: "Open the homepage after Obsidian restores the Vault layout.",
  homepageDisabled: "Homepage is not enabled.", homepageMissing: "The root Node Note does not exist yet. Review and apply changes under Initialize & maintain first.",
  explorerIconPosition: "File Explorer icon position", explorerIconPositionDesc: "When a node has an explicit icon, show it before or after the name, or hide it.",
  beforeName: "Before name", afterName: "After name", hidden: "Hidden",
  showIconInNoteTitle: "Show icon in note title", showIconInNoteTitleDesc: "Show the same icon before a Folder Node's inline title.",
  initializeDesc: "Use only for an empty or already structured Vault.",
  migrationDesc: "Always shows a read-only preview. Nothing changes until you explicitly commit.",
  aliases: "Add aliases property", aliasesDesc: "The alias uses only selected text; prefixes and suffixes affect only the file name.",
  prefix: "Prefix", suffix: "Suffix", enabled: "Enabled", source: "Source", separator: "Separator",
  customText: "Custom text", currentFile: "Current file name", currentNode: "Current Folder Node",
  currentHeading: "Current heading", timestamp: "Timestamp", timestampFormat: "Timestamp format",
  timestampFormatDesc: "Supported: %Y %m %d %H %M %S", preview: "Preview", create: "Create",
  cancel: "Cancel", confirm: "Confirm", moveToTrash: "Move to trash", nodeContents: "Node contents",
  nodes: "Nodes", album: "Album", files: "Files", video: "Video", openParent: "Open parent node",
  noCurrentNode: "Open a note inside a Folder Node to view its contents.", showMore: "Show {count} more",
  editVisual: "Set node visual", visualValue: "Icon value",
  visualValueDesc: "Enter an emoji, Lucide name, color, or Vault image wikilink; leave empty to remove it.",
  selectionPreview: "Create Folder Node from selection", targetNode: "Target node", notePath: "Node note",
  aliasValue: "Alias", wikiLink: "WikiLink", reloadLanguage: "Command names will use the new language after the plugin reloads.",
  leafMarkdown: "Leaf Markdown", missingNotes: "Missing node notes", conflicts: "Blocking conflicts",
  leafExemptions: "Allowed leaf notes", leafExemptionsDesc: "These exact paths may remain leaf Markdown. Root AGENTS.md and CLAUDE.md are included by default.",
  folderExemptions: "Unmanaged folders", folderExemptionsDesc: "Folder Nodes does not initialize, migrate, or repair this folder or its descendants. Exemption does not hide content.",
  leafExemptionItemDesc: "Remains leaf Markdown", folderExemptionItemDesc: "The entire subtree is unmanaged",
  addExemption: "Add exemption", addLeafExemption: "Add leaf-note path", addFolderExemption: "Add folder path",
  noExemptions: "No paths.", add: "Add", remove: "Remove",
  skippedLeafNotes: "Skipped by leaf-note exemption", skippedFolders: "Skipped by folder exemption",
  createNodeNotes: "Node notes to create", moveLeafNotes: "Leaf Markdown to move", noChanges: "No structural changes need to be applied.",
  applyChanges: "Apply changes", startManaging: "Start managing", readOnlyHealth: "This is a read-only check. This window cannot modify the Vault.",
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
