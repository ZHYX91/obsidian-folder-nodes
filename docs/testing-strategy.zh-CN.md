---
source_language: zh-CN
translation_status: source
---

# Folder Nodes 测试策略

## 自动化门禁

`npm run check` 固定 Node/npm 版本，执行 lint、格式、双语文档契约、严格 TypeScript、覆盖率、生产 bundle 与发布布局检查。Core、Settings 和关键结构适配层的覆盖率门禁为 statements 80%、lines 80%、functions 75%、branches 70%。测试覆盖路径与 Windows 保留名/字素安全截断、选区命名、未解析链接目标与显示 alias 规划、Visual、frontmatter 非法边界、迁移非 Markdown 碰撞、指定路径/名称前缀不管理规则、系统目录保护、设置深层规范化、属性契约、稀疏排序和增量反向引用。NodeService 使用内存 Vault/FileManager 进行行为测试，覆盖串行 create、显式路径 Node 的事务创建与 rollback、link-safe rename/move、相对 placement、Root 保护、启动修复、外部事件调和、忽略子树移入、migration TOCTOU、commit 后验证、merge 冲突、各类 rollback 及 in-flight 写入后的 lifecycle abort；adoption-state 测试注入首次持久化失败并证明迁移不会启动。VaultOperationCoordinator 单测锁定失败后继续串行、递归事件归属和 TTL。UI/运行时测试锁定 Explorer surface start/stop 清理、标题图标位于可编辑标题之外、disclosure selector、before/into/after zone、drag payload、Shift+F10/Menu 键和设置说明卡片；源码架构契约禁止全局 body observer、`vault.rename` 和 Contents 全量 `resolvedLinks` 扫描。

回归测试还会注入 closed file 同期编辑、未保存的 open editor、同路径 TFile replacement，以及 rollback 期间的同路径 folder replacement。设置保存测试通过延迟和拒绝较早的持久化调用，证明快照隔离、顺序和 queued latest state 的恢复。

## 性能

Quick 门槛验证 10,000 个、large 门槛验证 100,000 个直接 Child Nodes 的常规 reorder 计划在两秒内完成并只产生一个属性 patch。拥挤 rank 的局部 rebalance 不超过 64 个节点。反向引用 benchmark 对 quick 20,000/large 100,000 个来源建索引，并验证 1,000 个增量移除；刷新调度器测试把 10,000 次请求合并为一次 batch。Contents View 的 Nodes/Album/Files 各自每批最多创建 200 项；相册图片从 resource URI 绘制一次到 canvas，普通文件不读取 binary 正文。

## 隔离 Vault 主机验收

只在一次性隔离 Vault 验收插件加载、四个设置页、“跟随 Obsidian”/中英文、初始化状态提示、详细维护预览、严格只读 Health、两个统一的不管理规则组及其 `.`/`_` 默认值、主页命令/按钮/重启、置顶不可折叠 Root 行、Explorer 图标前/后/隐藏与标题图标、标题图标不进入 node 名称/光标/复制文本、主窗口与 popout 独立 Explorer、停用后 DOM/监听器/顺序完整恢复、canonical note 隐藏和单独删除后的安全重建、启动时完整修复、disclosure arrow 与 folder title 的点击边界、Explorer 和 Contents 的 before/into/after Node 拖拽、Contents 三类菜单及 Shift+F10/Menu 键、单文件拖入 Node/header/breadcrumb、多选链接拖拽不发生部分移动、同名冲突与禁止后代放置、dragend/Escape 清理、选区右键预览/正文写入/来源 WikiLink 替换、aliases 与 basename、命名说明卡片、`[[a]]` 与 `[[a|b]]` 在 aliases 开/关时的直接创建、显式路径与缺失祖先、修饰键 pane、popout document、冲突 rollback、忽略/豁免 fallthrough、创建后事件调和兜底、异常节点分类/修复、Visual Picker 的完整列表载入/增删排序/预设/双预览/继承/缺失图片回退/颜色修饰/未知保留、无 visual 节点、静态相册、GIF 静态帧、视频 tile、紧凑音频/HEIC 文件、独立分页、窄侧栏、merge 冲突和系统回收站删除。必须确认不存在 `<video>`、`<audio>` 或 autoplay。自动化测试不能代替这些主机行为。

## 主题与可访问性

至少检查默认浅色、默认深色和一个第三方主题。键盘检查四个设置 tabs、Modal buttons、Contents cards/rows、More actions、context-menu keys 和 breadcrumb；拖拽必须有 menu move/reorder 等价操作，粗指针目标为 44px。中英文不得截断关键按钮和节点标题，“跟随 Obsidian”必须与 Obsidian 当前的界面语言一致，图片应有空装饰 alt 或文件名 alt，Root 行需检查单次幂等插入、无 disclosure control、键盘打开、选中状态和缺失笔记样式；Explorer 图标需检查尺寸、水平基线和名称间距。

## 正式部署

正式 Vault 需要用户明确授权 exact path。部署前确认 Obsidian 未运行，保留 `data.json`，只替换 `main.js`、`manifest.json`、`styles.css`，并对候选和已部署文件计算 SHA-256。正式部署不等于验收；用户人工验收结论单独记录。
