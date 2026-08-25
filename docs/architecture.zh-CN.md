---
source_language: zh-CN
translation_status: source
---

# Folder Nodes 架构

## 身份与持久化

完整 Node 的当前身份是规范化 Vault folder path 与 `A/A.md` 结构，不存在稳定 ID。没有同名 Note 的文件夹是有效的仅文件夹节点壳，但不会获得另一套隐藏身份。Folder Nodes 主动使用 `aliases`、`icon`、`folderNodeChildrenSort` 和 `folderNodeSiblingRank`。`aliases` 与 `icon` 是可移植内容属性；两个 `folderNode` 字段是插件结构属性。Managed、Migrating、Unadopted 状态、主页偏好、图标位置、命名规则、不管理的指定路径和名称前缀规则保存在插件 `data.json`。

## 分层

Core 只处理路径、命名、不管理边界规则、迁移计划、反向引用索引、稀疏排序、frontmatter 最小 patch 和 Visual declaration 解析。Adapters 封装 Vault、Metadata Cache、File Explorer、资源 URI 与 Node 操作；VaultOperationCoordinator 独立负责结构写入串行化和内部事件归属。Presentation 放置 Explorer、设置页与 UI 共用的宿主 DOM 渲染器，避免反向跨越各自分层边界。UI/App 提供本地化、设置、命令、菜单、弹窗、Visual Picker、Contents View 与批量刷新调度。公开仓库不依赖本地工作区或个人 Vault。

## 排序引擎

自然模式按 Unicode 规范化 basename 做 numeric-aware 排序且不写属性。第一次明确手动 placement 时，父 Node 写 `folderNodeChildrenSort: manual`，当前直接 Child Nodes 以 1024 间隔物化 `folderNodeSiblingRank`。有空隙时只 patch moved Node；无空隙时最多 rebalance 64 个邻居，再退化为当前父节点的完整 rank 物化，但从不把子节点数组写进父 Note。读取时按有效 rank、规范化 basename、path 依次比较，因此缺失或重复 rank 仍确定；rename 不改 Child Note 上的 rank，manual parent 下的新 Child 取末尾 rank。

## Node 操作

NodeService 把 create、rename、move、place、merge、repair 和 trash 作为串行结构事务；所有 rename/move 都经过 Obsidian FileManager 以保留链接。Move/placement 拒绝自身和 descendant，相对放置在同一事务内重新计算 parent/index。每项多步操作预检查磁盘与缓存中的目标路径，并维护逆序 rollback；rollback 无法安全完成时返回包含原始错误与恢复错误的聚合失败，而不伪报成功。Merge 预检查目标路径与 frontmatter 冲突；目标属性优先，非冲突来源属性合入目标，正文追加后移动资源并把来源送入系统回收站。允许仅移动或删除 Node Note，并保持所属文件夹不动。外部 rename 调和会双向同步已有 Node Note/文件夹配对，但绝不凭空创建缺失 Note。Root 不允许作为完整节点 rename/move/delete。新 Node Note 默认为空白；Folder Nodes 不执行内容模板。

结构元数据 patch 在恰好一个匹配 Markdown view 时使用当前未保存编辑器，否则通过 `Vault.process` 提交；两条路径都固定原始 TFile 与 path，在 commit 前重新核对，并拒绝同期替换或内容变化。Rollback closure 保留原始对象引用，并在 mutation 前验证仍是插件拥有的内容。设置持久化捕获不可变快照并串行保存，旧写入不能晚于新写入完成。

## Visual 解析

Visual Core 只接受 scalar string 或 flat string list。它把每项分为基础候选、颜色修饰或未知项：基础候选是 Vault image wikilink、Obsidian registry 中的 Lucide，或恰好一个可见 extended grapheme cluster；`lucide:` 显式消歧，`color:` 表示颜色修饰。解析保留顺序供诊断和解析，首个合法颜色生效。VisualService 逐个解析 Metadata Cache 与 Vault resource URI，图片无法解析时继续本地下一基础候选；本地只有颜色时生成 swatch。只有本地声明完全耗尽后才查找最近祖先，并且不跨层组合基础候选与颜色。Picker 写入拒绝未知或多字素值。渲染器增加 kind/script class：文字使用 Obsidian 界面字体，Emoji 使用系统彩色 Emoji 字体，来自属性的 Explorer/标题图标进入固定且边界清晰的徽标。标题徽标仍位于可编辑文字之外，通过测量标题首行的 block/inline offset 并在 resize 后重新计算。高级 CSS 变量开放字体和徽标 token，不增加设置字体选择器。

Picker 使用 `FileManager.processFrontMatter` 写回：零项删除属性，一项写 Text，多项写 List。遇到未知、多字素、非字符串或嵌套值时拒绝写入，不静默接受或丢失数据。

## Explorer 与 Contents

ExplorerAdapter 仅封装 File Explorer 宿主边界：它发现每个 `file-explorer` leaf，并只观察对应 leaf container，不观察 `document.body`。每个 surface 使用自己的 Document、MutationObserver、可用时的 ResizeObserver、AbortController 与事件监听，因此主窗口和 popout window 相互隔离；装饰请求按批合并。适配器插入一个幂等的置顶 Root 行、隐藏 canonical note、按设置在名称前/后渲染或隐藏 Node Visual、执行受保护的 reveal、识别 disclosure control，并把 drag zone 映射到 before、into、after placement。它增加不同语义的“新建节点”，但不隐藏 Obsidian 原生“新建笔记/新建文件夹”。笔记标题图标是 `.inline-title` 的不可编辑 sibling，不进入可编辑标题文本。`stop`/unload 断开观察器和监听器，移除所有自有 DOM/class，恢复插件改过的 draggable 和 Explorer 顺序。Explorer 与 Contents 都把结构放置交给 NodeService。

Contents View 以活动文件的 owning folder 作为当前 Node，没有活动文件时使用 Root；Root Node Note 的 path 是根目录下清理非法文件名字符后的 Vault 名。View 只查询当前 Node 的 direct children 与 direct files，Nodes/Album/Files 各自独立按每批 200 项分页。反向引用计数由 Core 的 ReferenceIndex 在 metadata 事件上增量维护，render 不遍历全 Vault `resolvedLinks`。纯 UI interaction helpers 定义内部 drag MIME、受支持 payload、三段 zone 和键盘菜单手势；View 只持有一次 drag session 与一个 drop marker。Node drop 调用结构放置；单个普通文件 drop 调用 FileManager-backed `moveFile` 且只接受 into。多选用于插入/复制链接；拖动多选只提供链接文本，不执行部分多文件移动。菜单 action 由 App 层集中创建。健康与问题 Node 的菜单保持 Folder Nodes-owned，不触发 `file-menu`；普通文件、相册条目与未管理文件夹才用独立 source 触发 `file-menu`，允许其他插件扩展而不重复 Folder Nodes 自己的动作。相册图片通过 Vault resource URI 加载到所属 window 的非 DOM `Image`，再绘制一次到 canvas；rerender/onClose 会取消未完成加载。包括 GIF 在内均保持静态且不读取 Vault binary，视频和音频从不创建播放元素。

## 一致性与失败关闭

Managed 状态在每个 Vault 事件入口先消费由 OperationCoordinator 记录的预期内部事件；外部 rename 事件再进入同一结构事务队列。原生 create/delete 事件只刷新状态，不自动转换笔记或重建已删除 Node Note。每个 Workspace document（包括 popout document）只注册一个 capture-phase 未解析链接处理器，不观察 body；它解析 Obsidian 的新笔记父路径、遵守受管边界，并把支持的 Markdown 目标交给 `createNodePath`，让显式路径缺失的祖先和目标 Node 共用同一个 undo stack。显式 WikiLink 显示文字只在共用 aliases 设置开启时写入。选区创建固定来源 TFile/path 与源码 range；纯源码分类器在单个表格单元格内转义 WikiLink 分隔符，并拒绝跨单元格/跨行。视觉刷新由 RefreshScheduler 合并为一次全量或 path-targeted batch。启动验证严格只读。路径碰撞、循环、selection 变化、folder rename 双 canonical 候选和 merge property 冲突停止操作。初始化/迁移在确认写入前重新核对预览签名，提交后再次验证完整结构，失败则 rollback；所有写入弹窗在提交进行中拒绝取消/关闭。插件卸载会中止已确认迁移并阻止之后的正向 mutation。进入 `migrating` 状态本身具有事务性：首次设置保存失败时恢复此前的内存 adoption state，且绝不启动迁移。Health 不持有 commit 动作。正式 Vault 部署、源码测试、打包候选和主机验收是独立证据。
