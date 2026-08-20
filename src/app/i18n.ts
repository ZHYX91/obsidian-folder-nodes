import { moment } from "obsidian";

const zh = {
  settings: "Folder Nodes 设置",
  general: "常规",
  naming: "选区与命名",
  initialize: "初始化 Folder Nodes",
  migration: "扫描并迁移 Vault",
  health: "扫描节点健康状态",
  createChild: "创建子节点",
  createSelection: "从选中文字创建 Folder Node",
  contents: "打开节点内容视图",
  moveUp: "节点上移",
  moveDown: "节点下移",
  rename: "重命名节点",
  delete: "删除节点",
  managed: "当前 Vault 已由 Folder Nodes 管理。",
  unadopted: "当前 Vault 尚未接管；不会自动修改已有结构。",
};

const en: typeof zh = {
  settings: "Folder Nodes settings",
  general: "General",
  naming: "Selection & naming",
  initialize: "Initialize Folder Nodes",
  migration: "Scan and migrate Vault",
  health: "Scan node tree health",
  createChild: "Create child node",
  createSelection: "Create Folder Node from selection",
  contents: "Open node contents",
  moveUp: "Move node up",
  moveDown: "Move node down",
  rename: "Rename node",
  delete: "Delete node",
  managed: "This Vault is managed by Folder Nodes.",
  unadopted: "This Vault is not adopted; existing structure is read-only.",
};

export type TranslationKey = keyof typeof zh;
export function t(key: TranslationKey): string {
  return moment.locale().toLocaleLowerCase().startsWith("zh") ? zh[key] : en[key];
}
