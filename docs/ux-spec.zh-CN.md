---
source_language: zh-CN
translation_status: source
---

# Folder Nodes — 交互规范

## Obsidian 一致性

界面使用 Obsidian 原生 Setting、Menu、Modal、Notice、主题变量、图标和键盘焦点。桌面最小目标 36px，粗指针为 44px。所有受支持 Obsidian 版本都使用 imperative 五页签设置界面：“常规”“主页”“图标与外观”“选区与命名”“节点图谱”；声明式设置保持关闭，因为它会绕过这套布局。界面直接从页签行开始，既不在页签上方重复大型插件名称，也不在面板内重复当前页签名称。页签在主题覆盖下仍保持基线与强调色下划线，活动标签同时使用半粗字重，标签行与面板之间保留稳定间距；窄宽度可横向滚动，随大号界面字体增高，并支持符合文字方向的左右键以及 Home、End。设置 schema 无效或更高时，每个页签内部都明确显示只读警告，同时保留页签导航；全部设置控件被禁用，且不回写 `data.json`。保存失败时保留本次会话的最新值，显示“尚未保存”状态并提供“重试保存”。语言下拉框使用 `跟随 Obsidian`、`简体中文`、`English`，其中“跟随 Obsidian”使用 Obsidian 当前的界面语言。

## 主页

启用后，Root Node Note 是唯一主页。命令面板与 Node Contents header 的 Home 按钮都打开该笔记；“启动时打开主页”在 Obsidian 完成 Vault 布局恢复后执行。未启用或 Root Note 缺失时显示明确提示，不静默创建文件。

## 选区创建

选中文字后的编辑器右键菜单与命令面板都显示“从选中文字创建 Folder Node”。确认弹窗同时显示父 Node、最终 Node Note 路径、alias 和 WikiLink；确认后把选中文字写入新 Node Note 正文，并用预览的 WikiLink 替换来源选区。选区、来源路径或表格结构在确认前改变则停止创建。源码模式和 Live Preview 支持单个 Markdown 表格单元格，并预览带转义 `\|` 的 WikiLink 分隔符；跨单元格或跨行选区显示提示且不写入。aliases 开关不改变 basename，前后缀也不改变 alias。

“选区与命名”页顶部使用紧凑说明卡片展示 `[[a]]` → `a/a.md` 与 `[[a|b]]` → `a/a.md`，下方紧接两种创建方式共用的 aliases 开关。在受管理范围内，普通点击或带修饰键点击未解析的内部 Markdown 链接时，在对应 pane 中创建并打开完整 Node。开启 aliases 后，只有显式显示文字 `b` 成为 alias；目标 `a` 仍是 Node 名称，新正文为空。点击已有链接绝不修改它。不管理或不支持的目标保留 Obsidian 原生行为；结构冲突显示 Notice，且不得留下部分 Node。

## Explorer Node Tree

File Explorer 顶部固定显示 Root 卡片行：没有 disclosure control、不可折叠、不可拖动，可通过点击或键盘打开 Root Node Note。Root 图标、Vault 名称和“根节点”状态分别占用固定图标位、弹性名称位和尾部状态位，卡片边框与强调色边线提供清晰层级；选中态仍跟随 Obsidian。普通 Folder Node 同样把属性图标放入固定且无边框的图标位，把名称留在原生 title 位，并把“不完整节点”“不管理”“冲突”等状态固定为尾部胶囊，不把这些内容拼进名称。完整节点和仅有文件夹的一侧可使用节点图标；仅有 Markdown 的不完整节点与不管理项不补充通用文件图标。所有图标位使用相同几何尺寸，默认 SVG、文字、Emoji 和图片都不得改变原生行高。点击完整节点的 folder title 打开 Node Note；不完整文件夹保留 Obsidian 原生展开/选择行为，disclosure arrow 始终只展开或折叠。canonical Node Note 行隐藏。每个 File Explorer leaf 独立工作，包括 popout window；插件不得观察整页 `document.body`。桌面端拖拽必须显示 before line、into highlight 或 after line，drop 前不得修改 Vault；Android 不注册 HTML5 drag/drop listener，也不增加 draggable。Obsidian 原生“新建笔记/新建文件夹”按钮以及文件夹 rename/move/delete 菜单保持可见；插件在旁边增加一次性创建文件夹与同名 Node Note 的“新建节点”，并提供 Contents、Visual、merge、reorder 等不同语义的节点动作。停用插件后必须移除 Root、自有按钮/图标/class/监听器并恢复 Explorer 顺序和 draggable。

## Node Contents View

侧栏顶部显示 breadcrumb、可选的当前 Node visual、标题、Home、Edit visual 和 New child node。Nodes 仅在存在有效或继承 visual 时显示视觉标识；没有 visual 的节点使用紧凑文字卡，不显示大 fallback 文件夹。Album 使用接近相册的密集 4:3 缩略图：普通图片无 badge，GIF 显示 `GIF` badge 且转为静态帧，视频只显示静态类型 tile。HEIC/HEIF、音频与其他资源位于紧凑 Files 列表。不管理的文件夹与 Markdown 行共用中性的“不管理”状态 badge，并在独立且对齐的类型列显示“文件夹”或 `MD`。插件不渲染 `<video>`/`<audio>` 控件且不自动播放；“打开”只导航到 Obsidian 的文件视图。Sections 可折叠，每批最多渲染 200 项。

Node、Album 与 Files 条目都通过右键、hover/focus 时的 More actions 按钮以及 Shift+F10/菜单键打开同一个 Obsidian Menu。插件自有 Contents 菜单可以提供完整节点操作，因为那里没有原生文件树菜单需要避免重复。File Explorer 文件夹菜单保留原生 rename/move/delete，只增加不同的节点动作。Node Note 标签页保留原生的笔记级 move/delete/merge，Folder Nodes 额外提供措辞明确的“移动/合并/删除所在节点”；原生 rename 会同步明确配对的文件夹/Node Note。文件夹侧的不完整节点提供“补全节点”和“设为不管理”，Markdown 侧的不完整节点提供“转换为 Folder Node”和“设为不管理”；hover/focus 主动作与菜单动作一致，状态 badge 本身不响应双击。不管理项提供“纳入管理”，匹配名称开头规则或位于不管理文件夹内时提示用户调整规则。原生创建与删除只改变实际存在的一侧，不自动补全或重建；删除文件夹时，其子树（包括 canonical Node Note）由 Obsidian 一并删除。普通文件菜单包含打开、在新标签打开、在 File Explorer 中显示、复制链接、rename、move 和 trash；支持的图片还可设为当前 Node visual。普通文件、Album 条目和不管理文件夹仍可通过 `file-menu` 接收其他插件注入的动作。所有写入失败都显示失败关闭 Notice。

桌面端 Node 卡片上方 25% 是 before line，中间 50% 是 into highlight，下方 25% 是 after line；普通文件与 Album 条目只有 into。节点不能放入自身或后代，文件重名冲突禁止写入，Escape、dragend、离开目标和失败都清理视觉状态。Android 不显示拖拽 handle 或 drop marker，改用 Obsidian 原生移动文件夹、Folder Nodes 的 Move/Move up/Move down 以及普通文件 Move 菜单。原生跨父级移动进入手动排序父级时，移动节点获得目标顺序末尾的新 rank。选择模式在两端都可多选 Album/Files 条目以插入或复制链接；跨视图内部 drop 不接受。

## 节点图谱

节点图谱是 Folder Nodes 自己的工作区视图，不修改 Obsidian 原生 Graph View。第一行工具栏包含标题、原生搜索、“显示链接”、2D/3D 与适应视图；第二行包含全局/子树/局部范围和“展开范围”菜单；窄窗口可以换行，但不遮挡图谱。结构始终是层级骨架。新建图谱的“显示链接”默认关闭；开启后独立叠加紫色虚线的已解析 canonical-note 链接、内联图例与当前可见链接数，当前范围没有链接时显示轻量的内联提示。关闭时只保留结构骨架。稳定的 2D 层级默认从左到右，设置中也可选择从上到下；把手和边的几何方向随布局一起旋转。

结构场景在布局前按渐进展开计算。全局默认显示 Root 与直接子级；子树默认显示选中节点与直接子级；局部额外加入一个父级作为上下文，并把当前选中节点的完整子树作为可展开范围，不能通过父级扩出全部兄弟，只有开启“显示链接”时才加入直接入链/出链邻居。未选中节点时，“子树”和“局部”禁用；范围标签显示当前实际节点。多个分支可以同时保持展开。“展开范围”可从范围锚点展开 1/2/3 层或全部后代，显示预计可见数量，也可收回一级；全部展开直接执行，不再二次确认。范围、焦点、维度和“显示链接”写入 workspace state；每个范围的展开状态仅存在于当前图谱 leaf 会话，不序列化，重启后恢复安全的一层默认。旧 workspace 的 Structure 映射为关闭链接，Links/Hybrid 映射为开启链接。

从左到右的 2D 卡片依次表现为父级连线、左侧 visual/连接把手、主体名称、右侧子级展开把手和子级连线。叶子不显示右把手；其他节点显示直接子级数量和展开状态。Visual 统一进入固定图标位，依次回退为自身值、继承值、Folder，Root 使用 Home。点击右把手只切换直接子级，Alt+点击展开整支；点击卡片主体进行选择，双击或 Enter 打开 canonical Node Note；右键、Shift+F10 或菜单键复用节点菜单。把手和所有控件都有原生 Tooltip、键盘激活、可见焦点及明确 accessible name；粗指针命中区至少 44px。

搜索使用 Obsidian SearchComponent。Enter 选择最佳结果，自动显示全部隐藏祖先、居中并保持选中。首次进入有效查询时保存展开、焦点和镜头快照；Escape 或清空搜索精确恢复该快照。外部聚焦请求使用同一套祖先展开逻辑。Folder Node 与 canonical Node Note 菜单可打开并聚焦已有图谱 leaf，也可打开对应子树或局部范围。

“节点图谱”设置页包含总开关、默认维度、2D 布局方向、Canvas 与大图阈值、当前配置的节点实时估算、可搜索的层级 Folder Node 规则、纳入子树、精确隐藏节点和隐藏子树。隐藏单个节点时仍可提升其可显示后代；隐藏子树会直接停止遍历。纳入列表非空时，图谱仅显示这些子树。文件夹重命名或移动会同步重映射规则，删除会清理失效规则。关闭总开关会移除插件自己的图谱入口并关闭已打开的图谱 leaf，但不会影响 Obsidian 原生 Graph。一个增量刷新的图谱索引提供结构、Visual 与 canonical-note 链接，可见性与一份共享场景几何再供 DOM、Canvas 2D 和分层 3D 使用。大图保持常量 DOM、保留所有可见结构边、只限制可选链接叠加，2D 保持可读缩放，3D 将远处节点绘制为圆点并仅在聚焦或悬停时显示完整卡片。图谱不增加第二套 Vault 扫描、轮询或覆盖画布的密度提示。

## Visual Picker

Picker 打开时载入当前 `icon` 的完整 Text/List，而不是显示空输入框。用户可添加、删除、上下移动 Vault image wikilink、`lucide:` 候选、单个文字/Emoji 和 `color:` 修饰，也可追加稳定预设；Explorer 与 Contents 预览随输入更新。确认时零项删除属性、一项写 Text、多项写扁平 Text List；未知、多字素、非字符串或嵌套值都拒绝保存并提示，不静默接受或覆盖。图片缺失会预览后续本地候选，只有本地声明全部无效时才预览继承 visual。第一个合法颜色为文字或 Lucide 前景着色；Emoji 和图片不叠加圆点或装饰，只有所有基础候选都失败时颜色才成为居中的实心圆形色标。属性图标统一位于固定且无边框的图标位中，文件名中的相同字符保持普通文字；“图标与外观”说明卡片通过字重、大小和颜色同时展示两种情况。文件列表图标可置于名称之前、之后或隐藏。笔记标题图标可单独开启，仍是可编辑 `.inline-title` 外部的不可编辑 sibling，按标题首行的实际几何位置对齐，并在 view resize 后重算。文字使用 Obsidian 界面字体。Emoji 字体控件在探测固定本机候选期间保持禁用，完成后只列出“系统默认”和已安装匹配项；跨设备保留下来但本机缺失的选择会标记为不可用，并通过系统栈显示。预览覆盖较新 Emoji、国旗、肤色/ZWJ 和家庭序列，安装字体后可手动重新检测；高级 CSS 变量继续提供覆盖能力。

## 批量整理与健康

插件没有初始化或接管状态；启用后立即把受管理范围内的结构识别为完整节点、不完整节点或冲突，并只对明确配对的完整节点同步重命名。常规页在不管理规则之后提供可选的“批量整理不完整节点”：分批扫描 Vault，持续显示进度并允许取消，跳过指定路径、匹配名称开头规则及不管理文件夹子树。扫描完成后，预览逐项展开叶子 Markdown 的源/目标、待创建 Node Note 和阻塞冲突；确认前不会修改任何文件。确认时先重新核对预览，再执行并验证结果，失败安全停止并回滚。Health 始终严格只读。Contents 和 Explorer 使用中性的“不完整节点”，只有真正的配对冲突才使用警告和恢复动作。

## 不管理的内容

完整节点的右键菜单提供“隐藏节点”或“取消隐藏节点”；继承隐藏的后代只显示不可操作的来源说明。隐藏眼睛是状态而不是直接写入按钮，并且只在用户启用当前会话的“临时显示隐藏节点”后显示在显式隐藏根上；继承隐藏的后代使用弱化样式与“由 X 隐藏”提示，不为每一项重复眼睛。Ribbon 和命令面板提供同一个会话开关；“常规”中的“应用隐藏标记”是持久总开关。移动端不得依赖 hover，所有可操作控件维持至少 44 px 触控目标。不管理项从不显示隐藏眼睛；重新纳入管理时，如 YAML 自身或上级标记会使其再次隐藏，先给出明确警告。

常规页显示“不管理的 Markdown 文件”和“不管理的文件夹”两个规则组。每组都把指定路径和名称开头规则合并到同一列表，用规则类型标签区分，并在一起提供“添加路径”“添加名称开头规则”。规则行使用“名称以‘.’开头”这类自然语言，不显示需要用户理解的通配符。两组默认都包含 `.`、`_` 名称开头规则。当前 Vault 配置目录、`.git`、`.trash` 由系统保护。不管理规则只停止结构管理，不隐藏文件或文件夹；精确的不管理项和通用规则都保存在插件 `data.json`，不写入笔记 YAML。
