# Folder Nodes

[English](https://github.com/ZHYX91/obsidian-folder-nodes/blob/main/README.md) · [简体中文](https://github.com/ZHYX91/obsidian-folder-nodes/blob/main/docs/i18n/README.zh-CN.md)

Folder Nodes 将受管 Obsidian Vault 中的每个文件夹转换为一个结构节点，其 canonical Node Note 与文件夹同名：`A/A.md`。

## 功能特性

- 创建、重命名、移动、合并、排序和安全删除完整 Folder Node。
- 通过命令面板或编辑器右键菜单从选中文字创建子节点，预览准确的 `A/A.md`、alias 和 WikiLink，并配置文件名前缀、后缀、连接符和时间戳。
- 使用内置 Node Note 模板，支持 `{{name}}`、`{{path}}`、`{{parent}}` 和 `{{date}}`。
- 通过文件资源管理器浏览全局 Node Tree：点击文件夹名称打开 Node Note，展开箭头保持展开功能，隐藏重复的 canonical note，并将节点拖到另一个节点之前、之内或之后。
- 在响应式侧栏中分开浏览“节点”“静态相册”和紧凑“文件”，每批最多 200 项。所有条目都有右键菜单和键盘菜单入口；子节点支持 before/into/after 放置，普通文件只允许移入节点或面包屑目录。GIF 只显示静态缩略图，视频和音频没有侧栏内播放控件。
- 将一个 `icon` 属性解析为 Emoji、Lucide、Vault 图片或 CSS 颜色，支持继承、文件列表名称前/后/隐藏位置以及可选的笔记标题显示。
- 可将根节点笔记作为主页，通过命令或节点内容视图打开，并可选择在 Vault 启动后打开。
- 初始化和迁移共用一份精确路径预览；冲突阻止提交，健康检查严格只读。
- 分别支持精确叶子笔记豁免和不管理的文件夹子树，豁免不隐藏内容；根目录 `AGENTS.md` 和 `CLAUDE.md` 默认允许。
- 自然名称排序不写元数据；手动排序使用父节点模式和子节点自己的稀疏 rank，适用于大目录。
- 界面语言默认自动跟随 Obsidian，也可手动选择 English 或简体中文。
- 全部处理保持本地，不写永久节点 ID、`_pkwf`、manifest、path、parent 或完整子节点列表。

## 使用要求与兼容性

- Obsidian 1.12.7 或更高版本。
- 0.3.0 暂定仅桌面端，直到文件资源管理器适配器和拖拽放置完成有日期的主机验收。
- 受管模型要求每个受管文件夹有且仅有一个同名 Node Note，每个未豁免 Markdown 文档都成为 Folder Node；叶子笔记和文件夹子树豁免是明确边界。

## 安装

### 社区插件

社区目录批准后，打开 **设置 → 第三方插件 → 浏览**，搜索 **Folder Nodes**，安装并启用。

### 手动安装

下载同一版本的发布文件，将 `main.js`、`manifest.json` 和 `styles.css` 放入 `Vault/.obsidian/plugins/folder-nodes/`。重新加载 Obsidian，然后在第三方插件中启用 Folder Nodes。不要混用不同版本的运行文件。

### 升级

已有 `Vault/.obsidian/plugins/folder-nodes/data.json` 时必须保留。只替换 `main.js`、`manifest.json` 和 `styles.css`；只有明确需要重置插件偏好和接管状态时才删除 `data.json`。

## 使用

1. 先备份 Vault，再打开 **设置 → Folder Nodes → 常规**。
2. 打开“初始化与维护”，检查每一个创建、移动、跳过和冲突路径，再显式应用。同一流程适用于空 Vault、已结构化 Vault 和普通 Vault。
3. 使用文件资源管理器、Ribbon、节点右键菜单或命令面板创建和浏览节点。
4. 选中编辑器文字，从右键菜单或命令面板选择“从选中文字创建 Folder Node”，确认名称、alias 和 WikiLink 预览后创建。
5. 打开“节点内容”查看子节点、静态图片/视频相册和紧凑普通文件。右键条目、使用“更多操作”按钮或按 Shift+F10 都可打开同一个菜单。
6. 将 Folder Node 拖到另一个节点之前、之内或之后完成排序或更换父节点；将相册或文件条目拖入子节点、当前节点标题或面包屑可移动文件。写入前会显示目标位置标记。

## 设置

- **常规**：界面语言、默认 Node Note 模板、预览优先的维护、只读健康检查、允许的叶子笔记和不管理的文件夹。
- **主页**：是否把根节点笔记作为主页，以及是否在启动后打开。
- **图标与外观**：图标继承、文件列表中的位置和笔记标题显示。尺寸与对齐跟随 Obsidian，不提供任意大小设置。
- **选区与命名**：aliases 开关、前缀和后缀来源、独立连接符、自定义文字、时间戳格式及文件名实时预览。
- 选择 **跟随 Obsidian** 时使用 Obsidian 当前的界面语言；手动选择 English 或简体中文只覆盖插件界面，不改变文件名或 Markdown 属性。
- 命名来源包括当前文件、当前 Folder Node、最近的当前标题、时间戳和自定义文字。前后缀只影响 basename；`aliases` 只包含选中的可见文字。

## 限制

- 结构身份是当前规范化 Vault 路径，不是永久 ID。外部删除后再创建不会被猜测为重命名。
- 文件资源管理器集成属于主机兼容边界，因此当前版本仅支持桌面端。
- 节点视觉支持 Vault 图片，但不抓取远程图片、不做 inline SVG 重着色、不生成 PDF 首页或视频帧、不预览 HEIC/HEIF、不播放 GIF、视频或音频。
- Contents View 可将单个普通文件移入当前显示的节点或面包屑目录，但不提供普通文件独立排序、多选、跨视图放置，也不是第二棵完整 Vault 目录树。
- 合并遇到路径或 frontmatter 冲突会失败关闭，不提供复杂的冲突合并界面。
- 不支持 `README.md`、`index.md`、`_A.md` 等替代 canonical note 名称或任意属性继承。不管理的文件夹是完整子树豁免，不是部分受管节点。

## 隐私与安全

Folder Nodes 只在本地运行，不发起网络请求。迁移始终先预览，路径冲突阻止提交，歧义操作失败关闭，完整节点删除使用 Obsidian 的系统回收站路径。设置保存在插件 `data.json`，结构事实保留在 Vault；节点内容、路径、视觉和诊断都不会上传。

## 开发

使用 Node.js 24.18.0 和 npm 11.16.0。

```bash
npm ci
npm run check
npm run release:check
```

稳定项目文档：

- [产品需求](../product-requirements.zh-CN.md)
- [交互规范](../ux-spec.zh-CN.md)
- [架构](../architecture.zh-CN.md)
- [测试策略](../testing-strategy.zh-CN.md)
- [发布流程](../release.zh-CN.md)
- [变更记录](../../CHANGELOG.md)
- [贡献指南](../../CONTRIBUTING.md)
- [安全策略](../../SECURITY.md)

## 支持

通过 [GitHub Issues](https://github.com/ZHYX91/obsidian-folder-nodes/issues) 提交可复现问题和明确功能需求。请提供 Folder Nodes 版本、Obsidian 版本、操作系统、合成目录结构和准确操作，并在公开提交前删除真实 Vault 路径和笔记内容。安全漏洞请按[安全策略](../../SECURITY.md)私下报告。

## 许可证

[MIT](../../LICENSE) © ZhengYX
