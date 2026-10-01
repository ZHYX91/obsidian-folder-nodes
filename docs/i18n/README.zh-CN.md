# Folder Nodes

[English](https://github.com/ZHYX91/obsidian-folder-nodes/blob/main/README.md) · [简体中文](https://github.com/ZHYX91/obsidian-folder-nodes/blob/main/docs/i18n/README.zh-CN.md)

Folder Nodes 用文件夹组织可导航的节点。一个完整节点由文件夹和一个同名 Markdown 笔记组成，例如 `A/A.md`。如果只存在其中一边，插件会把它显示为**不完整**，不会悄悄替你创建或移动文件。

## 截图

### 节点内容

在一个侧栏里查看子节点、图片和视频、普通文件，以及明确设为“不管理”的边界。

![Folder Nodes 侧栏显示子节点、媒体和不管理文件](https://raw.githubusercontent.com/ZHYX91/obsidian-folder-nodes/main/docs/assets/folder-nodes-contents-en.png)

[相册图片来源与许可](../assets/PHOTO-CREDITS.md)。

### 文件列表

直接把 Obsidian 文件列表当作全局节点树使用。Folder Nodes 会增加置顶 Root 行、节点状态、可选图标和手动同级排序，但不会替换 Obsidian 原生文件/文件夹操作。

![Obsidian 文件列表显示 Root 眼睛与 Folder Nodes 状态标签](https://raw.githubusercontent.com/ZHYX91/obsidian-folder-nodes/main/docs/assets/folder-nodes-explorer-en.png)

### 节点图谱

可在全局、子树或局部范围查看层级结构，按需展开分支，并在 2D 和 3D 之间切换。

![Folder Nodes 图谱显示展开的 Projects 子树](https://raw.githubusercontent.com/ZHYX91/obsidian-folder-nodes/main/docs/assets/folder-nodes-graph-en.png)

### 图标与外观

节点图标可使用 Vault 图片、Lucide 图标、文字、Emoji 或颜色回退。设置页会直接预览属性图标与文件名中相同字符的区别。

![Folder Nodes 图标与外观设置](https://raw.githubusercontent.com/ZHYX91/obsidian-folder-nodes/main/docs/assets/folder-nodes-settings-icons-en.png)

### 可预测的 Node 创建

在创建前预览选中文字和未创建链接将如何变成节点名称、路径、正文和 aliases。

![Folder Nodes 选区与命名设置](https://raw.githubusercontent.com/ZHYX91/obsidian-folder-nodes/main/docs/assets/folder-nodes-creation-en.png)

## 功能特性

- **以文件夹为节点。** 可以创建、重命名、移动、合并、排序和删除完整 Folder Node，同时保留 Obsidian 原生“新建笔记”和“新建文件夹”。
- **明确显示不完整状态。** 文件夹缺少同名笔记，或 Markdown 笔记缺少匹配文件夹时，会一直显示为橙色**不完整**，直到你补全或设为“不管理”。
- **融入文件列表。** 点击完整节点的文件夹名称即可打开 Node Note。Root 旁的眼睛可在当前会话临时显示被 Folder Nodes 隐藏的节点。“名称”模式保留 Obsidian 原生排序；“手动”模式才使用 Folder Nodes 的显式 rank。
- **节点内容侧栏。** 子节点、静态媒体相册和普通文件分别分页显示。GIF 使用静态缩略图；视频和音频不提供内嵌播放控件。
- **节点图谱。** 层级结构始终存在；可选的“显示链接”只在结构图上叠加 Node Note 之间的链接，不改变层级布局。
- **从选中文字创建节点。** 使用“从选中文字创建 Folder Node”后，插件会创建子节点、把选中文字写入新笔记，并用链接替换原选区。单个 Markdown 表格单元格可以安全处理；跨单元格选区会在写入前停止。
- **从未创建链接直接创建节点。** 在受管理范围内点击 `[[a]]` 会创建 `a/a.md`。开启 aliases 后，`[[a|b]]` 还会把 `b` 写入 `aliases`。
- **节点图标。** 一个 Obsidian `icon` 文本/列表可以按顺序提供图片、Lucide、文字、Emoji 或 `color:` 候选，并可选择继承祖先图标。
- **隐藏子树。** 节点可写入 `hidden=true`。它只会从 Folder Nodes 管理的文件列表、节点内容和节点图谱中隐藏；Obsidian 搜索、快速切换、反向链接、原生图谱、链接和直接打开都不受影响。
- **不管理边界。** 可按精确路径或“名称开头”规则，让某些 Markdown 或整个文件夹子树不参与 Folder Nodes 结构管理，但内容仍正常可见。
- **先预览再维护。** 批量整理和旧属性迁移都会先显示将要发生的变化。遇到冲突或无法确认安全的输入时，插件会停止操作，不猜测处理。
- **只在本地工作。** Folder Nodes 不上传 Vault 内容，也不发起网络请求。

## 使用要求与兼容性

- Obsidian **1.12.7 或更高版本**。
- 支持桌面版和 Android 版 Obsidian。Android 使用菜单和原生移动文件夹，不使用 HTML5 拖放。
- Android 真机和 iOS 不属于本项目共享的宿主验收矩阵。
- 完整节点必须只有一个同名 Node Note；“不管理”规则定义 Folder Nodes 不执行结构操作的边界。

## 安装

### 社区插件

打开 **设置 → 第三方插件 → 浏览**，搜索 **Folder Nodes**，安装并启用。如果当前插件目录还没有上架，可使用下面的手动安装方式。

### 手动安装

下载同一版本的发布文件，将以下三个文件放入 `Vault/.obsidian/plugins/folder-nodes/`：

- `main.js`
- `manifest.json`
- `styles.css`

重新加载 Obsidian 并启用 Folder Nodes。不要混用不同版本的运行文件。

### 升级

如果存在 `Vault/.obsidian/plugins/folder-nodes/data.json`，请保留它。正常升级只替换上面的三个运行文件；只有明确想重置插件偏好和“不管理”规则时才删除 `data.json`。

## 使用

1. 先备份 Vault，然后查看 **设置 → Folder Nodes → 常规** 和 **管理**。
2. 在文件列表中检查橙色**不完整**项：需要管理的就补全，不希望 Folder Nodes 管理的就设为**不管理**。
3. 使用“新建节点”、节点右键菜单或命令面板创建和浏览 Folder Node。
4. 选中编辑器文字后，用“从选中文字创建 Folder Node”把它变成子节点。
5. 在受管理范围内点击 `[[a]]` 或 `[[a|b]]` 这类未创建内部链接，可直接创建完整 Folder Node。
6. 打开“节点内容”查看当前节点的子节点、媒体和文件。右键条目、点击“更多操作”或按 Shift+F10/菜单键都能打开同一组操作。
7. 打开“节点图谱”查看层级结构。全局范围查看整个 Vault，子树范围固定一个节点，局部范围还会显示它的父级作为上下文。可从节点把手展开分支、搜索节点、切换 2D/3D，并按需开启“显示链接”。
8. 桌面端把节点拖进另一个节点只会改变父级。只有目标父节点先切换到“手动”子节点排序后，才允许精确 before/after 排序。Android 请使用原生移动文件夹或 Folder Nodes 的“移动 / 上移 / 下移”。
9. 如果只想操作当前文件或文件夹，使用 Obsidian 原生操作。只有明确要操作整个 Folder Node 时，才使用标签页中标明“所在节点”的操作。

## 设置

- **常规**：界面语言、隐藏标记行为、可选 Root 主页。
- **管理**：不管理 Markdown / 文件夹规则、批量整理、属性迁移和只读健康检查。
- **图标与外观**：图标继承、文件列表位置、笔记标题图标和 Emoji 字体。
- **选区与命名**：aliases，以及可选的前缀/后缀来源和时间戳格式。
- **节点图谱**：是否启用、默认维度、2D 方向和大图阈值。

**跟随 Obsidian** 当前会在 Obsidian 使用中文界面时显示简体中文，其他语言则显示 English。手动选择 English 或简体中文可以覆盖这个回退规则，但不会改变文件名或 Markdown 属性。

## Folder Nodes 属性

Folder Nodes 只用一个名为 `folder-nodes` 的扁平 Obsidian 文本列表保存结构选项。默认值不写入；没有任何 token 时会删除整个属性。

```yaml
folder-nodes:
  - order=manual
  - rank=1024
  - hidden=true
```

- `order=manual`：让该父节点使用手动子节点排序。
- `rank=N`：保存某个子节点在手动排序中的稀疏位置。
- `hidden=true`：从 Folder Nodes 的三个投影中隐藏该节点及其受管理后代。

已经公开的旧字段 `folderNodeChildrenSort`、`folderNodeSiblingRank`、`folderNodeHidden` 会继续兼容读取。使用 **管理 → 迁移 Folder Nodes 属性** 可以先查看准确受影响的笔记。迁移前请先更新所有设备上的 Folder Nodes；插件启动时不会自动迁移笔记属性。

## icon 属性

`icon` 可以是一个字符串，也可以是扁平字符串列表：

```yaml
icon:
  - "[[Assets/project.svg]]"
  - "lucide:folder-tree"
  - 文
  - "color:#7c3aed"
```

Folder Nodes 会按顺序尝试基础候选。图片缺失时继续尝试下一项。第一个有效 `color:` 会为文字或 Lucide 图标着色；对于 Emoji 和图片，只有所有基础候选都无法显示时才把颜色作为回退色标。

图标选择器会载入当前列表，可添加、删除、排序、使用预设，并实时预览文件列表和节点内容。未知值或多字素值不能通过选择器保存。只有当前节点没有可用本地图标时才开始继承祖先。

## 限制

- 节点身份是当前规范化 Vault 路径，不是永久 ID。
- 不支持用 `README.md`、`index.md`、`_A.md` 等名称替代同名 Node Note。
- 合并遇到路径或 frontmatter 冲突时会停止，不提供复杂冲突合并界面。
- Android 不提供 HTML5 拖拽把手或放置目标。
- 节点图标不会抓取远程图片、随意重着色 inline SVG、生成 PDF/视频缩略图、预览 HEIC/HEIF，也不提供内嵌视频/音频播放。
- 节点内容不是第二棵完整 Vault 目录树，也不提供普通文件的事务式多文件移动。
- 超大图谱会切换到 Canvas 渲染；层级结构保持完整，只限制可选的链接叠加。

## 隐私与安全

Folder Nodes 只在本地运行，不发起网络请求。只有在结构检查、迁移预览、链接索引和节点图谱等明确功能需要时，才读取 Vault 路径、元数据和笔记文字。

用户操作可以创建、修改、移动、重命名、合并笔记和文件夹，或将其移入回收站。多步结构操作会串行执行；发现冲突时停止不安全写入；需要维护 Vault 时会先预览，并在提交前再次核对目标。完整节点删除使用 Obsidian 系统回收站。

插件只有在用户明确执行复制操作后才把生成的 Markdown 链接写入系统剪贴板，**从不读取剪贴板**。插件偏好和“不管理”规则保存在 `data.json`，结构 token 保存在 Node Note 中。

安全问题请按仓库的[安全策略](../../SECURITY.md)私下报告。

## 开发

使用 Node.js **24.19.0** 和 npm **11.17.0**。

```bash
npm ci
npm run check
npm run release:check
```

项目文档：

- [产品需求](../product-requirements.zh-CN.md)
- [交互规范](../ux-spec.zh-CN.md)
- [架构](../architecture.zh-CN.md)
- [测试策略](../testing-strategy.zh-CN.md)
- [变更记录](../../CHANGELOG.md)
- [贡献指南](../../CONTRIBUTING.md)

## 支持

- [Q&A](https://github.com/ZHYX91/obsidian-folder-nodes/discussions/categories/q-a)：使用和配置问题。
- [Ideas](https://github.com/ZHYX91/obsidian-folder-nodes/discussions/categories/ideas)：功能和工作流建议。
- [Show and tell](https://github.com/ZHYX91/obsidian-folder-nodes/discussions/categories/show-and-tell)：技巧和案例。
- [GitHub Issues](https://github.com/ZHYX91/obsidian-folder-nodes/issues/new/choose)：可复现 bug 和明确功能需求。

公开提交问题时，请提供 Folder Nodes 版本、Obsidian 版本、操作系统、合成目录结构和准确复现步骤，并删除真实 Vault 路径和笔记内容。

## 许可证

[MIT](../../LICENSE) © ZhengYX
