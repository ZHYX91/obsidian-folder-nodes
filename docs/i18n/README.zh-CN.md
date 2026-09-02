# Folder Nodes

[English](https://github.com/ZHYX91/obsidian-folder-nodes/blob/main/README.md) · [简体中文](https://github.com/ZHYX91/obsidian-folder-nodes/blob/main/docs/i18n/README.zh-CN.md)

Folder Nodes 使用文件夹与同名 Node Note `A/A.md` 表示一个完整结构节点。受管理的文件夹或 Markdown 缺少对应侧时，会作为中性的“不完整节点”显示，直到用户补全或设为不管理。

## 截图

### 节点内容

在同一个侧栏中浏览子节点、视觉媒体、普通文件和明确的不管理边界。

![Folder Nodes 侧栏显示子节点、视觉媒体和不管理的文件](https://raw.githubusercontent.com/ZHYX91/obsidian-folder-nodes/main/docs/assets/folder-nodes-contents-en.png)

### 文件列表

在 Obsidian 熟悉的文件列表中浏览 Root 与嵌套 Folder Node。属性图标使用固定且无边框的图标位，属于文件名的开头字符仍保持普通文字。

![Obsidian 文件列表区分属性图标与节点名中的字符](https://raw.githubusercontent.com/ZHYX91/obsidian-folder-nodes/main/docs/assets/folder-nodes-explorer-en.png)

### 图标与外观

设置说明卡介绍图标来源，并直接比较 `icon: A`、`icon: 📓` 与文件名开头相同字符的显示差异。

### 节点笔记标题图标

可选标题图标在节点笔记标题前使用单独且对齐的图标位，不会进入可编辑的标题文字。

![Folder Nodes 属性文字图标在节点笔记标题前显示为独立图标位](https://raw.githubusercontent.com/ZHYX91/obsidian-folder-nodes/main/docs/assets/folder-nodes-title-icon-en.png)

### 可预测的 Node 创建

在调整命名选项前，先明确看到选中文字和未创建链接如何映射到 Node 路径、笔记正文与 aliases。

## 功能特性

- 创建、重命名、移动、合并、排序和安全删除完整 Folder Node。
- 在“新建节点”旁保留 Obsidian 原生“新建笔记”和“新建文件夹”。原生创建产生不完整的文件夹侧或 Markdown 侧，“新建节点”则原子创建完整配对；文件列表中的文件夹操作作用于整个文件夹，标签页中的移动、删除和合并只作用于 Node Note。重命名任一侧会同步已有的文件夹/Node Note 配对；Node Note 标签页还提供措辞明确的“所在节点”操作。
- 通过命令面板或编辑器右键菜单从选中文字创建子节点，预览准确的 `A/A.md`、alias 和 WikiLink，然后把选区写入新笔记正文并用该 WikiLink 替换来源选区。在单个 Markdown 表格单元格内会把 alias 分隔符写成 `\|`；跨单元格或跨行选区会安全停止且不写入。
- 在受管理范围内，点击未创建的内部链接即可直接创建完整 Node。`[[a]]` 创建 `a/a.md`；开启 aliases 后，`[[a|b]]` 还会把 `b` 写入 `aliases`。
- 通过文件列表浏览全局 Node Tree：使用置顶且不可折叠的根节点行，以及旁边的眼睛按钮在当前会话显示或隐藏由属性隐藏的子树；点击普通文件夹名称打开 Node Note，其展开箭头仍只负责展开；隐藏重复 canonical note。桌面端支持 before/into/after 拖放；Android 使用 Obsidian 原生移动文件夹和 Folder Nodes 的“移动”“上移”“下移”。
- 在响应式侧栏中分别按每批 200 项浏览“节点”“静态相册”和紧凑“文件”。所有条目都有菜单入口；桌面端支持子节点和单文件拖放，Android 使用等价的移动/排序菜单。多选可插入或复制链接。GIF 只显示静态缩略图，视频和音频没有侧栏内播放控件。
- 在同一个渐进展开的节点图谱工作区视图中探索 Folder Node。结构始终是层级骨架；“显示链接”是默认关闭的独立开关，只叠加已解析 canonical-note 链接而不移动节点。图谱支持易读的从左到右 2D（也可从上到下）、分层 3D、全局/子树/局部范围、逐分支展开把手、范围展开、原生搜索、聚焦与适应视图，不用遮挡图谱的状态浮层。
- 将一个 Obsidian 原生 `icon` Text/List 解析为有序 Vault 图片、Lucide 或单字素候选及可选 `color:` 值，支持本地回退、祖先继承、文件列表名称前/后/隐藏位置，以及位于可编辑标题文字之外的可选笔记标题图标。属性图标统一放入固定且无边框的图标位，通过文字的字重、大小和颜色与文件名自身的开头字符区分；Emoji 使用所选本机彩色字体或系统样式并保留原色。
- 可将根节点笔记作为主页，通过命令或节点内容视图打开，并可选择在 Vault 启动后打开。
- 无需初始化即可立即识别完整与不完整节点；“管理”提供预览优先的批量整理、显式旧属性迁移，以及同时检查结构、Folder Nodes 属性和 icon 声明的严格只读健康检查。
- 文件夹侧和 Markdown 侧缺失时都显示中性的“不完整节点”，并提供补全与“设为不管理”；真正的配对冲突继续使用警告状态并失败关闭。
- 使用两个统一的不管理规则组且不隐藏内容：不管理的 Markdown 文件和不管理的文件夹。两组都支持指定路径与自然语言的名称开头规则；`.`、`_` 是默认规则。当前 Vault 配置目录、`.git`、`.trash` 始终受保护，根目录 `AGENTS.md` 和 `CLAUDE.md` 默认是不管理的 Markdown 路径。
- 用一个简洁 Node Note 属性保存 Folder Nodes 行为：`folder-nodes` 是 Text List，只包含 `order=manual`、`rank=1024`、`hidden=true` 这类非默认 token。隐藏节点会从文件列表、节点内容和 Folder Nodes 节点图谱中连同完整子树一起移除；Obsidian 搜索、快速切换、反向链接、原生图谱、链接与直接打开均不受影响。“常规”可以在不删除标记的情况下忽略全部隐藏标记；Root 行眼睛或命令面板可在当前会话临时显示它们。
- 自然名称排序不写元数据；手动排序使用父节点模式和子节点自己的稀疏 rank，适用于大目录。
- 界面语言默认自动跟随 Obsidian，也可手动选择 English 或简体中文。
- 全部处理保持本地，不写永久节点 ID、`_pkwf`、manifest、path、parent 或完整子节点列表。

## 使用要求与兼容性

- Obsidian 1.12.7 或更高版本。
- 支持桌面版与 Android 版 Obsidian。节点图谱保持窄屏、粗指针与触控兼容控件；Android 发布验收使用当前模拟器，Android 真机和 iOS 不在范围内。
- 完整结构节点仍要求恰好一个同名 Node Note。受管理的文件夹或 Markdown 缺少对应侧时是不完整节点；不管理规则是插件结构操作的明确边界。

## 安装

### 社区插件

打开 **设置 → 第三方插件 → 浏览**，搜索 **Folder Nodes**，安装并启用。如果当前目录中尚未显示，请按下文手动安装。

### 手动安装

下载同一版本的发布文件，将 `main.js`、`manifest.json` 和 `styles.css` 放入 `Vault/.obsidian/plugins/folder-nodes/`。重新加载 Obsidian，然后在第三方插件中启用 Folder Nodes。不要混用不同版本的运行文件。

### 升级

已有 `Vault/.obsidian/plugins/folder-nodes/data.json` 时必须保留。只替换 `main.js`、`manifest.json` 和 `styles.css`；只有明确需要重置插件偏好和不管理规则时才删除 `data.json`。

## 使用

1. 先备份 Vault，再打开 **设置 → Folder Nodes → 常规**。
2. 在文件列表检查“不完整节点”和“不管理”标签；可逐项补全，也可打开“批量整理不完整节点”查看可选的精确路径批量预览。
3. 使用文件列表、节点右键菜单或命令面板创建和浏览节点。Root 旁边的眼睛只切换本次会话中的隐藏子树，不编辑 YAML。
4. 选中编辑器文字，从右键菜单或命令面板选择“从选中文字创建 Folder Node”，确认名称、alias 和 WikiLink 预览后创建。
5. 在受管理范围内点击未创建的 `[[a]]` 或 `[[a|b]]` 链接，直接创建并打开完整 Folder Node。
6. 打开“节点内容”查看子节点、静态图片/视频相册和紧凑普通文件。右键条目、使用“更多操作”按钮或按 Shift+F10 都可打开同一个菜单。
7. 从节点内容、命令面板或 Folder Node/Node Note 右键菜单打开“节点图谱”。全局默认显示 Root 与直接子级；子树默认显示选中节点与直接子级；局部额外显示一个父级作为上下文，并且只允许从选中节点继续向下展开。点击右侧把手显示直接子级，Alt+点击展开整支，或通过范围菜单展开 1/2/3 层、全部展开、收回一级。点击卡片主体选择，双击或按 Enter 打开 canonical Node Note；搜索会展开隐藏祖先并居中，清除后恢复搜索前的展开状态。在局部范围中，开启“显示链接”才加入直接已解析链接邻居；全局和子树保持当前结构节点集合，只叠加端点已经可见的链接。
8. 桌面端可将 Folder Node 拖到另一个节点之前、之内或之后，也可把一个相册/文件条目拖入节点或面包屑；Android 使用 Obsidian 原生移动文件夹，或 Folder Nodes 的“移动”“上移”“下移”菜单动作。
9. 要操作当前文件或文件夹时使用 Obsidian 原生菜单；只有明确要处理整个子树时，才在 Node Note 标签页选择“移动/删除/合并所在节点”。

## 设置

- **常规**：界面语言、是否应用隐藏标记，以及是否把根节点笔记作为主页并在启动后打开。
- **管理**：“不管理的 Markdown 文件/不管理的文件夹”两个统一规则组、预览优先批量整理、显式属性迁移和只读健康检查。
- **图标与外观**：图标继承、文件列表中的位置和笔记标题显示；对比卡片直接展示属性图标与文件名开头相同字符的区别。尺寸与对齐跟随 Obsidian，不提供任意大小设置。
- **选区与命名**：说明两种 Node 创建方式，并控制二者共用的 aliases 开关、前缀和后缀来源、独立连接符、自定义文字、时间戳格式及文件名实时预览。
- **节点图谱**：只保留总开关、默认维度、2D 布局方向和大图阈值。结构始终显示，新建图谱的“显示链接”默认关闭。这里刻意不再提供持久的纳入/排除规则；文件列表、节点内容与节点图谱统一由 `hidden=true` 子树标记控制。
- 选择 **跟随 Obsidian** 时使用 Obsidian 当前的界面语言；手动选择 English 或简体中文只覆盖插件界面，不改变文件名或 Markdown 属性。
- 命名来源包括当前文件、当前 Folder Node、最近的当前标题、时间戳和自定义文字。前后缀只影响 basename。开启 aliases 后，从选区创建时写入选中文字，从未创建的 `[[a|b]]` 链接创建时写入显示文字 `b`。

## Folder Nodes 属性

`folder-nodes` 是扁平的 Obsidian Text List。默认值不写入；没有 token 时删除整个属性。

```yaml
folder-nodes:
  - order=manual
  - rank=1024
  - hidden=true
```

已经公开的旧字段 `folderNodeChildrenSort`、`folderNodeSiblingRank`、`folderNodeHidden` 会继续兼容读取。使用 **管理 → 迁移 Folder Nodes 属性** 先查看精确受影响笔记，先更新所有设备，再明确确认；启动时绝不自动迁移。新旧值等价时可安全规范化；冲突、无效值、重复键、预览后内容变化或有歧义的 YAML 都会失败关闭。迁移保留无关 frontmatter、正文、换行符、BOM 和可识别的未来 `key=value` token。

## icon 属性

`icon` 与 Obsidian Properties 兼容：使用一个字符串或扁平字符串列表，不使用嵌套 YAML。按顺序采用第一个实际可显示的基础候选；图片缺失时继续下一项。与文字或 Lucide 搭配时，第一个有效 `color:` 项直接为前景着色。Emoji 和图片保留原始像素，不增加圆点、背景或边框；对它们而言，只有所有基础候选都失败时，`color:` 才回退为居中的实心圆形色标。

```yaml
icon:
  - "[[Assets/project.svg]]"
  - "lucide:folder-tree"
  - 文
  - "color:#7c3aed"
```

Picker 会载入当前完整列表，支持添加、删除、排序、预设和 File Explorer/Contents 实时预览。未知值或多字素值会显示为无效且不能保存；单个英文字符、中文字符、符号或 Emoji 仍然有效。只有本地列表全部耗尽后才开始继承。

**图标与外观**会显示“系统默认”以及当前设备检测到的受支持彩色 Emoji 字体：Segoe UI Emoji、Apple Color Emoji、Noto Color Emoji、Twemoji Mozilla 和 OpenMoji。复杂序列预览会在使用前暴露缺字或 Emoji 拆分；同步设置或卸载字体后若所选字体消失，会自动回退到系统字体栈，“重新检测本机字体”可刷新列表。高级 CSS snippet 仍可覆盖 `--folder-nodes-glyph-font` 和 `--folder-nodes-emoji-font`。

## 限制

- 结构身份是当前规范化 Vault 路径，不是永久 ID。外部删除后再创建不会被猜测为重命名。
- HTML5 拖放仅在桌面端启用。Android 不创建 draggable handle 或 drop target，改用原生移动文件夹和插件移动/排序动作。
- 节点视觉支持 Vault 图片和轻量语义图标位，但不抓取远程图片、不做 inline SVG 重着色、不从节点名推断首字母、不接受嵌套 `icon` 对象、不生成 PDF 首页或视频帧、不预览 HEIC/HEIF、不播放 GIF、视频或音频。
- Contents View 可将单个普通文件移入当前显示的节点或面包屑目录，并可多选文件插入或复制链接，但不提供普通文件独立排序、事务式多文件移动、跨视图内部放置，也不是第二棵完整 Vault 目录树。
- 合并遇到路径或 frontmatter 冲突会失败关闭，不提供复杂的冲突合并界面。
- 不支持 `README.md`、`index.md`、`_A.md` 等替代 canonical note 名称或任意属性继承。不管理的文件夹是完整子树边界，不是部分受管节点。
- 超大图谱会切换到 Canvas 并保留所有可见结构边，只限制可选的链接叠加。2D 保持可读的最小缩放，3D 把远处节点绘制为圆点，只在聚焦或悬停时显示完整卡片；用户继续通过范围和渐进展开控制可见内容，不在图谱上覆盖密集总览提示。

## 隐私与安全

Folder Nodes 只在本地运行，不发起网络请求。健康检查和预览扫描会盘点本地 Vault 路径与属性声明；节点图谱读取本地 Folder Node 结构、Metadata Cache 和共用反向引用索引，不上传笔记内容，也不建立另一套全 Vault 链接扫描。已记录的用户操作可以创建、修改、移动、重命名、合并笔记和文件夹，或将其移入回收站。批量整理和属性迁移始终先预览并在提交前重新核对；结构写入串行执行，路径冲突阻止提交，歧义操作失败关闭。回滚动作始终绑定原始 Vault 对象；对象已改变或同路径已被替换时拒绝恢复，不会操作新的占位对象。完整节点删除使用 Obsidian 的系统回收站路径。只有用户明确执行复制操作后，插件才会把生成的 Markdown 链接写入系统剪贴板；它从不读取剪贴板。偏好与不管理规则保存在插件 `data.json`，结构 token 保存在 Node Note 的 `folder-nodes` 列表；图谱工作区状态只持久化范围、焦点、维度与是否显示链接。分支展开和搜索快照只在当前会话存在，重启后恢复安全的一层默认。节点内容、路径、视觉和诊断都不会上传。

## 开发

使用 Node.js 24.19.0 和 npm 11.17.0。

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
