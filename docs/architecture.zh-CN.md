---
source_language: zh-CN
translation_status: source
---

# Folder Nodes 架构

## 身份与持久化

Node 的当前身份是规范化 Vault folder path 与 `A/A.md` 结构，不存在稳定 ID。Folder Nodes 主动使用 `aliases`、`icon`、`folderNodeChildrenSort` 和 `folderNodeSiblingRank`。`aliases` 与 `icon` 是可移植内容属性；两个 `folderNode` 字段是插件结构属性。Managed、Migrating、Unadopted 状态、主页偏好、图标位置、命名规则、不管理的指定路径和名称前缀规则保存在插件 `data.json`。

## 分层

Core 只处理路径、命名、不管理边界规则、迁移计划、稀疏排序、frontmatter 最小 patch 和 Visual declaration 解析。Adapters 封装 Vault、Metadata Cache、File Explorer、资源 URI 与 Node 操作。UI/App 提供本地化、设置、命令、菜单、弹窗、Visual Picker 和 Contents View。公开仓库不依赖本地工作区或个人 Vault。

## 排序引擎

自然模式按 Unicode 规范化 basename 做 numeric-aware 排序且不写属性。第一次明确手动 placement 时，父 Node 写 `folderNodeChildrenSort: manual`，当前直接 Child Nodes 以 1024 间隔物化 `folderNodeSiblingRank`。有空隙时只 patch moved Node；无空隙时最多 rebalance 64 个邻居，再退化为当前父节点的完整 rank 物化，但从不把子节点数组写进父 Note。

## Node 操作

NodeService 把 create、rename、move、place、merge、repair 和 trash 作为目录操作。Move/placement 拒绝自身和 descendant。Merge 预检查目标路径与 frontmatter 冲突；目标属性优先，非冲突来源属性合入目标，正文追加后移动资源并删除来源。新 Node Note 默认为空白；Folder Nodes 不执行内容模板。

## Visual 解析

Visual Core 按声明顺序选择第一个有效候选：Emoji、已知 Lucide、Vault image wikilink 或 CSS color。`lucide:` 与 `color:` 是可选消歧前缀。VisualService 解析 Metadata Cache、Vault image resource URI 和最近祖先继承；渲染层只消费已解析的 `NodeVisual`。Core 仍可返回 fallback 供语义判断，但 Explorer、标题与 Contents 不为未声明 visual 的节点增加大文件夹图标。

## Explorer 与 Contents

ExplorerAdapter 仅封装 File Explorer 宿主边界：插入一个幂等的置顶 Root 行、装饰可见 DOM、隐藏 canonical note、按设置在名称前/后渲染或隐藏 Node Visual、装饰可选的 Markdown inline title、执行受保护的 reveal、按当前 `.tree-item-icon.collapse-icon` 与旧 indicator 识别 disclosure control，并把 drag zone 映射到 before、into、after placement。Explorer 与 Contents 都把相对放置交给 NodeService，避免重复计算 parent/index。

Contents View 只查询当前 Node 的 direct children 与 direct files；每批最多 200 项。纯 UI interaction helpers 定义内部 drag MIME、受支持 payload、三段 zone 和键盘菜单手势；View 只持有一次 drag session 与一个 drop marker。Node drop 调用 `placeNodeRelative`/`placeNode`；普通文件 drop 调用 FileManager-backed `moveFile`，只接受 into。菜单 action 由 App 层集中创建。健康与问题 Node 的菜单保持 Folder Nodes-owned，不触发 `file-menu`；普通文件、相册条目与未管理文件夹才用独立 source 触发 `file-menu`，允许其他插件扩展而不重复 Folder Nodes 自己的动作。相册图片通过 Vault resource URI 加载到非 DOM `Image`，再绘制一次到 canvas，因此包括 GIF 在内都保持静态且不读取 Vault binary。视频和音频从不创建播放元素。

## 一致性与失败关闭

Managed 状态把同目录事件合并后局部处理。内部操作使用 suppression 避免回声；叶子笔记精确路径和忽略文件夹完整子树在扫描与事件调和中共同生效。唯一且无损的缺失 Node Note 可以重建，路径碰撞、循环、selection 变化和 merge property 冲突停止操作。初始化与迁移先扫描再提交，Health 不持有提交动作；正式 Vault 部署、源码测试、打包候选和主机验收是独立证据。
