---
source_language: zh-CN
translation_status: source
---

# Folder Nodes 交互规范

## Obsidian 一致性

界面使用 Obsidian 原生 Setting、Menu、Modal、Notice、主题变量、图标和键盘焦点。桌面最小目标 36px，粗指针为 44px。设置分为“常规”“主页”“图标与外观”“选区与命名”四页；fallback 界面直接从页签行开始，既不在页签上方重复大型插件名称，也不在面板内重复当前页签名称。页签在主题覆盖下仍保持基线与强调色下划线，活动标签同时使用半粗字重，标签行与面板之间保留稳定间距；窄宽度可横向滚动，随大号界面字体增高，并支持符合文字方向的左右键以及 Home、End。声明式设置与 fallback tabs 使用相同标签。语言下拉框使用 `跟随 Obsidian`、`简体中文`、`English`，其中“跟随 Obsidian”使用 Obsidian 当前的界面语言。

## 主页

启用后，Root Node Note 是唯一主页。命令面板与 Node Contents header 的 Home 按钮都打开该笔记；“启动时打开主页”在 Obsidian 完成 Vault 布局恢复后执行。未启用或 Root Note 缺失时显示明确提示，不静默创建文件。

## 选区创建

选中文字后的编辑器右键菜单与命令面板都显示“从选中文字创建 Folder Node”。确认弹窗同时显示父 Node、最终 Node Note 路径、alias 和 WikiLink；确认后把选中文字写入新 Node Note 正文，并用预览的 WikiLink 替换来源选区。选区、来源路径或表格结构在确认前改变则停止创建。源码模式和 Live Preview 支持单个 Markdown 表格单元格，并预览带转义 `\|` 的 WikiLink 分隔符；跨单元格或跨行选区显示提示且不写入。aliases 开关不改变 basename，前后缀也不改变 alias。

“选区与命名”页顶部使用紧凑说明卡片展示 `[[a]]` → `a/a.md` 与 `[[a|b]]` → `a/a.md`，下方紧接两种创建方式共用的 aliases 开关。在 Managed 范围内，普通点击或带修饰键点击未解析的内部 Markdown 链接时，在对应 pane 中创建并打开完整 Node。开启 aliases 后，只有显式显示文字 `b` 成为 alias；目标 `a` 仍是 Node 名称，新正文为空。点击已有链接绝不修改它。豁免或不支持的目标保留 Obsidian 原生行为；受管冲突显示 Notice，且不得留下部分 Node。

## Explorer Node Tree

File Explorer 顶部固定显示 Root 卡片行：没有 disclosure control、不可折叠、不可拖动，可通过点击或键盘打开 Root Node Note。Root 图标、Vault 名称和“根节点”状态分别占用固定图标位、弹性名称位和尾部状态位，卡片边框与强调色边线提供清晰层级；选中态仍跟随 Obsidian。普通 Folder Node 同样把属性图标放入固定且无边框的图标位，把名称留在原生 title 位，并把“无笔记”等状态固定为尾部胶囊，不把这些内容拼进名称。所有图标位使用相同几何尺寸，默认 SVG、文字、Emoji 和图片都不得改变原生行高。点击完整节点的 folder title 打开 Node Note；仅有文件夹时保留 Obsidian 原生展开/选择行为，disclosure arrow 始终只展开或折叠。canonical Node Note 行隐藏。每个 File Explorer leaf 独立工作，包括 popout window；插件不得观察整页 `document.body`。拖拽时必须显示 before line、into highlight 或 after line；drop 前不得修改 Vault。Obsidian 原生“新建笔记/新建文件夹”按钮以及文件夹 rename/move/delete 菜单保持可见；插件只增加新建完整子节点、Contents、Visual、merge、reorder 等不同语义的节点动作。停用插件后必须移除 Root、自有按钮/图标/class/监听器并恢复 Explorer 顺序和 draggable。

## Node Contents View

侧栏顶部显示 breadcrumb、可选的当前 Node visual、标题、Home、Edit visual 和 New child node。Nodes 仅在存在有效或继承 visual 时显示视觉标识；没有 visual 的节点使用紧凑文字卡，不显示大 fallback 文件夹。Album 使用接近相册的密集 4:3 缩略图：普通图片无 badge，GIF 显示 `GIF` badge 且转为静态帧，视频只显示静态类型 tile。HEIC/HEIF、音频与其他资源位于紧凑 Files 列表。不管理的文件夹与 Markdown 行共用中性的“不管理”状态 badge，并在独立且对齐的类型列显示“文件夹”或 `MD`。插件不渲染 `<video>`/`<audio>` 控件且不自动播放；“打开”只导航到 Obsidian 的文件视图。Sections 可折叠，每批最多渲染 200 项。

Node、Album 与 Files 条目都通过右键、hover/focus 时的 More actions 按钮以及 Shift+F10/菜单键打开同一个 Obsidian Menu。插件自有 Contents 菜单可以提供完整节点操作，因为那里没有原生文件树菜单需要避免重复。File Explorer 文件夹菜单保留原生 rename/move/delete，只增加不同的节点动作。Node Note 标签页保留原生的笔记级 move/delete/merge，Folder Nodes 额外提供措辞明确的“移动/合并/删除所在节点”；原生 rename 会同步已有文件夹/Node Note 配对。仅有文件夹的菜单提供“创建节点笔记”，不把文件夹显示成错误。普通文件菜单包含打开、在新标签打开、在 File Explorer 中显示、复制链接、rename、move 和 trash；支持的图片还可设为当前 Node visual，普通 Markdown 可明确转换为 Folder Node。普通文件、Album 条目和未管理文件夹仍可通过 `file-menu` 接收其他插件注入的动作。所有写入失败都显示失败关闭 Notice。

Node 卡片上方 25% 是 before line，中间 50% 是 into highlight，下方 25% 是 after line；该语义与 Explorer 一致。普通文件与 Album 条目只有 into，不提供 before/after 或顺序元数据；可放到子 Node、当前 Node header 或 breadcrumb，drop 后通过 Obsidian FileManager 移动。节点不能放入自身或后代，文件重名冲突禁止写入。Escape、dragend、离开目标和失败都清理视觉状态；drop 前不得修改 Vault。菜单中的 move/reorder 是完整键盘等价操作。选择模式可多选 Album/Files 条目以插入或复制链接；拖动单个条目可在本 Contents View 内移动，拖动多个已选条目只导出其链接，不能退化为部分多文件移动。跨视图内部 drop 不接受。

## Visual Picker

Picker 打开时载入当前 `icon` 的完整 Text/List，而不是显示空输入框。用户可添加、删除、上下移动 Vault image wikilink、`lucide:` 候选、单个文字/Emoji 和 `color:` 修饰，也可追加稳定预设；Explorer 与 Contents 预览随输入更新。确认时零项删除属性、一项写 Text、多项写扁平 Text List；未知、多字素、非字符串或嵌套值都拒绝保存并提示，不静默接受或覆盖。图片缺失会预览后续本地候选，只有本地声明全部无效时才预览继承 visual。第一个合法颜色为文字或 Lucide 前景着色；Emoji 和图片不叠加圆点或装饰，只有所有基础候选都失败时颜色才成为居中的实心圆形色标。属性图标统一位于固定且无边框的图标位中，文件名中的相同字符保持普通文字；“图标与外观”说明卡片通过字重、大小和颜色同时展示两种情况。文件列表图标可置于名称之前、之后或隐藏。笔记标题图标可单独开启，仍是可编辑 `.inline-title` 外部的不可编辑 sibling，按标题首行的实际几何位置对齐，并在 view resize 后重算。文字使用 Obsidian 界面字体，Emoji 使用系统彩色 Emoji 字体；高级覆盖通过 CSS 变量完成，不增加普通字体选择器。

## 迁移与健康

未接管时，设置页和 Contents 顶部必须显著显示“尚未初始化”，并说明自动重命名同步不可用；主按钮为“开始初始化”。预览逐项展开叶子 Markdown 的源/目标、缺失 Node Note、指定路径及名称前缀形式的不管理规则和阻塞冲突，最终按钮为“确认初始化”。接管后启动验证和 Health 都严格只读，不自动转换原生文件夹或 Markdown。进度条只在明确确认初始化后推进，失败显示安全停止通知。Contents 的 Nodes 区显示完整节点和仅有文件夹的节点壳；仅有文件夹使用中性样式并提供“创建节点笔记”，真正的配对冲突才使用警告和恢复动作。

## 不管理的内容

常规页只显示“不管理的 Markdown 文件”和“不管理的文件夹”两个规则组。每组都把指定路径和名称前缀合并到同一列表，用规则类型标签区分，并在一起提供“添加路径”“添加名称前缀”。两组的首发默认前缀都是 `.`、`_`。当前 Vault 配置目录、`.git`、`.trash` 由系统保护。不管理规则只停止结构管理，不隐藏文件或文件夹。
