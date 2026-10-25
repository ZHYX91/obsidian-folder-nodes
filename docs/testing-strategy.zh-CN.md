---
source_language: zh-CN
translation_status: source
---

# Folder Nodes — 测试策略

## 自动化门禁

`FakeObsidian` 使用独立的 `yaml` 解析器从正文生成正常元数据。通过 `metadataUpdates: deferred`、`modifyEvents: deferred`、显式缓存覆盖与 `failNext()` 分别模拟延迟或失败。fixture 自身的契约测试核对 `modify`、`process`、`append` 和 `processFrontMatter` 的正文、元数据与通知；它不模拟完整宿主。`tests/helpers/frontmatter-oracle.ts` 比较 YAML 值并确认正文不变，覆盖包含引号或注释的未知 token。设置删除测试点击已渲染的规则行并延迟保存，输入弹窗测试通过真实输入处理器发送 composition/Enter 事件。源码字符串断言保留用于架构约束；用户动作使用行为断言。

`npm run check` 固定 Node/npm 版本，执行 lint、格式、双语文档契约、严格 TypeScript、覆盖率、生产 bundle 与发布布局检查。数值覆盖率门禁纳入 Core、设置数据、NodeService、Explorer 适配/宿主排序、节点图谱生产路径、RuntimeStyles/Presentation 等已有行为测试支撑的关键运行时代码，并保持 statements 80%、lines 80%、functions 75%、branches 70%。另行执行的 `npm run test:coverage:inventory` 会把全部 `src/**/*.ts` 生产 TypeScript（仅排除声明文件）列入报告，使 `plugin.ts`、`settings-tab.ts` 与 imperative modal 等运行时壳层出现在清单中，未覆盖代码明确显示而不被省略，但不会通过降低既有门槛来掩盖缺口。覆盖率用于暴露盲区，不能替代关键行为回归或真实宿主证据。测试覆盖路径与 Windows 保留名/字素安全截断、选区命名、表格单元格 alias 安全转义、跨单元格拒绝、未解析链接目标与显示 alias 规划、Visual、frontmatter 非法边界、批量整理中的非 Markdown 碰撞、指定路径/名称开头不管理规则、系统目录保护、设置深层规范化、固定 Emoji 字体候选校验与回退栈、新旧属性矩阵、稀疏排序（包括保持目标序列的完整重编号）、显式 placement gap 和增量反向引用。NodeService 使用内存 Vault/FileManager 进行行为测试，覆盖串行 create、显式路径 Node 的事务创建与 rollback、link-safe rename/move、原生跨父级移动后的目标 rank 调和、仅移动/删除节点笔记、文件夹与 canonical note 同步重命名、文件夹侧与 Markdown 侧的不完整节点、无需初始化的持续分类、忽略子树移入、批量整理和属性迁移的 TOCTOU/commit 后验证、merge 冲突、各类 rollback 及 in-flight 写入后的 lifecycle abort。同步与异步结构扫描器必须产生等价计划，取消不能写入。VaultOperationCoordinator 单测锁定失败后继续串行、递归事件归属和 TTL。UI/运行时测试锁定 Explorer surface start/stop 清理、Root 眼睛状态与点击边界、移动端不声明 draggable、保留原生创建控件和新增节点控件、不完整/不管理/冲突状态、分组动作面板、标题图标位于可编辑标题之外、标题图标测量对齐、不同 visual 类型的字体 class、本机 Emoji 字体探测失败、跨 document 运行时字体更新、disclosure selector、规范化兄弟 gap 指示器、结构移动与排序意图区分、drag payload、Shift+F10/Menu 键和设置层级/说明卡片；源码架构契约禁止全局 body observer、`vault.rename` 和 Contents 全量 `resolvedLinks` 扫描。

节点图谱测试直接导入真实生产入口，覆盖注册、启停、leaf 复用/关闭、状态迁移与 teardown，不把源码字符串断言当成行为证明。纯行为 fixture 覆盖三范围渐进默认、Root/局部边界、多个同时展开分支、普通/Alt/范围展开、收回一级、仅会话展开、旧关系迁移、搜索快照恢复、外部聚焦、节点主体打开/菜单、Tooltip/键盘/ARIA、Visual 回退、从左到右/从上到下结构锚点、独立链接锚点、链接 LOD 不删除结构边，以及单一 RuntimeStyles 权威。窄屏、粗指针和合成触控覆盖用于保护 Android 兼容代码，但不得表述成真实 Android 主机证据。

回归测试还会注入 closed file 同期编辑、未保存的 open editor、同路径 TFile replacement，以及 rollback 期间的同路径 folder replacement。设置保存测试通过延迟和拒绝较早的持久化调用，证明快照隔离、顺序和 queued latest state 的恢复。

选定文件的整体阈值与全量源码 inventory 是两种不同的检查。`node-service.ts`、`explorer-events.ts` 和 `settings.ts` 另有独立文件阈值，具体数值声明在 `vitest.config.mts`。文档事件注册表、`settings-tab.ts` 与 `prompt-modal.ts` 纳入数值门禁，输入弹窗另有文件阈值。单独的 inventory 不会对 `plugin.ts` 或 `contents-view.ts` 施加阈值。


选区回归调用生产命令、编辑器菜单、确认弹窗或直接创建路径，以及内存 Vault 上的 NodeService。测试核对目标创建后的真实 FileManager 调用参数，将三种路径格式、两种链接语法的预设宿主输出透明传递到普通正文和表格单元格，并覆盖字面显示文本、同名笔记、aliases、来源/range/表格/编辑器变化、创建冲突、重复提交、生成/替换异常及用户编辑后的回滚拒绝。这些测试不模拟 Obsidian 的路径选择算法，也不证明实时候选缓存或 Source/Live Preview 渲染行为。

创建清理回归在最后一次异步读取期间注入干净、未保存、多面板、无保存方法以及卸载中的 Markdown 面板，并模拟同路径 TFile 替换；断言内容保留和带路径、原因的本地化提示。Canvas 键盘测试覆盖两种布局方向与不循环边界。这些模拟时序不等于真实宿主编辑器或读屏器验收。

合并回归对来源正文和移动子笔记中解析到来源 Node Note 的 WikiLink/嵌入断言零 mutation，覆盖解析后的 Text/List 属性和 YAML 转义、basename 查找、alias、表格转义 alias、标题和块引用；代码/注释字面量及其他目标仍可通过。Visual 回归调用生产 Picker 和封面菜单，注入文件/文件夹身份或原始 icon 变化，并把实际 frontmatter 回调延迟到卸载后。键盘回归核对列表排序/删除后的焦点。静态资源回归重叠真实文件复制、模拟编辑器原子保存，并验证 watch 关闭时等待完成或报告错误。这些是 adapter/DOM/文件系统自动检查，不是桌面或 Android 验收。

## 性能

节点合并链接检查覆盖来源正文和移动的 Markdown 子笔记中的不安全行内链接、目标换行的引用式链接、
随节点移动且目标不变的附件，以及代码和注释字面量。最终读取回归在异步子笔记读取期间注入卸载、
重新打开编辑器、同路径文件替换和新增来源子项；先前检查的子笔记在后续读取期间变化也必须阻止删除。
`node-merge-link-safety` 验收场景在隔离桌面和 Android 宿主中覆盖拒绝、成功移动附件、编辑器竞态及
真实插件卸载。Provider 只准备条件和记录观察，不自行判定产品通过。

自动化测试必须锁定 `folder-nodes` 规范 token 的解析/写入/删除、公开旧字段读取、等价双写、冲突/无效/重复 YAML 失败关闭、源码保真显式迁移、过期预览拒绝、后代继承、Root/不完整/不管理写入拒绝、不管理与总开关优先级、合并不复制、Explorer/Contents/Graph 投影、Root 眼睛会话显示状态和图谱元数据增量失效。隔离 Vault 验收还要覆盖中英文设置、移动端无 hover、显式隐藏根使用“隐藏”文字徽标、继承后代弱化和来源提示、关闭总开关不改 YAML、会话重载复位，以及 Obsidian 搜索、快速切换、反向链接、原生图谱和直接打开不受影响。

Quick 门槛验证 10,000 个、large 门槛验证 100,000 个直接 Child Nodes 的常规 reorder 计划在两秒内完成并只产生一个属性 patch。rank 拥挤时会对完整同级序列重编号，并保留目标顺序；单个属性 patch 的要求只适用于存在安全 rank 空隙的情况。反向引用 benchmark 对 quick 20,000/large 100,000 个来源建索引，并验证 1,000 个增量移除；不完整节点扫描对 quick 20,000/large 100,000 个条目验证近线性计划与完整计数。刷新调度器测试把 10,000 次请求合并为一次 batch。节点图谱 benchmark 在单一确定性串行 worker 中，用 quick 20,000/large 100,000 节点 fixture 构建真实生产 GraphIndex，然后在一次增量刷新中处理 32/128 个互不嵌套的 dirty roots。Quick 的首次构建和增量刷新门槛均为 2 秒，对应 large 门槛均为 6 秒；搜索候选聚合与一次精确查询的 quick/large 门槛分别为 1 秒和 3 秒。同一刷新后快照再经完整展开、topology、VisibleScene 与 model 聚合进入 2D layout，其 quick/large 门槛分别为 4 秒和 6 秒；纯 3D layout 加一次 1920×1080 投影的门槛分别为 2 秒和 5 秒。这些确定性计算门可以暴露线性退化，但不能证明交互式 Canvas 帧率或宿主 UI 响应速度。独立的 GraphIndex 行为测试锁定一次初始盘点、path-targeted 子树刷新、同级顺序、仅链接失效和精确扫描计数。这些计数证明范围、搜索、展开、维度与“显示链接”不重复执行全 Vault 盘点。完整展开仍保持常量 DOM、保留全部可见结构边，只对链接边应用配置上限。Contents View 的 Nodes/Album/Files 各自每批最多创建 200 项；相册图片从 resource URI 绘制一次到 canvas，普通文件不读取 binary 正文。

## 隔离 Vault 主机验收

Explorer 展开/收起锚点使用独立的 `explorer-disclosure-anchor` 场景。验收 provider 的 `Prepare long-list disclosure diagnosis` 命令一次创建 120 个兄弟节点及中段的 498 子节点分支，并启动帧记录；初始短列表不能代替此场景。记录器直接跟踪被点击行，保存点击处理前的基线及至少 750 ms 的后续帧、滚动高度和上下边界余量。只有非空、完整且 `middleViewportEligible=true` 的记录才能用于中段锚点判断；空帧、丢行和滚动边界样本均不能记为中段通过。比较 `topRange` 和 `finalDelta`，边界回退与禁用插件后的原生行为另行记录。启用插件时，底部边界点击也须保持在一个 CSS 像素内；保留的空白随向上滚动回收，不得随向下滚动增长。

按改动影响选择精确候选的代表性验收；桌面交互、设置或生命周期变化覆盖相关真实宿主场景，移动交互或影响移动端的共享运行行为变化覆盖相关 Android 模拟器场景。纯文档或无宿主影响的逻辑改动可记录理由后免宿主。影响本次发布的已确认严重产品缺陷应阻塞对应发布；宿主或工具缺项保留未验范围，按风险判断是否延后，不自动阻塞所有发布，也不增加一律再次确认的步骤。只有实际观察通过的范围可声称已验收。完整宿主矩阵不是每次发布的前提，CI 不自动检查宿主覆盖。未执行、跳过或失败必须如实记录，也不得据此宣称对应宿主层已经通过。按受影响范围从以下场景选择，只在一次性隔离 Vault 验收插件加载、五个设置页、“跟随 Obsidian”/中英文、从单一可滚动页签行开始且不重复插件名或当前页签标题的设置层级、无需初始化即可出现的不完整节点、可取消的批量整理预览、严格只读 Health、两个统一的不管理规则组及其 `.`/`_` 名称开头默认值和自然语言规则行、主页命令/按钮/重启、置顶不可折叠 Root 行及其唯一的会话眼睛控制、保留 Obsidian 原生“新建笔记/新建文件夹”控件并增加“新建节点”、Explorer 图标前/后/隐藏与标题图标、属性图标和文件名开头字符之间有清晰 badge 区分、glyph/中文/emoji 字体回退、只列已安装字体的 Emoji 下拉框、复杂序列预览、不可用字体回退及手动重新检测、标题图标在不同字号下保持对齐且不进入 node 名称/光标/复制文本、主窗口与 popout 独立 Explorer、停用后 DOM/监听器/顺序完整恢复、canonical note 隐藏，以及行尾文字徽标使用紫色“隐藏”、灰色“不管理”、橙色“不完整”和红色“冲突”，继承隐藏只弱化并提示来源，hover/focus 主动作与右键菜单、状态 badge 不响应双击、disclosure arrow 与 folder title 的点击边界、Explorer 和 Contents 的结构移入与显式手动兄弟排序拖拽、文件夹/笔记原生菜单与明确的“所在节点”操作、Contents 三类菜单及 Shift+F10/Menu 键、单文件拖入 Node/header/breadcrumb、多选链接拖拽不发生部分移动、同名冲突与禁止后代放置、dragend/Escape 清理、选区右键预览/正文写入/遵循三种“新链接格式”和两种链接语法的来源链接替换、确认开启与关闭、表格单元格内 `\|` alias、跨单元格 fail closed、aliases 与 basename、命名说明卡片、`[[a]]` 与 `[[a|b]]` 在 aliases 开/关时的直接创建、显式路径与缺失祖先、修饰键 pane、popout document、冲突 rollback、忽略/豁免 fallthrough、原生创建/删除只改变实际存在的一侧且不自动补全或重建、叶子 Markdown 显式转换、不完整文件夹显式补全、设为不管理与纳入管理、真实冲突分类/修复、Visual Picker 的完整列表载入/增删排序/预设/双预览/继承/缺失图片回退/颜色修饰/非法值拒绝、无 visual 节点、静态相册、GIF 静态帧、视频 tile、紧凑音频/HEIC 文件、独立分页、窄侧栏、merge 冲突和遵循 Obsidian 设置的删除。必须确认不存在 `<video>`、`<audio>` 或 autoplay。自动化测试不能代替这些主机行为。

选择执行完整宿主验收时，同一 exact candidate 的节点图谱还应覆盖全局/子树/局部渐进默认、局部父级上下文且不扩出兄弟、多分支、普通/Alt/范围展开、收回一级、链接默认关闭与开启叠加、旧关系状态迁移、属性隐藏子树剪枝且没有独立纳入/排除设置、SearchComponent 展开/恢复、外部聚焦、节点菜单和 canonical-note 打开、2D/3D 共用选择、可读缩放、大图常量 DOM、无覆盖图谱的密度提示、窄窗口换行、Visual 回退、键盘控制和干净 close/disable。展开状态在当前会话内检查，并且 Obsidian 重启后必须恢复一级默认。

## 主题与可访问性

至少检查默认浅色、默认深色和一个第三方主题。键盘检查五个设置 tabs、Modal buttons、Contents cards/rows、More actions、context-menu keys、breadcrumb，以及节点图谱的 visual/主体/子级把手控件；拖拽必须有 menu move/reorder 等价操作，粗指针目标为 44px。中英文不得截断关键按钮和节点标题，“跟随 Obsidian”必须与 Obsidian 当前的界面语言一致，图片应有空装饰 alt 或文件名 alt，Root 行需检查单次幂等插入、无 disclosure control、键盘打开和选中状态；Explorer 与标题图标需在多种 UI 缩放下检查“不完整节点”“不管理”“冲突”badge 对比度、glyph/中文/emoji 字体回退、尺寸、纵横对齐和名称间距。节点图谱还要检查 Tooltip、可见焦点、明确 accessible name、虚线链接对比度、从左到右/从上到下把手旋转，以及工具栏换行时不遮挡图谱。

## Android 移动端验收

每个 `isDesktopOnly: false` 候选都必须保持 Android 兼容代码与 CSS，并有窄屏、粗指针和触控自动化覆盖。移动行为受影响时，代表性宿主回归使用当前 Android 15/API 35 模拟器和一次性 Vault，从以下清单选择相关场景：插件加载、File Explorer/Contents、原生移动、菜单、设置持久化、节点图谱范围/把手/搜索/2D/3D、窄屏、触控目标、文件删除设置和停用清理。Android 真机和 iOS 不在验收范围内。

## 正式部署

公开发布的硬门由 `npm run release:check`、精确版本/tag/commit 身份、Candidate Bundle 源码与运输验证、公共资产完整性、构建 provenance/attestation 及发布后远端字节回验组成；真实宿主验收保持独立证据层。正式 Vault 需要用户明确授权 exact path。部署前确认 Obsidian 未运行，保留 `data.json`，只替换 `main.js`、`manifest.json`、`styles.css`，并对候选和已部署文件计算 SHA-256。正式部署不等于验收；用户人工验收结论单独记录。
