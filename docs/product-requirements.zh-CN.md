---
source_language: zh-CN
translation_status: source
---

# Folder Nodes 产品需求

## 产品模型

受管 Vault 中每个受管文件夹都是 Folder Node，并且有且仅有一个同名 Node Note：`A/A.md`。Root 也是 Node，其 Node Note 位于 Vault 根目录。每个受管理的 Markdown 文档必须属于自己的同名文件夹；普通非 Markdown 文件可以直接属于 Node。Folder Nodes 不生成永久 ID，不写 `_pkwf`、path、parent、name、node type 或完整子节点列表。

## 排序属性

自然名称排序不写任何排序属性。手动排序由父 Node Note 的 `folderNodeChildrenSort: manual` 和各直接 Child Node Note 自己的稀疏正整数 `folderNodeSiblingRank` 表示。通常一次排序只写移动节点；局部 rebalance 最多 64 个节点。缺失或重复 rank 使用规范化 basename 与 path 作确定性 tie-break；重命名保留已有 rank，手动模式中新建的 Child 默认追加到末尾。

## 节点操作

用户可以创建、重命名、移动、合并、安全删除和排序完整 Node。Explorer 与 Contents 子节点卡片的拖拽统一表示 before、into、after：同父节点是 reorder，跨父节点是 reparent 加 reorder。所有结构写入必须串行，rename/move 必须使用 Obsidian FileManager；多步写入必须预检查并在失败时 rollback。冲突、循环移动和有歧义的 merge 必须失败关闭。删除 canonical Node Note 本身绝不解释为删除整棵子树：插件自有文件删除动作拒绝该操作，Managed 调和会安全重建唯一且无冲突的缺失 Node Note。Root 不允许重命名、移动或删除；完整 Node 删除必须使用明确的节点删除动作。Folder Nodes 创建空白 Node Note；内容模板交给专用模板插件。

## 选区创建

编辑器命令和右键菜单都可从选中文字创建 Child Node。创建前预览最终 `A/A.md`、alias 和 WikiLink。确认后，选中文字写入新 Node Note 正文，来源笔记中的原选区替换为刚才预览的 WikiLink；若预览后选区变化则停止。在这条流程中，aliases 只使用选中的可见文字；前缀、后缀、各自连接符和时间戳只影响 basename。来源包括当前文件、当前 Node、最近当前标题、时间戳和自定义文本。

在 Managed 范围内，点击未解析的内部 Markdown 链接时直接创建完整 Node，不先创建叶子笔记。`[[a]]` 创建空白的 `a/a.md`；显式 Vault 路径会在同一事务中创建所有缺失的完整祖先 Node。共用 aliases 设置开启时，`[[a|b]]` 把显式显示文字 `b` 写入新 Node Note 的 `aliases`；没有显示文字或设置关闭时不写 alias。忽略文件夹、豁免叶子笔记路径、不安全或非 Markdown 目标，以及 Markdown view 之外的链接仍由 Obsidian 原生处理。创建后调和继续作为外部和第三方创建的兜底；冲突必须失败关闭。

## 主页与不管理规则

Root Node Note 位于 Vault 根目录，basename 是清理非法文件名字符后的 Vault 名。用户可选择将它作为主页，通过命令或 Contents View 按钮打开，并可在 Vault 布局恢复后自动打开。Contents 的当前节点取活动文件所属文件夹；没有活动文件时回退到 Root。File Explorer 始终显示置顶、不可折叠且区别于普通节点的 Root 行。常规页只包含“不管理的 Markdown 文件”和“不管理的文件夹”两个规则组，两组都接受 Vault 相对指定路径与名称前缀，`.`、`_` 是首发默认前缀。不管理规则停止初始化、迁移和结构修复但不隐藏内容。当前 Vault 配置目录、`.git` 和 `.trash` 始终受保护；根目录 `AGENTS.md` 和 `CLAUDE.md` 默认是不管理的 Markdown 路径。

## Node Visual 与 Contents View

`icon` 是唯一 Node Visual 属性，使用 Obsidian Properties 可表达的 Text 或扁平 Text List，不接受嵌套对象。列表中的基础候选可以是 Vault 图片 WikiLink、已知 Lucide、一个可见扩展字素（文字、符号或 Emoji）；按顺序使用第一个实际可显示的基础候选，缺失图片会继续尝试本节点后续项。第一个有效 `color:` 项是修饰符：Lucide/文字直接着色，Emoji/位图/SVG 保留原像素并把颜色用于外围背景与边框；只有颜色时显示色块。未知项和额外颜色保留，多个颜色以第一个为准。只有当前节点的整组声明都无法显示时才继承最近祖先，不把当前颜色与祖先图标组合。File Explorer 图标可位于名称前、名称后或隐藏，也可作为 Node Note 可编辑标题之外的独立图标显示；尺寸与对齐跟随 Obsidian。File Explorer 是唯一全局 Node Tree，并以置顶 Root 行开始。侧栏只浏览当前 Node 的 direct contents，分为 Nodes、静态 Album 与紧凑 Files，三段分别分页。三类条目都提供右键、More actions 与 Shift+F10 菜单入口。Node 可按 before/into/after 排序或换父级；Album/Files 中的单个普通文件只能拖入 Node、当前节点或 breadcrumb 目录并执行真实文件移动，不产生文件排序属性。内容多选用于插入或复制 WikiLink；拖动多个已选条目只导出链接，不执行部分文件移动。无有效 visual 的子节点不绘制大 fallback 图标；GIF 只提取静态帧，视频只显示类型 tile，音频留在 Files。插件不在侧栏中提供动图、视频或音频播放。

## 接管与安全

未初始化状态必须明确说明自动同步不可用。初始化与迁移共用一次只读扫描，逐路径显示将创建、移动、跳过和阻止的内容，再由用户确认初始化；提交前必须重新核对预览，提交后必须验证结构，任一步失败都 rollback。首次持久化 `migrating` 状态失败时必须恢复此前的内存状态，并阻止一切结构写入；插件卸载会中止正在进行的启动修复或已确认迁移，rollback 已完成步骤并阻止后续正向写入。Contents 将缺少 Node Note 的文件夹和缺少同名文件夹的受管理 Markdown 显示为带警告的节点，并提供显式修复或不管理规则动作。Health 复用同一摘要但严格只读，不显示写入按钮。冲突阻止提交。Managed 状态在启动时修复整个受管范围，并通过串行 Vault 事件维持结构、递归接管从忽略范围移入的子树、尊重两类不管理规则；无损且唯一的问题可以修复。完整节点删除使用系统回收站。插件不联网。

## v1 边界

v1 不包含远程图片抓取、inline SVG 重着色、badge 叠加、从节点名自动生成首字母、嵌套 `icon` 对象、PDF 首页缩略图、HEIC/HEIF 预览、视频抽帧、侧栏内动图/视频/音频播放、Contents View 普通文件独立排序、事务式多文件移动或跨视图内部 drop、第二棵完整目录树、替代 Node Note 命名、复杂 merge 冲突 UI 或任意属性继承。
