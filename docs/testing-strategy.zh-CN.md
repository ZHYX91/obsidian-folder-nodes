---
source_language: zh-CN
translation_status: source
---

# Folder Nodes — 测试策略

## 自动化门禁

`npm run check` 固定 Node/npm 版本，执行 lint、格式、双语文档契约、严格 TypeScript、覆盖率、生产 bundle 与发布布局检查。Core、Settings 和关键结构适配层的覆盖率门禁为 statements 80%、lines 80%、functions 75%、branches 70%。测试覆盖路径与 Windows 保留名/字素安全截断、选区命名、表格单元格 alias 安全转义、跨单元格拒绝、未解析链接目标与显示 alias 规划、Visual、frontmatter 非法边界、批量整理中的非 Markdown 碰撞、指定路径/名称开头不管理规则、系统目录保护、设置深层规范化、固定 Emoji 字体候选校验与回退栈、属性契约、稀疏排序和增量反向引用。NodeService 使用内存 Vault/FileManager 进行行为测试，覆盖串行 create、显式路径 Node 的事务创建与 rollback、link-safe rename/move、原生跨父级移动后的目标 rank 调和、仅移动/删除节点笔记、文件夹与 canonical note 同步重命名、文件夹侧与 Markdown 侧的不完整节点、无需初始化的持续分类、忽略子树移入、批量整理 TOCTOU、commit 后验证、merge 冲突、各类 rollback 及 in-flight 写入后的 lifecycle abort。同步与异步扫描器必须产生等价计划，取消不能写入。VaultOperationCoordinator 单测锁定失败后继续串行、递归事件归属和 TTL。UI/运行时测试锁定 Explorer surface start/stop 清理、移动端不声明 draggable、保留原生创建控件和新增节点控件、不完整/不管理/冲突状态、标题图标位于可编辑标题之外、标题图标测量对齐、不同 visual 类型的字体 class、本机 Emoji 字体探测失败、跨 document 运行时字体更新、disclosure selector、before/into/after zone、drag payload、Shift+F10/Menu 键和设置层级/说明卡片；源码架构契约禁止全局 body observer、`vault.rename` 和 Contents 全量 `resolvedLinks` 扫描。

回归测试还会注入 closed file 同期编辑、未保存的 open editor、同路径 TFile replacement，以及 rollback 期间的同路径 folder replacement。设置保存测试通过延迟和拒绝较早的持久化调用，证明快照隔离、顺序和 queued latest state 的恢复。

## 性能

Quick 门槛验证 10,000 个、large 门槛验证 100,000 个直接 Child Nodes 的常规 reorder 计划在两秒内完成并只产生一个属性 patch。拥挤 rank 的局部 rebalance 不超过 64 个节点。反向引用 benchmark 对 quick 20,000/large 100,000 个来源建索引，并验证 1,000 个增量移除；不完整节点扫描对 quick 20,000/large 100,000 个条目验证近线性计划与完整计数。刷新调度器测试把 10,000 次请求合并为一次 batch。Contents View 的 Nodes/Album/Files 各自每批最多创建 200 项；相册图片从 resource URI 绘制一次到 canvas，普通文件不读取 binary 正文。

## 隔离 Vault 主机验收

只在一次性隔离 Vault 验收插件加载、四个设置页、“跟随 Obsidian”/中英文、从单一可滚动页签行开始且不重复插件名或当前页签标题的设置层级、无需初始化即可出现的不完整节点、可取消的批量整理预览、严格只读 Health、两个统一的不管理规则组及其 `.`/`_` 名称开头默认值和自然语言规则行、主页命令/按钮/重启、置顶不可折叠 Root 行、保留 Obsidian 原生“新建笔记/新建文件夹”控件并增加“新建节点”、Explorer 图标前/后/隐藏与标题图标、属性图标和文件名开头字符之间有清晰 badge 区分、glyph/中文/emoji 字体回退、只列已安装字体的 Emoji 下拉框、复杂序列预览、不可用字体回退及手动重新检测、标题图标在不同字号下保持对齐且不进入 node 名称/光标/复制文本、主窗口与 popout 独立 Explorer、停用后 DOM/监听器/顺序完整恢复、canonical note 隐藏、文件夹侧与 Markdown 侧均显示中性的“不完整节点”、不管理项显示灰色“不管理”、真正冲突显示警告、hover/focus 主动作与右键菜单、状态 badge 不响应双击、disclosure arrow 与 folder title 的点击边界、Explorer 和 Contents 的 before/into/after Node 拖拽、文件夹/笔记原生菜单与明确的“所在节点”操作、Contents 三类菜单及 Shift+F10/Menu 键、单文件拖入 Node/header/breadcrumb、多选链接拖拽不发生部分移动、同名冲突与禁止后代放置、dragend/Escape 清理、选区右键预览/正文写入/来源 WikiLink 替换、表格单元格内 `\|` alias、跨单元格 fail closed、aliases 与 basename、命名说明卡片、`[[a]]` 与 `[[a|b]]` 在 aliases 开/关时的直接创建、显式路径与缺失祖先、修饰键 pane、popout document、冲突 rollback、忽略/豁免 fallthrough、原生创建/删除只改变实际存在的一侧且不自动补全或重建、叶子 Markdown 显式转换、不完整文件夹显式补全、设为不管理与纳入管理、真实冲突分类/修复、Visual Picker 的完整列表载入/增删排序/预设/双预览/继承/缺失图片回退/颜色修饰/非法值拒绝、无 visual 节点、静态相册、GIF 静态帧、视频 tile、紧凑音频/HEIC 文件、独立分页、窄侧栏、merge 冲突和系统回收站删除。必须确认不存在 `<video>`、`<audio>` 或 autoplay。自动化测试不能代替这些主机行为。

## 主题与可访问性

至少检查默认浅色、默认深色和一个第三方主题。键盘检查四个设置 tabs、Modal buttons、Contents cards/rows、More actions、context-menu keys 和 breadcrumb；拖拽必须有 menu move/reorder 等价操作，粗指针目标为 44px。中英文不得截断关键按钮和节点标题，“跟随 Obsidian”必须与 Obsidian 当前的界面语言一致，图片应有空装饰 alt 或文件名 alt，Root 行需检查单次幂等插入、无 disclosure control、键盘打开和选中状态；Explorer 与标题图标需在多种 UI 缩放下检查“不完整节点”“不管理”“冲突”badge 对比度、glyph/中文/emoji 字体回退、尺寸、纵横对齐和名称间距。

## Android 移动端验收

每个 `isDesktopOnly: false` 候选必须在当前 Android 15/API 35 模拟器和一次性 Vault 上单独验收：插件加载、File Explorer/Contents 装饰与打开、原生移动文件夹、Move/Move up/Move down、跨父级手动排序 rank、创建/补全/不管理、菜单、选区创建、设置与重启持久化、窄屏布局、触摸目标、系统回收站和停用清理。断言 Explorer 与 Contents 均没有 Folder Nodes 自有 `draggable`、drag handle 或 drop marker。模拟器证据不等于真机或 iOS；重大触摸、输入、存储或平台边界变化时另存真机证据，iOS 在本流程中为范围外。

## 正式部署

正式 Vault 需要用户明确授权 exact path。部署前确认 Obsidian 未运行，保留 `data.json`，只替换 `main.js`、`manifest.json`、`styles.css`，并对候选和已部署文件计算 SHA-256。正式部署不等于验收；用户人工验收结论单独记录。
