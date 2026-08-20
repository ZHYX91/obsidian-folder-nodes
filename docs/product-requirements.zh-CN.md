---
source_language: zh-CN
translation_status: source
---

# Folder Nodes 产品需求

## 产品目标

受管 Vault 中每个文件夹都是 Folder Node，并且有且仅有同名节点笔记 `A/A.md`；Folder Nodes 不生成永久节点 ID。

## 核心规则

自然排序不写排序属性。手动排序由父节点的 `folderNodeSort: manual` 和子节点自己的稀疏 `folderNodeOrder` 表示。不能在父节点保存完整子节点列表。

## 用户能力

用户可以创建、重命名、移动、安全删除和排序节点；可以从选中文字创建节点，并选择文件名前缀、后缀、连接符、时间戳及 aliases 开关。

## 安全边界

首次接管必须先只读扫描和预览。冲突阻止提交。删除优先进入系统回收站。外部完整 `A/A.md` 不被注入 ID。
