---
source_language: zh-CN
translation_status: source
---

# Folder Nodes 产品需求

## 产品模型

受管 Vault 中每个受管文件夹都是 Folder Node，并且有且仅有一个同名 Node Note：`A/A.md`。Root 也是 Node，其 Node Note 位于 Vault 根目录。每个未豁免 Markdown 文档必须属于自己的同名文件夹；普通非 Markdown 文件可以直接属于 Node。Folder Nodes 不生成永久 ID，不写 `_pkwf`、path、parent、name、node type 或完整子节点列表。

## 排序属性

自然名称排序不写任何排序属性。手动排序由父 Node Note 的 `folderNodeChildrenSort: manual` 和各直接 Child Node Note 自己的稀疏正整数 `folderNodeSiblingRank` 表示。通常一次排序只写移动节点；局部 rebalance 最多 64 个节点。

## 节点操作

用户可以创建、重命名、移动、合并、安全删除和排序完整 Node。Explorer 拖拽统一表示 before、into、after：同父节点是 reorder，跨父节点是 reparent 加 reorder。冲突、循环移动和有歧义的 merge 必须失败关闭。默认模板支持 `{{name}}`、`{{path}}`、`{{parent}}` 和 `{{date}}`。

## 选区创建

编辑器命令和右键菜单都可从选中文字创建 Child Node。创建前预览最终 `A/A.md`、alias 和 WikiLink。aliases 只使用选中的可见文字；前缀、后缀、各自连接符和时间戳只影响 basename。来源包括当前文件、当前 Node、最近当前标题、时间戳和自定义文本。

## 主页与结构豁免

用户可选择将 Root Node Note 作为主页，通过命令或 Contents View 按钮打开，并可在 Vault 布局恢复后自动打开。叶子笔记豁免使用精确 Vault 相对 Markdown 路径；文件夹豁免作用于完整子树并停止初始化、迁移和结构修复。豁免不表示隐藏。根目录 `AGENTS.md` 和 `CLAUDE.md` 默认属于叶子笔记豁免。

## Node Visual 与 Contents View

`icon` 是唯一 Node Visual 属性，可为 Text 或 List，按顺序选择第一个有效 Emoji、Lucide、Vault 图片或 CSS 颜色；可继承最近祖先。File Explorer 图标可位于名称前、名称后或隐藏，也可在 Node Note 标题中显示；尺寸与对齐跟随 Obsidian。File Explorer 是唯一全局 Node Tree。侧栏只浏览当前 Node 的 direct contents，分为 Nodes、静态 Album 与紧凑 Files。无有效 visual 的子节点不绘制大 fallback 图标；GIF 只提取静态帧，视频只显示类型 tile，音频留在 Files。插件不提供动图、视频或音频播放。

## 接管与安全

初始化与迁移共用一次只读扫描，逐路径显示将创建、移动、跳过和阻止的内容，再由用户显式应用。Health 复用同一摘要但严格只读，不显示写入按钮。冲突阻止提交。Managed 状态通过稳定、合并的 Vault 事件维持结构并尊重两类豁免；无损且唯一的问题可以修复。完整节点删除使用系统回收站。插件不联网。

## v1 边界

v1 不包含远程图片抓取、inline SVG 重着色、PDF 首页缩略图、HEIC/HEIF 预览、视频抽帧、动图/视频/音频播放、Contents View 普通文件拖拽或独立排序、第二棵完整目录树、替代 Node Note 命名、复杂 merge 冲突 UI 或任意属性继承。
