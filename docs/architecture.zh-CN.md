---
source_language: zh-CN
translation_status: source
---

# Folder Nodes 架构

## 身份与持久化

Node 的当前身份是规范化 Vault folder path 与 `A/A.md` 结构，不存在稳定 ID。Folder Nodes 主动使用 `aliases`、`icon`、`folderNodeChildrenSort` 和 `folderNodeSiblingRank`。`aliases` 与 `icon` 是可移植内容属性；两个 `folderNode` 字段是插件结构属性。Managed、Migrating、Unadopted 状态、主页偏好、图标位置、命名规则、不管理的指定路径和名称前缀规则保存在插件 `data.json`。

## 分层

Core 只处理路径、命名、不管理边界规则、迁移计划、反向引用索引、稀疏排序、frontmatter 最小 patch 和 Visual declaration 解析。Adapters 封装 Vault、Metadata Cache、File Explorer、资源 URI 与 Node 操作；VaultOperationCoordinator 独立负责结构写入串行化和内部事件归属。UI/App 提供本地化、设置、命令、菜单、弹窗、Visual Picker、Contents View 与批量刷新调度。公开仓库不依赖本地工作区或个人 Vault。

## 排序引擎

自然模式按 Unicode 规范化 basename 做 numeric-aware 排序且不写属性。第一次明确手动 placement 时，父 Node 写 `folderNodeChildrenSort: manual`，当前直接 Child Nodes 以 1024 间隔物化 `folderNodeSiblingRank`。有空隙时只 patch moved Node；无空隙时最多 rebalance 64 个邻居，再退化为当前父节点的完整 rank 物化，但从不把子节点数组写进父 Note。读取时按有效 rank、规范化 basename、path 依次比较，因此缺失或重复 rank 仍确定；rename 不改 Child Note 上的 rank，manual parent 下的新 Child 取末尾 rank。

## Node 操作

NodeService 把 create、rename、move、place、merge、repair 和 trash 作为串行结构事务；所有 rename/move 都经过 Obsidian FileManager 以保留链接。Move/placement 拒绝自身和 descendant，相对放置在同一事务内重新计算 parent/index。每项多步操作预检查磁盘与缓存中的目标路径，并维护逆序 rollback；rollback 无法安全完成时返回包含原始错误与恢复错误的聚合失败，而不伪报成功。Merge 预检查目标路径与 frontmatter 冲突；目标属性优先，非冲突来源属性合入目标，正文追加后移动资源并把来源送入系统回收站。插件自有 `deleteFile` 拒绝 canonical Node Note；Managed 的 delete reconcile 在同名 folder 仍存在且无冲突时重建它，而不是删除 folder。Root 不允许 rename/move/delete。新 Node Note 默认为空白；Folder Nodes 不执行内容模板。

结构元数据 patch 在恰好一个匹配 Markdown view 时使用当前未保存编辑器，否则通过 `Vault.process` 提交；两条路径都固定原始 TFile 与 path，在 commit 前重新核对，并拒绝同期替换或内容变化。Rollback closure 保留原始对象引用，并在 mutation 前验证仍是插件拥有的内容。设置持久化捕获不可变快照并串行保存，旧写入不能晚于新写入完成。

## Visual 解析

Visual Core 只接受 scalar string 或 flat string list。它把每项分为基础候选、颜色修饰或未知项：基础候选是 Vault image wikilink、Obsidian registry 中的 Lucide，或恰好一个可见 extended grapheme cluster；`lucide:` 显式消歧，`color:` 表示颜色修饰。解析保留原顺序、未知项和额外颜色，首个合法颜色生效。VisualService 逐个解析 Metadata Cache 与 Vault resource URI，图片无法解析时继续本地下一基础候选；本地只有颜色时生成 swatch。只有本地声明完全耗尽后才查找最近祖先，并且不跨层组合基础候选与颜色。渲染层只消费带可选 accent 的 `NodeVisual`：Lucide/文字使用前景色，Emoji 与 image 保留像素并使用外围背景/边框，SVG v1 不 inline 重着色。Core 仍可返回 fallback 供语义判断，但 Explorer、标题与 Contents 不为未声明 visual 的节点增加大文件夹图标。

Picker 使用 `FileManager.processFrontMatter` 写回：零项删除属性，一项写 Text，多项写 List。遇到非字符串或嵌套形状时拒绝编辑以免静默丢失；正常列表编辑会保留未知字符串。

## Explorer 与 Contents

ExplorerAdapter 仅封装 File Explorer 宿主边界：它发现每个 `file-explorer` leaf，并只观察对应 leaf container，不观察 `document.body`。每个 surface 使用自己的 Document、MutationObserver、AbortController 与事件监听，因此主窗口和 popout window 相互隔离；装饰请求按批合并。适配器插入一个幂等的置顶 Root 行、隐藏 canonical note、按设置在名称前/后渲染或隐藏 Node Visual、执行受保护的 reveal、识别 disclosure control，并把 drag zone 映射到 before、into、after placement。笔记标题图标是 `.inline-title` 的不可编辑 sibling，不进入可编辑标题文本。`stop`/unload 断开观察器和监听器，移除所有自有 DOM/class，恢复插件改过的 draggable 和 Explorer 顺序。Explorer 与 Contents 都把结构放置交给 NodeService。

Contents View 以活动文件的 owning folder 作为当前 Node，没有活动文件时使用 Root；Root Node Note 的 path 是根目录下清理非法文件名字符后的 Vault 名。View 只查询当前 Node 的 direct children 与 direct files，Nodes/Album/Files 各自独立按每批 200 项分页。反向引用计数由 Core 的 ReferenceIndex 在 metadata 事件上增量维护，render 不遍历全 Vault `resolvedLinks`。纯 UI interaction helpers 定义内部 drag MIME、受支持 payload、三段 zone 和键盘菜单手势；View 只持有一次 drag session 与一个 drop marker。Node drop 调用结构放置；单个普通文件 drop 调用 FileManager-backed `moveFile` 且只接受 into。多选用于插入/复制链接；拖动多选只提供链接文本，不执行部分多文件移动。菜单 action 由 App 层集中创建。健康与问题 Node 的菜单保持 Folder Nodes-owned，不触发 `file-menu`；普通文件、相册条目与未管理文件夹才用独立 source 触发 `file-menu`，允许其他插件扩展而不重复 Folder Nodes 自己的动作。相册图片通过 Vault resource URI 加载到所属 window 的非 DOM `Image`，再绘制一次到 canvas；rerender/onClose 会取消未完成加载。包括 GIF 在内均保持静态且不读取 Vault binary，视频和音频从不创建播放元素。

## 一致性与失败关闭

Managed 状态在每个 Vault 事件入口先消费由 OperationCoordinator 记录的预期内部事件，外部事件再进入同一结构事务队列。每个 Workspace document（包括 popout document）只注册一个 capture-phase 未解析链接处理器，不观察 body；它解析 Obsidian 的新笔记父路径、遵守受管边界，并把支持的 Markdown 目标交给 `createNodePath`，让显式路径缺失的祖先和目标 Node 共用同一个 undo stack。显式 WikiLink 显示文字优先来自 Metadata Cache，缺失时只做保守的渲染标签回退，并且只在共用 aliases 设置开启时写入；创建后事件调和继续作为该处理器之外创建操作的兜底。视觉刷新由 RefreshScheduler 合并为一次全量或 path-targeted batch。启动时会扫描并修复整个受管结构，移入受管范围的原忽略子树会递归接管。叶子笔记精确路径和忽略文件夹完整子树在扫描、链接创建与事件调和中共同生效。唯一且无损的缺失 Node Note 可以重建；路径碰撞、循环、selection 变化、folder rename 双 canonical 候选和 merge property 冲突停止操作。初始化/迁移在确认写入前重新核对预览签名，提交后再次验证完整结构，失败则 rollback；所有写入弹窗在提交进行中拒绝取消/关闭，避免界面假装操作已取消。插件卸载是独立生命周期边界：它会中止正在进行的启动修复或已确认迁移，把刚完成的步骤登记后 rollback，并阻止之后的正向 mutation。进入 `migrating` 状态本身也具有事务性：首次设置保存失败时恢复此前的内存 adoption state，且绝不启动迁移。Health 不持有提交动作。正式 Vault 部署、源码测试、打包候选和主机验收是独立证据。
