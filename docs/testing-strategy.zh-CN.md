---
source_language: zh-CN
translation_status: source
---

# Folder Nodes 测试策略

## 自动化门禁

`npm run check` 固定 Node/npm 版本，执行 lint、格式、双语文档契约、严格 TypeScript、覆盖率、生产 bundle 与发布布局检查。Core/Settings 覆盖率门禁为 statements 80%、lines 80%、functions 75%、branches 70%。测试覆盖路径、选区命名、模板、Visual parsing、frontmatter patch、迁移冲突、属性契约和稀疏排序。

## 性能

10,000 个直接 Child Nodes 的常规 reorder 计划必须在两秒内完成并只产生一个属性 patch。拥挤 rank 的局部 rebalance 不超过 64 个节点。Contents View 每批最多创建 200 个 Node cards 和 200 个 file cards，不读取 binary 正文。

## 隔离 Vault 主机验收

只在一次性隔离 Vault 验收插件加载、两个设置分类、Auto/中英文、迁移预览、初始化、Explorer 打开、canonical note 隐藏、before/into/after 拖拽、选区右键预览、aliases 与 basename、模板 token、Visual Picker/继承、Node cards、图片图墙、窄侧栏、merge 冲突、Health 和系统回收站删除。自动化测试不能代替这些主机行为。

## 主题与可访问性

至少检查默认浅色、默认深色和一个第三方主题。键盘检查设置 tabs、Modal buttons、Contents cards 和 breadcrumb；粗指针目标为 44px。中英文不得截断关键按钮，Auto 必须与 Obsidian 当前语言一致，图片应有空装饰 alt 或文件名 alt。

## 正式部署

正式 Vault 需要用户明确授权 exact path。部署前确认 Obsidian 未运行，保留 `data.json`，只替换 `main.js`、`manifest.json`、`styles.css`，并对候选和已部署文件计算 SHA-256。正式部署不等于验收；用户人工验收结论单独记录。
