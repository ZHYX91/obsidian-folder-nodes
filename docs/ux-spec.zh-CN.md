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

选中文字后的编辑器右键菜单与命令面板都显示“从选中文字创建 Folder Node”。确认弹窗同时显示父 Node、最终 Node Note 路径、alias 和 WikiLink；确认后把选中文字写入新 Node Note 正文，并用预览的 WikiLink 替换来源选区。选区在确认前改变则停止创建。aliases 开关不改变 basename，前后缀也不改变 alias。

“选区与命名”页顶部使用紧凑说明卡片展示 `[[a]]` → `a/a.md` 与 `[[a|b]]` → `a/a.md`，下方紧接两种创建方式共用的 aliases 开关。在 Managed 范围内，普通点击或带修饰键点击未解析的内部 Markdown 链接时，在对应 pane 中创建并打开完整 Node。开启 aliases 后，只有显式显示文字 `b` 成为 alias；目标 `a` 仍是 Node 名称，新正文为空。点击已有链接绝不修改它。豁免或不支持的目标保留 Obsidian 原生行为；受管冲突显示 Notice，且不得留下部分 Node。

## Explorer Node Tree

File Explorer 顶部固定显示 Root 行：没有 disclosure control、不可折叠、不可拖动，可通过点击或键盘打开 Root Node Note，并使用独立的根节点标签和选中状态。点击普通 folder title 打开 Node Note，disclosure arrow 只展开或折叠。canonical Node Note 行隐藏。每个 File Explorer leaf 独立工作，包括 popout window；插件不得观察整页 `document.body`。拖拽时必须显示 before line、into highlight 或 after line；drop 前不得修改 Vault。节点右键菜单复用创建、Contents、Visual、rename、move、merge、reorder 和 trash actions。停用插件后必须移除 Root、自有按钮/图标/class/监听器并恢复 Explorer 顺序和 draggable。

## Node Contents View

侧栏顶部显示 breadcrumb、可选的当前 Node visual、标题、Home、Edit visual 和 New child node。Nodes 仅在存在有效或继承 visual 时显示视觉标识；没有 visual 的节点使用紧凑文字卡，不显示大 fallback 文件夹。Album 使用接近相册的密集 4:3 缩略图：普通图片无 badge，GIF 显示 `GIF` badge 且转为静态帧，视频只显示静态类型 tile。HEIC/HEIF、音频与其他资源位于紧凑 Files 列表。不管理的文件夹与 Markdown 行共用中性的“不管理”状态 badge，并在独立且对齐的类型列显示“文件夹”或 `MD`。插件不渲染 `<video>`/`<audio>` 控件且不自动播放；“打开”只导航到 Obsidian 的文件视图。Sections 可折叠，每批最多渲染 200 项。

Node、Album 与 Files 条目都通过右键、hover/focus 时的 More actions 按钮以及 Shift+F10/菜单键打开同一个 Obsidian Menu。健康 Node 菜单只包含 Folder Nodes 拥有的打开、在新标签打开、浏览内容、在 File Explorer 中显示、新建子节点、Visual、rename、move、merge、reorder 和 trash；问题 Node 菜单同样只提供修复、导航和不管理动作。Node 菜单不转发 `file-menu`，第三方文件夹批量操作应从 File Explorer 使用。普通文件菜单包含打开、在新标签打开、在 File Explorer 中显示、复制链接、rename、move 和 trash；支持的图片还可设为当前 Node visual。普通文件、Album 条目和未管理文件夹仍可通过 `file-menu` 接收其他插件注入的动作；未管理文件夹自身只提供浏览内容和在 File Explorer 中显示。Trash 项使用 warning 样式并位于 Node 自有动作末尾，所有写入失败都显示失败关闭 Notice。

Node 卡片上方 25% 是 before line，中间 50% 是 into highlight，下方 25% 是 after line；该语义与 Explorer 一致。普通文件与 Album 条目只有 into，不提供 before/after 或顺序元数据；可放到子 Node、当前 Node header 或 breadcrumb，drop 后通过 Obsidian FileManager 移动。节点不能放入自身或后代，文件重名冲突禁止写入。Escape、dragend、离开目标和失败都清理视觉状态；drop 前不得修改 Vault。菜单中的 move/reorder 是完整键盘等价操作。选择模式可多选 Album/Files 条目以插入或复制链接；拖动单个条目可在本 Contents View 内移动，拖动多个已选条目只导出其链接，不能退化为部分多文件移动。跨视图内部 drop 不接受。

## Visual Picker

Picker 打开时载入并保留当前 `icon` 的完整 Text/List，而不是显示空输入框。用户可添加、删除、上下移动 Vault image wikilink、`lucide:` 候选、单个文字/Emoji 和 `color:` 修饰，也可追加稳定预设；Explorer 与 Contents 预览随输入更新。确认时零项删除属性、一项写 Text、多项写扁平 Text List；未知字符串原样保留，非字符串或嵌套形状拒绝编辑并提示，避免静默覆盖。图片缺失会预览后续本地候选，第一个合法颜色生效，只有本地声明全部无效时才预览继承 visual。文件列表图标可置于名称之前、之后或隐藏；笔记标题图标可单独开启，但必须作为可编辑 `.inline-title` 外部的不可编辑 sibling，不得进入标题文字或选区。图标使用 Obsidian 尺寸、基线和间距，不提供任意大小滑杆。

## 迁移与健康

未接管时，设置页和 Contents 顶部必须显著显示“尚未初始化”，并说明自动重命名同步和结构维护不可用；主按钮为“开始初始化”。预览逐项展开叶子 Markdown 的源/目标、缺失 Node Note、指定路径及名称前缀形式的不管理规则和阻塞冲突，最终按钮为“确认初始化”。接管后入口改为“结构维护/检查结构”。Health 使用同一摘要但严格只读，只显示关闭按钮。进度条只在明确确认后推进，失败显示安全停止通知。Contents 的 Nodes 区显示正常节点、缺少 Node Note 的文件夹和缺少同名文件夹的受管理 Markdown；异常项使用警告标识和显式修复或不管理规则菜单。

## 不管理的内容

常规页只显示“不管理的 Markdown 文件”和“不管理的文件夹”两个规则组。每组都把指定路径和名称前缀合并到同一列表，用规则类型标签区分，并在一起提供“添加路径”“添加名称前缀”。两组的首发默认前缀都是 `.`、`_`。当前 Vault 配置目录、`.git`、`.trash` 由系统保护。不管理规则只停止结构管理，不隐藏文件或文件夹。
