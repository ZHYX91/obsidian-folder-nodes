---
source_language: zh-CN
translation_status: source
---

# Folder Nodes 产品需求

## 产品模型

完整 Folder Node 由文件夹和恰好一个同名 Node Note `A/A.md` 构成，其结构身份仍是当前规范化配对。受管 Vault 也允许仅有文件夹的节点壳和普通 Markdown；Root 可在 Vault 根目录拥有可选 Node Note。Folder Nodes 不生成永久 ID，不写 `_pkwf`、path、parent、name、node type 或完整子节点列表。

## 排序属性

自然名称排序不写任何排序属性。手动排序由父 Node Note 的 `folderNodeChildrenSort: manual` 和各直接 Child Node Note 自己的稀疏正整数 `folderNodeSiblingRank` 表示。通常一次排序只写移动节点；局部 rebalance 最多 64 个节点。缺失或重复 rank 使用规范化 basename 与 path 作确定性 tie-break；重命名保留已有 rank，手动模式中新建的 Child 默认追加到末尾。

## 节点操作

用户可以创建、重命名、移动、合并、安全删除和排序完整 Node。Explorer 与 Contents 子节点卡片的拖拽统一表示 before、into、after：同父节点是 reorder，跨父节点是 reparent 加 reorder。所有结构写入必须串行，rename/move 必须使用 Obsidian FileManager；多步写入必须预检查并在失败时 rollback。冲突、循环移动和有歧义的 merge 必须失败关闭。Obsidian 原生“新建文件夹”和“新建笔记”保持可见：前者创建仅有文件夹的节点壳，后者创建普通 Markdown。文件列表中的文件夹移动/删除作用于整个子树；Node Note 标签页的移动/删除/合并只作用于 Markdown，可以留下仅有文件夹的节点。重命名是同步例外：重命名已有 Node Note 或其文件夹都会更新另一侧。标签页另有明确标为“所在节点”的整节点动作。Root 不允许作为完整节点被重命名、移动或删除。Folder Nodes 创建空白 Node Note；内容模板交给专用模板插件。

## 选区创建

编辑器命令和右键菜单都可从选中文字创建 Child Node。创建前预览最终 `A/A.md`、alias 和 WikiLink。确认后，选中文字写入新 Node Note 正文，来源笔记中的原选区替换为刚才预览的 WikiLink；若预览后选区或来源文件变化则停止。源码模式和 Live Preview 都支持单个 Markdown 表格单元格，生成 WikiLink 时使用转义的 `\|` alias 分隔符；选区跨过未转义的单元格边界或表格行时，在创建任何内容前失败关闭。在这条流程中，aliases 只使用选中的可见文字；前缀、后缀、各自连接符和时间戳只影响 basename。来源包括当前文件、当前 Node、最近当前标题、时间戳和自定义文本。

在 Managed 范围内，点击未解析的内部 Markdown 链接时直接创建完整 Node，不先创建叶子笔记。`[[a]]` 创建空白的 `a/a.md`；显式 Vault 路径会在同一事务中创建所有缺失的完整祖先 Node。共用 aliases 设置开启时，`[[a|b]]` 把显式显示文字 `b` 写入新 Node Note 的 `aliases`；没有显示文字或设置关闭时不写 alias。忽略文件夹、豁免叶子笔记路径、不安全或非 Markdown 目标，以及 Markdown view 之外的链接仍由 Obsidian 原生处理。外部或第三方创建不再自动转换；用户可明确选择“转换为 Folder Node”。冲突必须失败关闭。

## 主页与不管理规则

Root Node Note 位于 Vault 根目录，basename 是清理非法文件名字符后的 Vault 名。用户可选择将它作为主页，通过命令或 Contents View 按钮打开，并可在 Vault 布局恢复后自动打开。Contents 的当前节点取活动文件所属文件夹；没有活动文件时回退到 Root。File Explorer 始终显示置顶、不可折叠且区别于普通节点的 Root 行。常规页只包含“不管理的 Markdown 文件”和“不管理的文件夹”两个规则组，两组都接受 Vault 相对指定路径与名称前缀，`.`、`_` 是默认前缀。不管理规则停止初始化、迁移和结构修复但不隐藏内容。当前 Vault 配置目录、`.git` 和 `.trash` 始终受保护；根目录 `AGENTS.md` 和 `CLAUDE.md` 默认是不管理的 Markdown 路径。

## Node Visual 与 Contents View

`icon` 是唯一 Node Visual 属性，使用 Obsidian Properties 可表达的 Text 或扁平 Text List，不接受嵌套对象。列表中的基础候选可以是 Vault 图片 WikiLink、已知 Lucide、一个可见扩展字素（文字、符号或 Emoji）；按顺序使用第一个实际可显示的基础候选，缺失图片会继续尝试本节点后续项。第一个有效 `color:` 项直接为 Lucide/文字前景着色。Emoji/位图/SVG 保留原像素，不增加圆点、背景或边框；只有所有基础候选都失败时，颜色才成为居中的实心圆形色标。未知项或多字素项会被诊断，不能通过 Picker 保存；多个颜色以第一个为准。只有当前节点的整组声明都无法显示时才继承最近祖先，不把当前颜色与祖先图标组合。属性图标统一放入固定且无边框的图标位，并以文字的字重、大小和颜色与文件名开头的相同字符区分。File Explorer 图标可位于名称前、名称后或隐藏，也可作为 Node Note 可编辑标题之外的独立图标显示。文字图标继承 Obsidian 界面字体，Emoji 使用系统彩色 Emoji 字体；高级用户可覆盖字体 CSS 变量，普通设置不增加字体选择器。File Explorer 是唯一全局 Node Tree，并以置顶 Root 行开始。侧栏只浏览当前 Node 的 direct contents，分为 Nodes、静态 Album 与紧凑 Files，三段分别分页。三类条目都提供右键、More actions 与 Shift+F10 菜单入口。Node 可按 before/into/after 排序或换父级；Album/Files 中的单个普通文件只能拖入 Node、当前节点或 breadcrumb 目录并执行真实文件移动，不产生文件排序属性。内容多选用于插入或复制 WikiLink；拖动多个已选条目只导出链接，不执行部分文件移动。无有效 visual 的子节点不绘制大 fallback 图标；GIF 只提取静态帧，视频只显示类型 tile，音频留在 Files。插件不在侧栏中提供动图、视频或音频播放。

## 接管与安全

未初始化状态必须明确说明自动重命名同步不可用。初始化与迁移共用一次只读扫描，逐路径显示将创建、移动、跳过和阻止的内容，再由用户确认初始化；提交前必须重新核对预览，提交后必须验证结构，任一步失败都 rollback。首次持久化 `migrating` 状态失败时必须恢复此前的内存状态，并阻止一切结构写入；插件卸载会中止已确认迁移、rollback 已完成步骤并阻止后续正向写入。Managed 状态的启动验证严格只读，不自动接管原生新建的文件夹或 Markdown。Contents 以中性状态显示仅有文件夹的节点，并提供“创建节点笔记”；真正的配对冲突才使用警告。Health 严格只读，不显示写入按钮。完整节点删除使用系统回收站。插件不联网。

## v1 边界

v1 不包含远程图片抓取、inline SVG 重着色、从节点名自动生成首字母、嵌套 `icon` 对象、PDF 首页缩略图、HEIC/HEIF 预览、视频抽帧、侧栏内动图/视频/音频播放、Contents View 普通文件独立排序、事务式多文件移动或跨视图内部 drop、第二棵完整目录树、替代 Node Note 命名、复杂 merge 冲突 UI 或任意属性继承。
