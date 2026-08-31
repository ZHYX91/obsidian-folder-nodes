---
source_language: zh-CN
translation_status: source
---

# Folder Nodes — 架构

## 身份与持久化

完整 Node 的当前身份是规范化 Vault folder path 与 `A/A.md` 结构，不存在稳定 ID。缺少文件夹或同名 Node Note 的一侧立即归类为不完整节点，但不会获得另一套隐藏身份，也不需要初始化或接管状态。Folder Nodes 主动使用 `aliases`、`icon`、`folderNodeChildrenSort` 和 `folderNodeSiblingRank`。`aliases` 与 `icon` 是可移植内容属性；两个 `folderNode` 字段是插件结构属性。主页偏好、图标位置、命名规则、不管理的指定路径和名称开头规则保存在插件 `data.json`，不写入笔记 YAML。节点图谱 leaf 只把范围、焦点、维度和是否显示链接序列化到 Obsidian workspace state；每个范围的分支展开与活动搜索快照只保留在该 leaf 内存中，不写入 `data.json`、笔记 YAML，也不在重启后恢复。

## 分层

`folderNodeHidden` 是 Node Note 中受保护的 Folder Nodes 布尔属性，与 `folderNodeChildrenSort`、`folderNodeSiblingRank` 一样不会在合并时从来源节点复制。NodeService 的 `children()` 仍返回完整受管理结构；可见性投影采用 `unmanaged || !hiddenNodesEnabled || showHiddenNodesThisSession || !effectiveHidden(node)`，并向上查找最近的严格 `true` 来源。Explorer、Contents 与 Graph 共用该规则，图谱在模型与布局前剪枝隐藏子树。插件只把持久总开关写入 schema v1 `data.json`，会话显示开关只存在内存中；设置 schema 不因新增带默认值的字段而升级。

Core 只处理路径、命名、不管理边界规则、批量整理计划、反向引用索引、稀疏排序、frontmatter 最小 patch、Visual declaration 解析，以及节点图谱的纯可见性/几何。Adapters 封装 Vault、Metadata Cache、File Explorer、资源 URI 与 Node 操作；VaultOperationCoordinator 独立负责结构写入串行化和内部事件归属。Presentation 放置 Explorer、设置页与 UI 共用的宿主 DOM 渲染器，避免反向跨越各自分层边界。UI/App 提供本地化、设置、命令、菜单、弹窗、Visual Picker、Contents View、节点图谱状态/渲染与批量刷新调度。节点图谱只采用有界的 `GraphIndex → ViewState → VisibleScene → renderer` 流程，不扩展成全插件数据抽象。UI/App 还为每个 Workspace document 唯一管理一份带内容指纹且包含节点图谱规则的 constructable stylesheet；发布包中的 `styles.css` 刻意保持无效，因此 Obsidian 原生样式缓存或第二份图谱 stylesheet 都不会成为另一个运行时权威。一次性 layout gate 会先向宿主注册，再检查 `layoutReady`，不用轮询或延时重试即可封闭状态转换竞争窗口。公开仓库不依赖本地工作区或个人 Vault。

## 排序引擎

自然模式按 Unicode 规范化 basename 做 numeric-aware 排序且不写属性。第一次明确手动 placement 时，父 Node 写 `folderNodeChildrenSort: manual`，当前直接 Child Nodes 以 1024 间隔物化 `folderNodeSiblingRank`。有空隙时只 patch moved Node；无空隙时最多 rebalance 64 个邻居，再退化为当前父节点的完整 rank 物化，但从不把子节点数组写进父 Note。读取时按有效 rank、规范化 basename、path 依次比较，因此缺失或重复 rank 仍确定；rename 不改 Child Note 上的 rank，manual parent 下的新 Child 取末尾 rank。

## Node 操作

NodeService 把 create、rename、move、place、merge、repair 和 trash 作为串行结构事务；所有 rename/move 都经过 Obsidian FileManager 以保留链接。Move/placement 拒绝自身和 descendant，相对放置在同一事务内重新计算 parent/index。每项多步操作预检查磁盘与缓存中的目标路径，并维护逆序 rollback；rollback 无法安全完成时返回包含原始错误与恢复错误的聚合失败，而不伪报成功。Merge 预检查目标路径与 frontmatter 冲突；目标属性优先，非冲突来源属性合入目标，正文追加后移动资源并把来源送入系统回收站。允许仅移动或删除 Node Note，并保持所属文件夹不动。外部 rename 调和会双向同步已有 Node Note/文件夹配对，但绝不凭空创建缺失 Note。Root 不允许作为完整节点 rename/move/delete。新 Node Note 默认为空白；Folder Nodes 不执行内容模板。

结构元数据 patch 在恰好一个匹配 Markdown view 时使用当前未保存编辑器，否则通过 `Vault.process` 提交；两条路径都固定原始 TFile 与 path，在 commit 前重新核对，并拒绝同期替换或内容变化。Rollback closure 保留原始对象引用，并在 mutation 前验证仍是插件拥有的内容。设置持久化使用 schema v1，无版本数据只迁移一次；显式 schema 无效或更高时只读打开，未知字段绝不回写。其本地串行队列捕获不可变快照，保留最近失败的快照供“重试保存”，并在卸载时追加一份最终兼容快照，保证旧写入不能最后完成。

## Visual 解析

Visual Core 只接受 scalar string 或 flat string list。它把每项分为基础候选、颜色修饰或未知项：基础候选是 Vault image wikilink、Obsidian registry 中的 Lucide，或恰好一个可见 extended grapheme cluster；`lucide:` 显式消歧，`color:` 表示前景强调色或回退色。解析保留顺序供诊断和解析，首个合法颜色生效。VisualService 逐个解析 Metadata Cache 与 Vault resource URI，图片无法解析时继续本地下一基础候选。解析到文字或 Lucide 时，颜色直接作用于前景；解析到 Emoji 或图片时保留原始像素，不增加圆点或容器装饰；所有基础候选都失败时，颜色才成为居中的圆形色标。只有本地声明完全耗尽后才查找最近祖先，并且不跨层组合基础候选与颜色。Picker 写入拒绝未知或多字素值。渲染器增加 kind/script class：文字使用 Obsidian 界面字体，Emoji 使用所选本机彩色字体或系统字体栈，来自属性的 Explorer/标题图标进入固定且无边框的图标位。Imperative 设置页只通过本地 `FontFace` source 探测固定候选，不枚举全部系统字体；RuntimeStyles 将通过校验的所选字体栈注入每个 workspace document 的自有样式表，字体缺失时继续回退系统栈。标题图标位仍位于可编辑文字之外，通过测量标题首行的 block/inline offset 并在 resize 后重新计算。高级 CSS 变量继续提供覆盖能力。

Picker 使用 `FileManager.processFrontMatter` 写回：零项删除属性，一项写 Text，多项写 List。遇到未知、多字素、非字符串或嵌套值时拒绝写入，不静默接受或丢失数据。

## Explorer 与 Contents

ExplorerAdapter 仅封装 File Explorer 宿主边界：它发现每个 `file-explorer` leaf，并只观察对应 leaf container，不观察 `document.body`。每个 surface 使用自己的 Document、MutationObserver、可用时的 ResizeObserver、AbortController 与事件监听，因此主窗口和 popout window 相互隔离；装饰请求按批合并。适配器插入一个幂等的置顶 Root 行、隐藏 canonical note、按设置在名称前/后渲染或隐藏 Node Visual、执行受保护的 reveal 并识别 disclosure control。桌面能力开关启用 HTML5 drag listener、draggable 和 before/into/after placement；Android 保留同一装饰和点击行为，但不注册拖放监听、不声明 draggable。它增加不同语义的“新建节点”，但不隐藏 Obsidian 原生“新建笔记/新建文件夹”。笔记标题图标是 `.inline-title` 的不可编辑 sibling，不进入可编辑标题文本。`stop`/unload 断开观察器和监听器，移除所有自有 DOM/class，恢复插件改过的 draggable 和 Explorer 顺序。Explorer 与 Contents 都把结构放置交给 NodeService。

Contents View 以活动文件的 owning folder 作为当前 Node，没有活动文件时使用 Root；Root Node Note 的 path 是根目录下清理非法文件名字符后的 Vault 名。View 只查询当前 Node 的 direct children 与 direct files，Nodes/Album/Files 各自独立按每批 200 项分页。反向引用计数由 Core 的 ReferenceIndex 在 metadata 事件上增量维护，render 不遍历全 Vault `resolvedLinks`。桌面端的纯 UI interaction helpers 定义内部 drag MIME、受支持 payload、三段 zone 和键盘菜单手势；Android 不创建 drag handle/source/target，继续使用 App 层集中创建的 Move、Move up、Move down 与原生 folder move。NodeService 在原生跨父级 folder rename 调和后为手动目标父级追加新的 child rank，避免来源 rank 污染目标顺序。菜单 action 由 App 层集中创建。健康与问题 Node 的菜单保持 Folder Nodes-owned，不触发 `file-menu`；普通文件、相册条目与未管理文件夹才用独立 source 触发 `file-menu`，允许其他插件扩展而不重复 Folder Nodes 自己的动作。相册图片通过 Vault resource URI 加载到所属 window 的非 DOM `Image`，再绘制一次到 canvas；rerender/onClose 会取消未完成加载。包括 GIF 在内均保持静态且不读取 Vault binary，视频和音频从不创建播放元素。

## 节点图谱

GraphIndex 由节点图谱扩展拥有，复用 NodeService 的分类/排序、Metadata Cache、ReferenceIndex 与已解析 Visual。它只记录一次配置节点、有方向的父子结构和已解析 canonical-note 链接邻接，再消费 path-targeted RefreshBatch 失效。NodeService 顺序贯穿 topology 与两种布局，因此同一图谱的局部刷新和全新重建会得到相同坐标。Active-leaf、范围、搜索、展开、2D/3D 切换和链接开关都不重建 Vault 目录。重命名原子重映射以 path 为键的图谱与 view state，删除清理失效状态。这条边界只服务节点图谱，不替换 Explorer 或 Contents 的数据路径。

ViewState 把序列化 workspace 字段与会话状态分开。旧 relation mode 只在 workspace 边界兼容读取：Structure 变为 `showLinks: false`，Links/Hybrid 变为 `showLinks: true`，新建 view 默认 false。每个范围的展开以内存中的一层基线与 expanded/collapsed 分支例外表达；搜索临时叠加祖先展开，并在清空前保留原有展开、焦点和镜头快照。全局、子树与局部 reducer 在布局前产生结构范围；局部包含一个父级上下文但只沿选中节点子树展开，并且只有开启链接叠加时才加入直接链接邻居。

VisibleScene 是 DOM、Canvas 2D 与 Canvas 3D 消费的唯一过滤模型。搜索以单次线性遍历汇总结果，view 只计算当前维度的布局。共享几何统一拥有卡片尺寸、presentation、hit test、父级/子级把手、结构锚点、链接卡片边缘锚点与链接曲线。结构边保留明确的 parent-to-child 方向：从左到右布局连接父卡右把手到子卡左把手，从上到下布局连接父卡下把手到子卡上把手；链接边与把手及结构骨架独立。Canvas 保留所有可见结构边，只对链接边及聚焦关联链接应用限制。大 2D 保持可读的最小比例，通过空间索引查询视口候选，同时保留所需的父级边端点；大 3D 使用与命中几何一致的圆点，并仅对焦点或悬停显示完整卡片。渲染状态不成为覆盖图谱的浮层；close/unload 会释放全部订阅、observer、animation frame、canvas 与 DOM。

## 一致性与失败关闭

每个 Vault 事件入口先消费由 OperationCoordinator 记录的预期内部事件；外部 rename 事件再进入同一结构事务队列。原生 create/delete 事件只刷新分类，不自动转换笔记、补全另一侧或重建已删除 Node Note。外部 rename 只对明确配对的完整节点同步另一侧；不完整节点只重命名实际存在的一侧。每个 Workspace document（包括 popout document）只注册一个 capture-phase 未解析链接处理器，不观察 body；它解析 Obsidian 的新笔记父路径、遵守不管理边界，并把支持的 Markdown 目标交给 `createNodePath`，让显式路径缺失的祖先和目标 Node 共用同一个 undo stack。显式 WikiLink 显示文字只在共用 aliases 设置开启时写入。选区创建固定来源 TFile/path 与源码 range；纯源码分类器在单个表格单元格内转义 WikiLink 分隔符，并拒绝跨单元格/跨行。视觉刷新由 RefreshScheduler 合并为一次全量或 path-targeted batch，GraphIndex 消费同一批次，不再启动独立扫描。路径碰撞、循环、selection 变化、folder rename 双 canonical 候选和 merge property 冲突停止操作。可选批量整理以分批异步方式扫描并支持取消；确认写入前重新核对预览签名，提交后再次验证完整结构，失败则 rollback。所有写入弹窗在提交进行中拒绝取消/关闭，插件卸载会中止已确认的批量整理并阻止之后的正向 mutation。Health 不持有 commit 动作。正式 Vault 部署、源码测试、打包候选和主机验收是独立证据。
