---
source_language: zh-CN
translation_status: source
---

# Folder Nodes 架构

## 身份与持久化

Node 的当前身份是规范化 Vault folder path 与 `A/A.md` 结构，不存在稳定 ID。Folder Nodes 主动使用 `aliases`、`icon`、`folderNodeChildrenSort` 和 `folderNodeSiblingRank`。`aliases` 与 `icon` 是可移植内容属性；两个 `folderNode` 字段是插件结构属性。Managed、Migrating、Unadopted 状态和界面设置保存在插件 `data.json`。

## 分层

Core 只处理路径、命名、模板 token、迁移计划、稀疏排序、frontmatter 最小 patch 和 Visual declaration 解析。Adapters 封装 Vault、Metadata Cache、File Explorer、资源 URI 与 Node 操作。UI/App 提供本地化、设置、命令、菜单、弹窗、Visual Picker 和 Contents View。公开仓库不依赖本地工作区或个人 Vault。

## 排序引擎

自然模式按 Unicode 规范化 basename 做 numeric-aware 排序且不写属性。第一次明确手动 placement 时，父 Node 写 `folderNodeChildrenSort: manual`，当前直接 Child Nodes 以 1024 间隔物化 `folderNodeSiblingRank`。有空隙时只 patch moved Node；无空隙时最多 rebalance 64 个邻居，再退化为当前父节点的完整 rank 物化，但从不把子节点数组写进父 Note。

## Node 操作

NodeService 把 create、rename、move、place、merge 和 trash 作为完整目录操作。Move/placement 拒绝自身和 descendant。Merge 预检查目标路径与 frontmatter 冲突；目标属性优先，非冲突来源属性合入目标，正文追加后移动资源并删除来源。模板在创建前仅替换固定 token，不执行代码。

## Visual 解析

Visual Core 按声明顺序选择第一个有效候选：Emoji、已知 Lucide、Vault image wikilink 或 CSS color。`lucide:` 与 `color:` 是可选消歧前缀。VisualService 解析 Metadata Cache、Vault image resource URI 和最近祖先继承；渲染层只消费已解析的 `NodeVisual`，无效值使用 folder fallback。

## Explorer 与 Contents

ExplorerAdapter 仅装饰可见 File Explorer DOM，隐藏 canonical note，渲染 Node Visual，区分 folder title 点击与 disclosure arrow，并把 drag zone 映射到 before、into、after placement。Contents View 只查询当前 Node 的 direct children 与 direct files；每批最多 200 个 card，图片只使用 resource URI 与 lazy loading，宽窄布局由 container CSS 自动决定。

## 一致性与失败关闭

Managed 状态把同目录事件合并后局部处理。内部操作使用 suppression 避免回声；唯一且无损的缺失 Node Note 可以重建，路径碰撞、循环、selection 变化和 merge property 冲突停止操作。迁移先扫描再提交，正式 Vault 部署、源码测试、打包候选和主机验收是独立证据。
