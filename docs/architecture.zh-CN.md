---
source_language: zh-CN
translation_status: source
---

# Folder Nodes — 架构

## 身份与持久化

完整 Node 的当前身份是规范化 Vault folder path 与 `A/A.md` 结构，不存在稳定 ID。缺少文件夹或同名 Node Note 的一侧立即归类为不完整节点，但不会获得另一套隐藏身份，也不需要初始化或接管状态。Folder Nodes 主动使用 `aliases`、`icon` 和唯一的插件自有 `folder-nodes` Text List。它的规范 token 是 `order=manual`、正整数 `rank=N` 与 `hidden=true`；默认值不出现，空列表删除。`aliases` 与 `icon` 是共用内容惯例，`folder-nodes` 是插件结构契约。主页偏好、图标位置、命名规则、不管理的指定路径和名称开头规则保存在插件 `data.json`，不写入笔记 YAML。节点图谱 leaf 只把范围、焦点、维度和是否显示链接序列化到 Obsidian workspace state；每个范围的分支展开与活动搜索快照只保留在该 leaf 内存中，不写入 `data.json`、笔记 YAML，也不在重启后恢复。

## 分层

`folder-nodes` 列表是受保护的结构元数据，不会在合并时从来源节点复制。NodeService 的 `children()` 仍返回完整受管理结构；可见性投影采用 `unmanaged || !hiddenNodesEnabled || showHiddenNodesThisSession || !effectiveHidden(node)`，并向上查找最近的新属性或兼容旧字段隐藏来源。Explorer、Contents 与 Graph 共用该规则，图谱在模型与布局前剪枝隐藏子树。插件只把持久总开关写入 schema v2 `data.json`，会话显示开关只存在内存中。schema 2 删除已弃用的图谱规则数组，不改写笔记，并通知被丢弃的条目数。

属性解析同时读取 `folder-nodes` 与已公开的 `folderNodeChildrenSort`、`folderNodeSiblingRank`、`folderNodeHidden`。新旧双写等价时视为冗余；冲突和已知无效值失败关闭。源码 patcher 只拥有这些精确顶层 key，检测重复/引号 key/未闭合歧义，保留 BOM、换行符、无关 YAML/正文和有效的未知未来 token，并写入规范 token 顺序。属性迁移绝不是启动副作用：只读扫描为精确源码生成指纹；显式提交重新扫描，在适用时固定 TFile 身份与当前未保存编辑器，完成后验证，失败时按原文精确回滚。

Core 只处理路径、命名、不管理边界规则、批量整理计划、反向引用索引、稀疏排序、frontmatter 最小 patch、Visual declaration 解析，以及节点图谱的纯可见性/几何。命名 Core 只验证公开的 Obsidian/Moment 子集并接收注入的时间格式化函数；真正的 `moment(date).format(pattern)` 位于 Obsidian adapter 边界。Adapters 封装 Vault、Metadata Cache、File Explorer、资源 URI 与 Node 操作；VaultOperationCoordinator 独立负责结构写入串行化和内部事件归属。Presentation 放置 Explorer、设置页与 UI 共用的宿主 DOM 渲染器，避免反向跨越各自分层边界。UI/App 提供本地化、设置、命令、菜单、弹窗、Visual Picker、Contents View、节点图谱状态/渲染与批量刷新调度。节点图谱只采用有界的 `GraphIndex → ViewState → VisibleScene → renderer` 流程，不扩展成全插件数据抽象。公开仓库不依赖本地工作区或个人 Vault。

## 排序引擎

自然模式按 Unicode 规范化 basename 做 numeric-aware 排序且不写 token。第一次明确手动 placement 时，父 Node 在 `folder-nodes` 中写 `order=manual`，当前直接 Child Nodes 以 1024 间隔物化稀疏 `rank=N` token。有空隙时只 patch moved Node；无空隙时最多 rebalance 64 个邻居，再退化为当前父节点的完整 rank 物化，但从不把子节点数组写进父 Note。读取时按有效 rank、规范化 basename、path 依次比较，因此缺失或重复 rank 仍确定；rename 不改 Child Note 上的 rank，manual parent 下的新 Child 取末尾 rank。

## Node 操作

NodeService 把 create、rename、move、place、merge、repair 和 trash 作为串行结构事务；所有 rename/move 都经过 Obsidian FileManager 以保留链接。Move/placement 拒绝自身和 descendant，相对放置在同一事务内重新计算 parent/index。每项多步操作预检查磁盘与缓存中的目标路径，并维护逆序 rollback；rollback 无法安全完成时返回包含原始错误与恢复错误的聚合失败，而不伪报成功。Merge 预检查目标路径与 frontmatter 冲突；目标属性优先，非冲突来源属性合入目标，正文追加后移动资源并把来源送入系统回收站。允许仅移动或删除 Node Note，并保持所属文件夹不动。外部 rename 调和会双向同步已有 Node Note/文件夹配对，但绝不凭空创建缺失 Note。Root 不允许作为完整节点 rename/move/delete。新 Node Note 默认为空白；Folder Nodes 不执行内容模板。

结构元数据 patch 在恰好一个匹配 Markdown view 时使用当前未保存编辑器，否则通过 `Vault.process` 提交；两条路径都固定原始 TFile 与 path，在 commit 前重新核对，并拒绝同期替换或内容变化。Rollback closure 保留原始对象引用，并在 mutation 前验证仍是插件拥有的内容。设置持久化使用 schema v2，无版本或 schema 1 数据只迁移一次；显式 schema 无效或更高时只读打开，未知字段绝不回写。其本地串行队列捕获不可变快照，保留最近失败的快照供“重试保存”，并在卸载时追加一份最终兼容快照，保证旧写入不能最后完成。

## Visual 解析

Visual Core 只接受 scalar string 或 flat string list。它把每项分为基础候选、颜色修饰或未知项：基础候选是 Vault image wikilink、Obsidian registry 中的 Lucide，或恰好一个可见 extended grapheme cluster；`lucide:` 显式消歧，`color:` 表示前景强调色或回退色。解析保留顺序供诊断和解析，首个合法颜色生效。VisualService 逐个解析 Metadata Cache 与 Vault resource URI，图片无法解析时继续本地下一基础候选。解析到文字或 Lucide 时，颜色直接作用于前景；解析到 Emoji 或图片时保留原始像素，不增加圆点或容器装饰；所有基础候选都失败时，颜色才成为居中的圆形色标。只有本地声明完全耗尽后才查找最近祖先，并且不跨层组合基础候选与颜色。Picker 写入拒绝未知或多字素值。渲染器增加 kind/script class：文字使用 Obsidian 界面字体，Emoji 使用所选本机彩色字体或系统字体栈，来自属性的 Explorer/标题图标进入固定且无边框的图标位。Imperative 设置页只通过本地 `FontFace` source 探测固定候选，不枚举全部系统字体；RuntimeStyles 将通过校验的所选字体栈注入每个 workspace document 的自有样式表，字体缺失时继续回退系统栈。标题图标位仍位于可编辑文字之外，通过测量标题首行的 block/inline offset 并在 resize 后重新计算。高级 CSS 变量继续提供覆盖能力。

Picker 使用 `FileManager.processFrontMatter` 写回：零项删除属性，一项写 Text，多项写 List。遇到未知、多字素、非字符串或嵌套值时拒绝写入，不静默接受或丢失数据。

## Explorer 与 Contents

ExplorerAdapter 仅封装 File Explorer 宿主边界：它发现每个 `file-explorer` leaf，并只观察对应 leaf container，不观察 `document.body`。适配器隐藏 canonical note，并从真实 `TFolder.children` 减去 canonical note 和当前不可见的受管理子树，判断 Folder Node 是否为视觉叶子；视觉叶子只给现有 disclosure control 添加可清理的圆点 class 和受所有权保护的 `aria-hidden`，不写宿主展开状态。Mutation 批刷新会在可见内容变化时恢复箭头。桌面能力开关启用 HTML5 drag listener；Android 保留同一装饰但不声明 draggable。`stop`/unload 断开观察器和监听器，移除全部自有 DOM/class，并恢复属性与顺序。

Contents View 以活动文件的 owning folder 作为当前 Node，没有活动文件时使用 Root。一次 render 只查询 direct children/files，非空 Nodes/Album/Files 各自分页；三者全空时由统一空态替代三个 disclosure。breadcrumb 在 render 时排除 current item，深路径压缩中段；current card 既表达当前节点又负责打开 Node Note。Node Graph 扩展把入口注入现有 header action 容器，不再 prepend 独立顶行。`sectionOpen` 只属于 view instance，rerender/切换节点保留，onClose 后随实例释放。桌面端保留 drag helpers；Android 不创建 drag ownership。普通文件、相册条目与未管理文件夹仍通过独立 `file-menu` source 接收第三方动作。

## 节点图谱

GraphIndex 由节点图谱扩展拥有，复用 NodeService 的分类/排序、属性驱动的子树可见性、Metadata Cache、ReferenceIndex 与已解析 Visual。它只记录一次全部可见受管理节点、有方向的父子结构和已解析 canonical-note 链接邻接，再消费 path-targeted RefreshBatch 失效，不存在单独的纳入/排除规则层。NodeService 顺序贯穿 topology 与两种布局；增量刷新后只根据缓存父子关系恢复与完整构建一致的深度优先顺序，不重新遍历 Vault，因此同一图谱的局部刷新和全新重建会得到相同坐标。Active-leaf、范围、搜索、展开、2D/3D 切换和链接开关都不重建 Vault 目录。重命名原子重映射以 path 为键的 view state，删除清理失效状态。这条边界只服务节点图谱，不替换 Explorer 或 Contents 的数据路径。

ViewState 把序列化 workspace 字段与会话状态分开。每次手动设置 expansion 后先从 VisibleScene 得到可见 ID；若 focus 不在其中，就沿 topology parent 链提升到最近可见祖先，再渲染 DOM、Canvas 2D 或 Canvas 3D。搜索使用直接的临时 expansion/focus 快照路径，不经过这条手动调和，因此清空时仍精确恢复进入搜索前状态。每个范围的展开以内存中的一层基线与 expanded/collapsed 分支例外表达。

VisibleScene 是 DOM、Canvas 2D 与 Canvas 3D 消费的唯一过滤模型。搜索以单次线性遍历汇总结果，view 只计算当前维度的布局。共享几何统一拥有卡片尺寸、presentation、hit test、父级/子级把手、结构锚点、链接卡片边缘锚点与链接曲线。结构边保留明确的 parent-to-child 方向：从左到右布局连接父卡右把手到子卡左把手，从上到下布局连接父卡下把手到子卡上把手；链接边与把手及结构骨架独立。Canvas 保留所有可见结构边，只对链接边及聚焦关联链接应用限制。大 2D 保持可读的最小比例，通过空间索引查询视口候选，同时保留所需的父级边端点；大 3D 使用与命中几何一致的圆点，并仅对焦点或悬停显示完整卡片。渲染状态不成为覆盖图谱的浮层；close/unload 会释放全部订阅、observer、animation frame、canvas 与 DOM。

## 一致性与失败关闭

每个 Vault 事件入口先消费由 OperationCoordinator 记录的预期内部事件；外部 rename 事件再进入同一结构事务队列。原生 create/delete 事件只刷新分类，不自动转换笔记、补全另一侧或重建已删除 Node Note。外部 rename 只对明确配对的完整节点同步另一侧；不完整节点只重命名实际存在的一侧。每个 Workspace document（包括 popout document）只注册一个 capture-phase 未解析链接处理器，不观察 body；它解析 Obsidian 的新笔记父路径、遵守不管理边界，并把支持的 Markdown 目标交给 `createNodePath`，让显式路径缺失的祖先和目标 Node 共用同一个 undo stack。显式 WikiLink 显示文字只在共用 aliases 设置开启时写入。选区创建固定来源 TFile/path 与源码 range；纯源码分类器在单个表格单元格内转义 WikiLink 分隔符，并拒绝跨单元格/跨行。视觉刷新由 RefreshScheduler 合并为一次全量或 path-targeted batch，GraphIndex 消费同一批次，不再启动独立扫描。路径碰撞、循环、selection 变化、folder rename 双 canonical 候选、属性冲突及 merge frontmatter 冲突停止操作。可选批量整理与显式属性迁移以分批异步方式扫描并支持取消；确认写入前重新核对预览，提交后再次验证完整结果，失败则 rollback。所有写入弹窗在提交进行中拒绝取消/关闭，插件卸载会中止已确认工作并阻止之后的正向 mutation。Health 合并两类扫描与 icon 形状诊断，但不持有 commit 动作。正式 Vault 部署、源码测试、打包候选和主机验收是独立证据。
