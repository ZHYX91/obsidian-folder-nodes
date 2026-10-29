---
source_language: zh-CN
translation_status: source
---

# Folder Nodes — 架构

## 身份与持久化

完整 Node 的当前身份是规范化 Vault folder path 与 `A/A.md` 结构，不存在稳定 ID。缺少文件夹或同名 Node Note 的一侧立即归类为不完整节点，但不会获得另一套隐藏身份，也不需要初始化或接管状态。Folder Nodes 主动使用 `aliases`、`icon` 和唯一的插件自有 `folder-nodes` Text List。它的规范 token 是 `order=manual`、正整数 `rank=N` 与 `hidden=true`；默认值不出现，空列表删除。`aliases` 与 `icon` 是共用内容惯例，`folder-nodes` 是插件结构契约。主页偏好、图标位置、命名规则、不管理的指定路径和名称开头规则保存在插件 `data.json`，不写入笔记 YAML。节点图谱 leaf 只把范围、焦点、维度和是否显示链接序列化到 Obsidian workspace state；每个范围的分支展开与活动搜索快照只保留在该 leaf 内存中，不写入 `data.json`、笔记 YAML，也不在重启后恢复。

## 分层

`folder-nodes` 列表是受保护的结构元数据，不会在合并时从来源节点复制。NodeService 的 `children()` 仍返回完整受管理结构；可见性投影采用 `unmanaged || !hiddenNodesEnabled || showHiddenNodesThisSession || !effectiveHidden(node)`，并向上查找最近的新属性或兼容旧字段隐藏来源。Explorer、Contents 与 Graph 共用该规则，图谱在模型与布局前剪枝隐藏子树。插件只把持久总开关写入当前 schema 3 `data.json`，会话显示开关只存在内存中。兼容的无版本、schema 1 和 schema 2 设置会统一规范化为 schema 3 快照且不改写笔记；已弃用的图谱规则数组会被丢弃并报告条目数。

属性解析同时读取 `folder-nodes` 与已公开的 `folderNodeChildrenSort`、`folderNodeSiblingRank`、`folderNodeHidden`。新旧双写等价时视为冗余；冲突和已知无效值失败关闭。结构属性与通用标量的源码 patcher 只接受无缩进的顶层块式映射：非零根缩进、顶层 flow mapping/序列、显式复合键和标量文档都保守拒绝，且不改动原文；正常块式映射保留普通标量中的标点、引号值以及行内或跨行 flow 值，包括 anchor 和 tag。跨行值的边界使内部 key 不会被读作顶层属性，标量替换会移除完整的旧值。源码 patcher 只拥有这些精确顶层 key，检测重复/引号 key/未闭合歧义，保留 BOM、换行符、无关 YAML/正文和有效的未知未来 token，并写入规范 token 顺序。属性迁移绝不是启动副作用：只读扫描为精确源码生成指纹；显式提交重新扫描，在适用时固定 TFile 身份与当前未保存编辑器，完成后验证，失败时按原文精确回滚。

Core 只处理路径、命名、不管理边界规则、批量整理计划、反向引用索引、稀疏排序、frontmatter 最小 patch、Visual declaration 解析，以及节点图谱的纯可见性/几何。命名 Core 只验证公开的 Obsidian/Moment 子集并接收注入的时间格式化函数；真正的 `moment(date).format(pattern)` 位于 Obsidian adapter 边界。Adapters 封装 Vault、Metadata Cache、File Explorer、资源 URI 与 Node 操作；VaultOperationCoordinator 独立负责结构写入串行化和内部事件归属。Presentation 放置 Explorer、设置页与 UI 共用的宿主 DOM 渲染器，避免反向跨越各自分层边界。UI/App 提供本地化、设置、命令、菜单、弹窗、Visual Picker、Contents View、节点图谱状态/渲染与批量刷新调度。节点图谱只采用有界的 `GraphIndex → ViewState → VisibleScene → renderer` 流程，不扩展成全插件数据抽象。公开仓库不依赖本地工作区或个人 Vault。

## 排序引擎

自然模式按 Unicode 规范化 basename 做 numeric-aware 排序且不写 token。手动子节点排序是父节点上的显式模式：把一个完整父节点切换为手动时写入 `order=manual`，并按当时的自然顺序以 1024 间隔为直接 Child Nodes 物化正整数 `rank=N`。存在安全空隙时，普通 placement 只 patch moved Child；若 rank 缺失、重复、间隙耗尽或接近安全整数边界，规划器先确定完整目标序列，再严格按该序列整体重新编号，绝不在重编号阶段按旧 rank 重新排序。普通结构移入不会把自然父节点隐式切换为手动；恢复自然排序只删除父节点模式 token，非活动 rank 被忽略，之后再次开启手动也不会复活旧序列。

## Node 操作

NodeService 把 create、rename、move、place、merge、repair 和 trash 作为串行结构事务；所有 rename/move 都经过 Obsidian FileManager 以保留链接。Move/placement 拒绝自身和 descendant，相对放置在同一事务内重新计算 parent/index。每项多步操作预检查磁盘与缓存中的目标路径，并维护逆序 rollback；rollback 无法安全完成时返回包含原始错误与恢复错误的聚合失败，而不伪报成功。Merge 预检查目标路径与 frontmatter 冲突；目标属性优先，非冲突来源属性合入目标，先移动资源，再追加来源正文，最后按 Obsidian 的文件删除设置删除来源。允许仅移动或删除 Node Note，并保持所属文件夹不动。外部 rename 调和会双向同步已有 Node Note/文件夹配对，但绝不凭空创建缺失 Note。Root 不允许作为完整节点 rename/move/delete。新 Node Note 默认为空白；Folder Nodes 不执行内容模板。

合并在预检查前固定子项路径与父目录。最终校验在异步读取两篇笔记期间监听 Vault 修改事件，再同步检查两篇笔记的对象身份、编辑器状态和来源剩余结构；检测到变化时，在调用回收站操作前终止。最终 FileManager 回收站操作的调用是提交边界，之后卸载不会取消已交给宿主的操作。临时修改监听器在成功或失败时都会释放。

结构元数据 patch 在恰好一个匹配 Markdown view 时使用当前未保存编辑器；没有匹配编辑器时才通过 `Vault.process` 提交，多个匹配 view 或文件绑定变化时拒绝写入；两条路径都固定原始 TFile 与 path，在 commit 前重新核对，并拒绝同期替换或内容变化。Rollback closure 保留原始对象引用，并在 mutation 前验证仍是插件拥有的内容。正向元数据回调及原生重命名续程在派发前重新检查服务仍处于活动状态。宿主已受理的写入先交回收据，再处理卸载取消；卸载后仍允许核对原内容的精确补偿。设置持久化使用 schema 3，并把兼容的无版本、schema 1 和 schema 2 数据统一规范化为规范 schema 3 快照。schema 2 的共享旧 `%` 时间格式会转换为独立的 Moment 前缀/后缀格式，已弃用的图谱规则数组会丢弃并报告；显式 schema 无效或更高时只读打开，未知字段绝不回写。其本地串行队列捕获不可变快照，保留最近失败的快照供“重试保存”，并在卸载时追加一份最终兼容快照，保证旧写入不能最后完成。

CreatedNodeRecovery 负责创建记录与补偿顺序；NodeService 提供文件身份、原文和写入端口。清理在最后一次异步原文读取后同步复核身份，并拒绝删除已被任意 Markdown 面板打开的新建文件，包括没有保存方法的面板。复核与最终删除派发之间没有异步步骤；已派发的宿主删除无法取消。保留的产物按当前路径和失败原因报告。

合并链接预检查通过 Metadata Cache 从每篇原始笔记解析 WikiLink 和嵌入，覆盖 alias、标题/块片段、迁入的 Text/List 属性以及要移动的 Markdown 子笔记。解析到即将删除的来源 Node Note 时，在第一次移动或写入前停止合并。围栏/缩进代码、行内代码和注释保持字面量。此检查拒绝不安全链接，不自动重写链接。无法可靠判定的编号列表围栏开头，以及同一行组合列表/引用的围栏开头，按失败关闭处理，不假设它们隐藏了后续链接。

非空 WikiLink 选择器必须在原、新来源上下文中解析到同一个现存文件对象和路径。未解析目标、会移动的目标，以及移动前后路径后缀可能参与同一选择器最佳匹配的文件，都在首次副作用前保守拒绝；不能用两次解析的路径映射代替对宿主移动后解析的证明。移动子笔记的空路径标题/块自指保持自指，来源 Node Note 的自指仍拒绝。预检查保留原目标身份，最终提交只用新上下文复核，不在已改变的目录结构中重新解析旧来源。后代正文或非结构属性变化同样阻止提交。

手动目标父级的合并排序从一次目标序列和来源子节点序列快照规划。所有迁入项依次更新事务内 rank，完整规划后才写净 patch；后续分配不读取较早写入是否已出现在 Metadata Cache。原始 rank 与源路径仍由同一逆序补偿栈恢复。普通文件移动在排队前固定来源 TFile、来源路径、目标 TFolder 和目标路径，队列开始及最后异步冲突检查后复核全部绑定。

## Visual 解析

Visual Core 只接受 scalar string 或 flat string list。它把每项分为基础候选、颜色修饰或未知项：基础候选是 Vault image wikilink、Obsidian registry 中的 Lucide，或恰好一个可见 extended grapheme cluster；`lucide:` 显式消歧，`color:` 表示前景强调色或回退色。解析保留顺序供诊断和解析，首个合法颜色生效。VisualService 逐个解析 Metadata Cache 与 Vault resource URI，图片无法解析时继续本地下一基础候选。解析到文字或 Lucide 时，颜色直接作用于前景；解析到 Emoji 或图片时保留原始像素，不增加圆点或容器装饰；所有基础候选都失败时，颜色才成为居中的圆形色标。只有本地声明完全耗尽后才查找最近祖先，并且不跨层组合基础候选与颜色。Picker 写入拒绝未知或多字素值。渲染器增加 kind/script class：文字使用 Obsidian 界面字体，Emoji 使用所选本机彩色字体或系统字体栈，来自属性的 Explorer/标题图标进入固定且无边框的图标位。Imperative 设置页只通过本地 `FontFace` source 探测固定候选，不枚举全部系统字体；RuntimeStyles 将通过校验的所选字体栈注入每个 workspace document 的自有样式表，字体缺失时继续回退系统栈。标题图标位仍位于可编辑文字之外，通过测量标题首行的 block/inline offset 并在 resize 后重新计算。高级 CSS 变量继续提供覆盖能力。

Picker 使用 `FileManager.processFrontMatter` 写回：零项删除属性，一项写 Text，多项写 List。遇到未知、多字素、非字符串或嵌套值时拒绝写入，不静默接受或丢失数据。

Visual 编辑在打开 Picker 或封面菜单时固定原文件夹、canonical note、路径和 `icon` 值。NodeService 串行写入，并在实际 `processFrontMatter` 回调内再次核对绑定和活动生命周期；对象替换、重命名、icon 变化或卸载均拒绝编辑。卸载还会使打开的 Picker 失效；列表排序/删除后恢复键盘焦点到剩余行。

## Explorer 与 Contents

ExplorerAdapter 仅在 `start` 后绑定界面。异步 reveal、观察器回调与延迟装饰都绑定创建它们的运行代际；`stop` 使该代际失效，因此稍后完成的宿主调用不能重新安装界面资源，即使适配器已再次启动。每次异步 leaf 物化后也重新检查目标可见性。

动画结算有请求自有的一秒安全上限。动画在采样后停滞或暂停时，超时只丢弃请求而不滚动；用户接管及销毁会取消计时器，迟到完成不能使请求复活。不可见工具栏或不覆盖目标行水平范围的工具栏不缩减其视口。

工具栏与视口的边缘沿用 reveal 后置条件的半像素容差，避免共同边缘的浮点舍入让整条覆盖工具栏漏出有效视口计算。

ExplorerAdapter 仅封装 File Explorer 宿主边界：它发现每个 `file-explorer` leaf，并只观察对应 leaf container，不观察 `document.body`。适配器隐藏 canonical note，并从真实 `TFolder.children` 减去 canonical note 和当前不可见的受管理子树，判断 Folder Node 是否为视觉叶子；视觉叶子只给现有 disclosure control 添加可清理的圆点 class 和受所有权保护的 `aria-hidden`，不写宿主展开状态。在虚拟化 Explorer 中，Manual 模式只把 sibling 顺序投影到受保护的宿主 sorter，Name 模式继续使用原生顺序。普通刷新只保持当前可见 viewport anchor；显式宿主 reveal（包括原生 breadcrumb reveal）使用独立的实际 DOM viewport 后置条件，因此即使插件自己的 Root 行或隐藏行让宿主虚拟几何与实际布局不一致，也只对被请求且本应可见的目标行做最小滚动修正。有效视口与祖先裁剪区及 visual viewport 相交，并排除覆盖内容的移动工具栏。canonical Node Note 的 reveal 目标投影到对应文件夹行，属性隐藏目标不会被强制显示，私有宿主能力缺失时不接管。Mutation 批刷新在可见内容出现时恢复箭头。每次显式 reveal 只拥有自身宿主调用完成及下一次渲染时的有限物化机会；若抽屉仍有有限的布局动画，先等待其结束，旧请求完成不能结算新请求。用户输入、目标可见性变化、销毁或该渲染边界会取消尚未完成的校正。桌面能力开关启用 HTML5 drag listener；Android 保留同一装饰但不声明 draggable。`stop`/unload 断开观察器和监听器，移除全部自有 DOM/class，并恢复属性、顺序、sorter 与 reveal 函数。

Contents View 以活动文件的 owning folder 作为当前 Node，没有活动文件时使用 Root。一次 render 只查询 direct children/files，非空 Nodes/Album/Files 各自分页；三者全空时由统一空态替代三个 disclosure。breadcrumb 在 render 时排除 current item，深路径压缩中段；current card 既表达当前节点又负责打开 Node Note。Node Graph 扩展把入口注入现有 header action 容器，不再 prepend 独立顶行。`sectionOpen` 只属于 view instance，rerender/切换节点保留，onClose 后随实例释放。桌面端保留 drag helpers；Android 不创建 drag ownership。普通文件、相册条目与未管理文件夹仍通过独立 `file-menu` source 接收第三方动作。

## 节点图谱

ItemView 拥有以 app scope 为父级的子 `Scope`。选择性的通配处理仅在本图谱 Canvas、Canvas 节点正文或 DOM 节点正文持有焦点时接管 Ctrl/Cmd+Enter，先于宿主全局打开链接快捷键消费事件；它复用同一收起详情／打开路径，重复按键或输入法组合不会重复激活。Alt+Enter 只将已有 Canvas 或 DOM 展开把手交给原整支切换路径。其余焦点及组合键交回父级，视图关闭后自有处理失效，焦点始终取自视图所属文档。

Scope 与目标处理器共用纯函数 `graphActivationChord`，区分普通激活、Enter 加单一 Ctrl／Cmd，以及 Enter／空格加纯 Alt；各表面保留自身原有激活键。未支持的组合在父级回退后不会变成打开或切换，`graphHandleClickAllowed` 还拒绝其浏览器默认生成的把手点击，同时保留普通辅助技术点击与真实鼠标修饰键。原生主体按钮点击仍执行选择，包括未支持按键生成的点击。键盘打开／整支处理器拒绝已关闭视图及替换后脱离容器的旧目标。

GraphIndex 由节点图谱扩展拥有，复用 NodeService 的分类/排序、属性驱动的子树可见性、Metadata Cache、ReferenceIndex 与已解析 Visual。它只记录一次全部可见受管理节点、有方向的父子结构和已解析 canonical-note 链接邻接，再消费 path-targeted RefreshBatch 失效，不存在单独的纳入/排除规则层。NodeService 顺序贯穿 topology 与两种布局；增量刷新后只根据缓存父子关系恢复与完整构建一致的深度优先顺序，不重新遍历 Vault，因此同一图谱的局部刷新和全新重建会得到相同坐标。Active-leaf、范围、搜索、展开、2D/3D 切换和链接开关都不重建 Vault 目录。重命名原子重映射以 path 为键的 view state，删除清理失效状态。这条边界只服务节点图谱，不替换 Explorer 或 Contents 的数据路径。

ViewState 把序列化 workspace 字段与会话状态分开。每次手动设置 expansion 后先从 VisibleScene 得到可见 ID；若 focus 不在其中，就沿 topology parent 链提升到最近可见祖先，再渲染 DOM、Canvas 2D 或 Canvas 3D。搜索使用直接的临时 expansion/focus 快照路径，不经过这条手动调和，因此清空时仍精确恢复进入搜索前状态。每个范围的展开以内存中的一层基线与 expanded/collapsed 分支例外表达。

VisibleScene 是 DOM、Canvas 2D 与 Canvas 3D 消费的唯一过滤模型。搜索以单次线性遍历汇总结果，view 只计算当前维度的布局。共享几何统一拥有卡片尺寸、presentation、hit test、父级/子级把手、结构锚点、链接卡片边缘锚点与链接曲线。粗指针的从上到下布局使用 72px 卡片高度，其余使用 46px；DOM 与 Canvas 呈现、视口剔除、命中区域、边线和视口拟合使用同一高度，密集 DOM 3D 圆点仍为 16px，Canvas 圆点保留既有尺寸。结构边保留明确的 parent-to-child 方向：从左到右布局连接父卡右把手到子卡左把手，从上到下布局连接父卡下把手到子卡上把手；链接边与把手及结构骨架独立。Canvas 保留所有可见结构边，只对链接边及聚焦关联链接应用限制。大 2D 保持可读的最小比例，通过空间索引查询视口候选，同时保留所需的父级边端点；大 3D 使用与命中几何一致的圆点，并仅对焦点或悬停显示完整卡片。工作区 Graph View 在自身 ItemView 生命周期内直接拥有 DOM viewport observer；独立 toolbar renderer 负责 SearchComponent 与工具栏 DOM 构建，插件层不再仅为了转接几何生命周期而增加一层继承。同范围重绘保留视口状态与仍在编辑的搜索输入，同步全部依赖模型的工具栏字段，替换视口按钮绑定，并在恢复相机后重新投影 DOM 3D 节点与边线。待保存设置重试成功后会调和最新已提交设置，但不会提交控件中尚未完成的文本。渲染状态不成为覆盖图谱的浮层；close/unload 会释放全部订阅、observer、animation frame、canvas 与 DOM。

Canvas 键盘目标选择由纯函数 `graphKeyboardTarget` 负责，输入为当前 2D 或投影后的 3D 位置及稳定场景顺序；渲染器负责焦点、激活和宿主事件。方向键按屏幕方向移动且不循环，Home 和 End 保持场景顺序。

Canvas 的图像缓存保留当前视口实际绘制的完整视觉工作集；重复视觉共享一张图像，加载失败也保留结果，离开视口、主题变化或销毁时解除对应加载回调。可见工作集超过 256 项时不会在帧内相互逐出；加载完成最多请求合并后的重绘，旧资源完成不能唤醒已替换的视口。悬停提示先测量实际边界，再按可用空间翻转和夹边；长路径折行，右到左布局优先放在指针左侧。

视口尺寸改变时先清除旧悬停，再按新尺寸绘制。详情超过可用高度时，会在指针旁成为可聚焦、可滚动的说明区域；按指针上/下较大可用空间限制高度，让触发点仍可点击。200 ms 隐藏延迟允许指针跨过详情与节点浮层之间的空隙，进入或聚焦任一区域均取消隐藏；新节点重置双轴滚动，Escape 将焦点交回 Canvas。所有指针和键盘打开操作均先收起详情并取消计时器，再调用宿主。计时器属于表面所在文档的窗口，隐藏、resize 和销毁均取消它，已销毁渲染器拒绝保留的回调。插件卸载或重启也使等待中的 reveal 通知失效，取消不会再产生迟到的不可用或错误提示。

## 一致性与失败关闭

每个 Vault 事件入口先消费由 OperationCoordinator 记录的预期内部事件；外部 rename 事件再进入同一结构事务队列。原生 create/delete 事件只刷新分类，不自动转换笔记、补全另一侧或重建已删除 Node Note。外部 rename 只对明确配对的完整节点同步另一侧；不完整节点只重命名实际存在的一侧。每个 Workspace document（包括 popout document）只注册一个 capture-phase 未解析链接处理器，不观察 body；它解析 Obsidian 的新笔记父路径、遵守不管理边界，并把支持的 Markdown 目标交给 `createNodePath`，让显式路径缺失的祖先和目标 Node 共用同一个 undo stack。显式 WikiLink 显示文字只在共用 aliases 设置开启时写入。选区创建固定来源 TFile/path 与源码 range。共用异步操作服务默认确认弹窗和可选直接创建路径；NodeService 创建目标后，FileManager.generateMarkdownLink 负责链接语法、路径格式与同名消歧。纯 helper 对 Markdown 字面显示文本和目标路径裸括号做增量转义，保留百分号转义与普通 WikiLink 显示标点，并拒绝无法保留显示文本的 WikiLink delimiter 序列。源码分类器拒绝跨单元格/跨行，helper 仅转义尚未转义的表格竖线。替换前重新核对来源身份、range、表格上下文和仍打开的编辑器；生成或替换失败时用现有创建回执回滚。视觉刷新由 RefreshScheduler 合并为一次全量或 path-targeted batch，GraphIndex 消费同一批次，不再启动独立扫描。路径碰撞、循环、selection 变化、folder rename 双 canonical 候选、属性冲突及 merge frontmatter 冲突停止操作。可选批量整理与显式属性迁移以分批异步方式扫描并支持取消；确认写入前重新核对预览，提交后再次验证完整结果，失败则 rollback。所有写入弹窗在提交进行中拒绝取消/关闭，插件卸载会中止已确认工作并阻止之后的正向 mutation。Health 合并两类扫描与 icon 形状诊断，但不持有 commit 动作。正式 Vault 部署、源码测试、打包候选和主机验收是独立证据。
