---
source_language: zh-CN
translation_status: source
---

# Folder Nodes — 产品需求

## 产品模型

完整 Folder Node 由文件夹和恰好一个同名 Node Note `A/A.md` 构成，其结构身份仍是当前规范化配对。受管理的文件夹或 Markdown 缺少对应侧时是不完整节点；用户可补全或设为不管理。Root 可在 Vault 根目录拥有可选 Node Note。Folder Nodes 不生成永久 ID，不写 `_pkwf`、path、parent、name、node type 或完整子节点列表。

## Folder Nodes 属性与排序

Folder Nodes 只拥有一个名为 `folder-nodes` 的扁平 Text List。它只包含非默认 `key=value` token：父 Node Note 上的 `order=manual`、每个直接 Child Node Note 上形如 `rank=1024` 的稀疏正整数，以及隐藏子树根上的 `hidden=true`。token 的规范顺序是 order、rank、hidden，并保留语法有效的未知未来 token。自然名称排序、缺少 rank 和可见状态都不写入；空列表会被删除。自然排序使用规范化名称。通常一次手动排序只写移动的 Child；局部 rebalance 最多 64 个节点。缺失或重复 rank 使用规范化 basename 与 path 作确定性 tie-break；重命名保留已有 rank，手动模式中新建的 Child 默认追加到末尾。

已经公开的 `folderNodeChildrenSort`、`folderNodeSiblingRank`、`folderNodeHidden` 继续兼容读取。“管理”中的显式动作只读扫描所有 Markdown，报告新属性、旧字段、冗余双写、冲突、非规范 Node Note 及无效 icon 声明，再预览精确迁移目标；启动时绝不迁移。提交会重新扫描并核对每个目标指纹，保留无关 frontmatter、正文、BOM、换行符和未知未来 token，完成后验证，失败时按原文精确回滚。新旧值等价时可以规范化；冲突、无效、重复、畸形或预览后已改变的输入全部失败关闭。提交迁移前，用户必须先更新所有设备。

## 节点操作

用户可以创建、重命名、移动、合并、安全删除和排序完整 Node。桌面端 Explorer 与 Contents 子节点卡片的拖拽统一表示 before、into、after：同父节点是 reorder，跨父节点是 reparent 加 reorder；Android 不启用 HTML5 拖放，使用 Obsidian 原生移动文件夹和插件的 Move/Move up/Move down 动作。原生跨父级移动完成后，插件会为手动排序的目标父级重新分配该子节点的稀疏 rank，不能把来源父级的旧 rank 直接带入。所有结构写入必须串行，rename/move 必须使用 Obsidian FileManager；多步写入必须预检查并在失败时 rollback。冲突、循环移动和有歧义的 merge 必须失败关闭。Obsidian 原生“新建文件夹”和“新建笔记”与“新建节点”保持可见：前两者创建不完整的文件夹侧或 Markdown 侧，“新建节点”原子创建完整配对。文件列表中的文件夹移动/删除作用于整个子树；Node Note 标签页的移动/删除/合并只作用于 Markdown，可以留下不完整文件夹。重命名是同步例外：重命名已有 Node Note 或其文件夹都会更新另一侧。标签页另有明确标为“所在节点”的整节点动作。Root 不允许作为完整节点被重命名、移动或删除。Folder Nodes 创建空白 Node Note；内容模板交给专用模板插件。

## 选区创建

编辑器命令和右键菜单都可从选中文字创建 Child Node。创建前预览最终 `A/A.md`、alias 和 WikiLink。确认后，选中文字写入新 Node Note 正文，来源笔记中的原选区替换为刚才预览的 WikiLink；若预览后选区或来源文件变化则停止。源码模式和 Live Preview 都支持单个 Markdown 表格单元格，生成 WikiLink 时使用转义的 `\|` alias 分隔符；选区跨过未转义的单元格边界或表格行时，在创建任何内容前失败关闭。在这条流程中，aliases 只使用选中的可见文字；前缀、后缀、各自连接符和时间戳只影响 basename。来源包括当前文件、当前 Node、最近当前标题、时间戳和自定义文本。

在受管理范围内，点击未解析的内部 Markdown 链接时直接创建完整 Node，不先创建叶子笔记。`[[a]]` 创建空白的 `a/a.md`；显式 Vault 路径会在同一事务中创建所有缺失的完整祖先 Node。共用 aliases 设置开启时，`[[a|b]]` 把显式显示文字 `b` 写入新 Node Note 的 `aliases`；没有显示文字或设置关闭时不写 alias。不管理文件夹、不管理叶子笔记路径、不安全或非 Markdown 目标，以及 Markdown view 之外的链接仍由 Obsidian 原生处理。外部或第三方创建不再自动转换；用户可明确选择“转换为 Folder Node”。冲突必须失败关闭。

## 主页与不管理规则

完整、受管理且非 Root 的节点可以在自己的 `folder-nodes` 列表中写入 `hidden=true`。该标记对后代有效但不复制到后代 YAML；删除 token 即取消显式隐藏。隐藏只投影到 Folder Nodes 管理的文件列表文件夹行、Node Contents 与 Folder Nodes 节点图谱，不改变 Obsidian 搜索、快速切换、反向链接、原生图谱、WikiLink 或直接打开。插件设置 `hiddenNodesEnabled` 默认为开启；关闭时所有隐藏节点正常显示但 YAML 保持不变。置顶 Root 行尾部的眼睛按钮与命令面板开关会同时切换所有窗口和三个投影面的会话级显示，重载后复位。不管理优先于隐藏：不管理内容始终显示且不展示隐藏眼睛，重新纳入管理前若仍受隐藏标记影响则必须警告。

Root Node Note 位于 Vault 根目录，basename 是清理非法文件名字符后的 Vault 名。用户可选择将它作为主页，通过命令或 Contents View 按钮打开，并可在 Vault 布局恢复后自动打开。Contents 的当前节点取活动文件所属文件夹；没有活动文件时回退到 Root。File Explorer 始终显示置顶、不可折叠且区别于普通节点的 Root 行。“常规”负责语言、隐藏标记行为和主页；“管理”包含“不管理的 Markdown 文件”和“不管理的文件夹”两个规则组、预览优先的批量整理与属性迁移，以及只读 Health。两组规则都接受 Vault 相对指定路径与名称开头规则，`.`、`_` 是默认规则。不管理规则停止节点识别、批量整理和结构修复但不隐藏内容。当前 Vault 配置目录、`.git` 和 `.trash` 始终受保护；根目录 `AGENTS.md` 和 `CLAUDE.md` 默认是不管理的 Markdown 路径。

## Node Visual 与 Contents View

`icon` 是唯一 Node Visual 属性，使用 Obsidian Properties 可表达的 Text 或扁平 Text List，不接受嵌套对象。列表中的基础候选可以是 Vault 图片 WikiLink、已知 Lucide、一个可见扩展字素（文字、符号或 Emoji）；按顺序使用第一个实际可显示的基础候选，缺失图片会继续尝试本节点后续项。第一个有效 `color:` 项直接为 Lucide/文字前景着色。Emoji/位图/SVG 保留原像素，不增加圆点、背景或边框；只有所有基础候选都失败时，颜色才成为居中的实心圆形色标。未知项或多字素项会被诊断，不能通过 Picker 保存；多个颜色以第一个为准。只有当前节点的整组声明都无法显示时才继承最近祖先，不把当前颜色与祖先图标组合。属性图标统一放入固定且无边框的图标位，并以文字的字重、大小和颜色与文件名开头的相同字符区分。File Explorer 图标可位于名称前、名称后或隐藏，也可作为 Node Note 可编辑标题之外的独立图标显示。文字图标继承 Obsidian 界面字体；Emoji 默认使用系统彩色字体栈，“图标与外观”只显示从 Segoe UI Emoji、Apple Color Emoji、Noto Color Emoji、Twemoji Mozilla、OpenMoji 固定集合中检测到的字体，提供复杂序列预览，并在已保存字体不可用时安全回退。高级用户仍可覆盖字体 CSS 变量。File Explorer 是唯一全局 Node Tree，并以置顶 Root 行开始。侧栏只浏览当前 Node 的 direct contents，分为 Nodes、静态 Album 与紧凑 Files，三段分别分页。三类条目都提供右键、More actions 与 Shift+F10 菜单入口。桌面端 Node 可用 before/into/after 拖放排序或换父级，单个 Album/Files 条目可拖入 Node、当前节点或 breadcrumb；Android 仅通过菜单/原生移动执行相同写操作，不暴露 draggable。内容多选用于插入或复制 WikiLink。无有效 visual 的子节点不绘制大 fallback 图标；GIF 只提取静态帧，视频只显示类型 tile，音频留在 Files。插件不在侧栏中提供动图、视频或音频播放。

## 节点图谱

节点图谱是插件自有 workspace view，不修改 Obsidian 原生 Graph View。结构始终是有方向的父子骨架；“显示链接”是独立叠加，新建视图默认关闭。旧 workspace 的 Structure 状态迁移为关闭，Links/Hybrid 迁移为开启。已解析 canonical-note 链接使用独立视觉，不改变结构布局；只有链接叠加开启时，局部范围才加入直接链接邻居。稳定的从左到右或从上到下 2D 与按深度分层的 3D 共用同一份过滤场景。

节点图谱不再有持久的纳入子树、排除单个节点或排除子树规则。运行时的全局/子树/局部范围只控制当前视图；同一个 Node Note `hidden=true` token 会在图谱模型与布局之前剪枝完整子树。设置只保留启用、默认维度、2D 方向和大图限制。schema 1 中旧规则数组随显式设置 schema 迁移被丢弃并显示通知，绝不因此改写笔记。

可见性在布局前按渐进展开计算。全局默认 Root 与一级；子树默认选中节点与直接子级；局部额外加入一个父级作为上下文，默认选中节点与直接子级，并且只允许在当前选中节点的完整子树内继续向下展开。用户可以同时保留多个已展开分支，通过节点把手切换直接子级，使用 Alt 展开整支，也可从当前范围锚点展开 1/2/3 层或全部后代并收回一级。全部展开不再二次确认。范围、焦点、维度和“显示链接”写入 workspace state；每个范围的分支展开与活动搜索快照只在会话内存在，重启后重置。

每个节点都有规范化 visual/父级把手、负责选择并打开 canonical Node Note 的主体，以及叶子隐藏、其他节点显示子级数量和状态的子级把手。自身 visual、继承 visual、Folder 回退与 Root Home 回退共用同一固定图标位。搜索使用 Obsidian 原生 SearchComponent；内部或外部聚焦时展开隐藏祖先并居中，清除后恢复搜索前的展开、焦点与镜头快照。所有控件都有 Tooltip、键盘入口、明确 accessible name 和至少 44px 的粗指针命中区。

完整图谱目录只构建一次，再根据 Node、Metadata Cache、反向引用与 refresh batch 增量刷新。范围、展开、搜索、维度和链接显示只过滤该目录，不重复扫描 Vault。大图使用常量 DOM 的 Canvas 场景，保留所有可见结构边，只限制可选链接叠加；2D 保持可读最小缩放，3D 把远处节点显示为圆点并只在聚焦或悬停时显示完整卡片。密集状态只出现在工具栏或状态区，不覆盖图谱。

## 结构安全

Folder Nodes 不使用初始化或接管状态；启用后立即识别完整、不完整、不管理和冲突结构，并只对明确配对的完整节点执行自动重命名同步。原生创建不自动补全或移动内容。文件夹侧与 Markdown 侧缺失时都显示中性的“不完整节点”，提供显式补全和“设为不管理”；真正的配对冲突才使用警告。可选批量整理使用可取消的分批只读扫描，逐路径显示将创建、移动、跳过和阻止的内容；提交前重新核对预览，提交后验证结构，任一步失败都 rollback。属性迁移是另一项显式预览与确认操作。Health 合并结构、Folder Nodes 属性和 icon 声明问题，严格只读且不显示写入按钮。完整节点删除使用系统回收站。插件不联网。

## v1 边界

v1 不包含远程图片抓取、inline SVG 重着色、从节点名自动生成首字母、嵌套 `icon` 对象、PDF 首页缩略图、HEIC/HEIF 预览、视频抽帧、侧栏内动图/视频/音频播放、Contents View 普通文件独立排序、事务式多文件移动或跨视图内部 drop、第二棵完整目录树、替代 Node Note 命名、复杂 merge 冲突 UI 或任意属性继承。
