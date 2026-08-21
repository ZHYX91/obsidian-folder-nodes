---
source_language: zh-CN
translation_status: source
---

# Folder Nodes 测试策略

## 自动化门禁

`npm run check` 固定 Node/npm 版本，执行 lint、格式、双语文档契约、严格 TypeScript、覆盖率、生产 bundle 与发布布局检查。Core/Settings 覆盖率门禁为 statements 80%、lines 80%、functions 75%、branches 70%。测试覆盖路径、选区命名、Visual parsing、frontmatter patch、迁移冲突、指定路径/名称前缀不管理规则、系统目录保护、设置规范化、属性契约和稀疏排序。UI 纯逻辑测试另行锁定当前与旧版 Explorer disclosure selector、before/into/after zone、内部 drag payload 拒绝和 Shift+F10/Menu 键识别。

## 性能

10,000 个直接 Child Nodes 的常规 reorder 计划必须在两秒内完成并只产生一个属性 patch。拥挤 rank 的局部 rebalance 不超过 64 个节点。Contents View 每个 section 每批最多创建 200 项；相册图片从 resource URI 绘制一次到 canvas，普通文件不读取 binary 正文。

## 隔离 Vault 主机验收

只在一次性隔离 Vault 验收插件加载、四个设置页、“跟随 Obsidian”/中英文、初始化状态提示、详细维护预览、严格只读 Health、两个统一的不管理规则组及其 `.`/`_` 默认值、主页命令/按钮/重启、置顶不可折叠 Root 行、Explorer 图标前/后/隐藏与标题图标、canonical note 隐藏、disclosure arrow 与 folder title 的点击边界、Explorer 和 Contents 的 before/into/after Node 拖拽、Contents 三类菜单及 Shift+F10/Menu 键、文件拖入 Node/header/breadcrumb、同名冲突与禁止后代放置、dragend/Escape 清理、选区右键预览、aliases 与 basename、异常节点分类/修复、Visual Picker/继承、无 visual 节点、静态相册、GIF 静态帧、视频 tile、紧凑音频/HEIC 文件、窄侧栏、merge 冲突和系统回收站删除。必须确认不存在 `<video>`、`<audio>` 或 autoplay。自动化测试不能代替这些主机行为。

## 主题与可访问性

至少检查默认浅色、默认深色和一个第三方主题。键盘检查四个设置 tabs、Modal buttons、Contents cards/rows、More actions、context-menu keys 和 breadcrumb；拖拽必须有 menu move/reorder 等价操作，粗指针目标为 44px。中英文不得截断关键按钮和节点标题，“跟随 Obsidian”必须与 Obsidian 当前的界面语言一致，图片应有空装饰 alt 或文件名 alt，Root 行需检查单次幂等插入、无 disclosure control、键盘打开、选中状态和缺失笔记样式；Explorer 图标需检查尺寸、水平基线和名称间距。

## 正式部署

正式 Vault 需要用户明确授权 exact path。部署前确认 Obsidian 未运行，保留 `data.json`，只替换 `main.js`、`manifest.json`、`styles.css`，并对候选和已部署文件计算 SHA-256。正式部署不等于验收；用户人工验收结论单独记录。
