---
source_language: zh-CN
translation_status: source
---

# Folder Nodes 交互规范

## Obsidian 一致性

界面使用 Obsidian 原生 Setting、Menu、Modal、Notice、主题变量、图标和键盘焦点。桌面最小目标 36px，粗指针为 44px。设置分为“常规”“主页”“图标与外观”“选区与命名”四页，声明式设置与 fallback tabs 使用相同标签。语言下拉框使用 `跟随 Obsidian`、`简体中文`、`English`，其中“跟随 Obsidian”使用 Obsidian 当前的界面语言。

## 主页

启用后，Root Node Note 是唯一主页。命令面板与 Node Contents header 的 Home 按钮都打开该笔记；“启动时打开主页”在 Obsidian 完成 Vault 布局恢复后执行。未启用或 Root Note 缺失时显示明确提示，不静默创建文件。

## 选区创建

选中文字后的编辑器右键菜单与命令面板都显示“从选中文字创建 Folder Node”。确认弹窗同时显示父 Node、最终 Node Note 路径、alias 和 WikiLink；选区在确认前改变则停止创建。aliases 开关不改变 basename，前后缀也不改变 alias。

## Explorer Node Tree

点击 folder title 打开 Node Note，disclosure arrow 只展开或折叠。canonical Node Note 行隐藏。拖拽时必须显示 before line、into highlight 或 after line；drop 前不得修改 Vault。节点右键菜单复用创建、Contents、Visual、rename、move、merge、reorder 和 trash actions。

## Node Contents View

侧栏顶部显示 breadcrumb、可选的当前 Node visual、标题、Home、Edit visual 和 New child node。Nodes 仅在存在有效或继承 visual 时显示视觉标识；没有 visual 的节点使用紧凑文字卡，不显示大 fallback 文件夹。Album 使用接近相册的密集 4:3 缩略图：普通图片无 badge，GIF 显示 `GIF` badge 且转为静态帧，视频只显示静态类型 tile。HEIC/HEIF、音频与其他资源位于紧凑 Files 列表。插件不渲染 `<video>`/`<audio>` 控件且不自动播放；“打开”只导航到 Obsidian 的文件视图。Sections 可折叠，每批最多渲染 200 项。

Node、Album 与 Files 条目都通过右键、hover/focus 时的 More actions 按钮以及 Shift+F10/菜单键打开同一个 Obsidian Menu。Node 菜单包含打开、在新标签打开、浏览内容、新建子节点、Visual、rename、move、merge、reorder 和 trash。普通文件菜单包含打开、在新标签打开、在 File Explorer 中显示、复制链接、rename、move 和 trash；支持的图片还可设为当前 Node visual。未管理文件夹只提供浏览内容、在 File Explorer 中显示和其他插件通过 `file-menu` 注入的安全动作。Trash 项使用 warning 样式，所有写入失败都显示失败关闭 Notice。

Node 卡片上方 25% 是 before line，中间 50% 是 into highlight，下方 25% 是 after line；该语义与 Explorer 一致。普通文件与 Album 条目只有 into，不提供 before/after 或顺序元数据；可放到子 Node、当前 Node header 或 breadcrumb，drop 后通过 Obsidian FileManager 移动。节点不能放入自身或后代，文件重名冲突禁止写入。Escape、dragend、离开目标和失败都清理视觉状态；drop 前不得修改 Vault。菜单中的 move/reorder 是完整键盘等价操作。v1 的 Contents 拖拽只接受本视图单项来源，不提供多选或跨视图 drop。

## Visual Picker

用户可输入 Emoji、Lucide 名称、CSS 颜色或 Vault image wikilink，并可使用稳定预设。留空删除当前 `icon`。打开继承后使用最近祖先 visual，并在 DOM 中保留继承来源。文件列表图标可置于名称之前、之后或隐藏；笔记行内标题显示可单独开启。图标使用 Obsidian 尺寸、基线和间距，不提供任意大小滑杆。

## 迁移与健康

“初始化与维护”合并空 Vault 接管和已有 Vault 迁移，逐项展开叶子 Markdown 的源/目标、缺失 Node Note、叶子笔记豁免、文件夹豁免和阻塞冲突。零文件变更但尚未接管时允许“开始管理”；冲突存在时禁止提交。Health 使用同一摘要但严格只读，只显示关闭按钮。进度条只在明确应用后推进，失败显示安全停止通知。

## 结构豁免

常规页分别显示“允许的叶子笔记”和“不管理的文件夹”列表。前者是精确 `.md` 路径，后者作用于完整子树。添加、删除和预览都明确显示 Vault 相对路径；豁免仅停止结构管理，不隐藏文件或文件夹。
