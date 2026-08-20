---
source_language: zh-CN
translation_status: source
---

# Folder Nodes 架构

## 身份与持久化

节点身份是当前规范化 Vault 路径和 `A/A.md` 结构。只使用 `aliases`、`icon`、`folderNodeSort`、`folderNodeOrder`，不使用 `_pkwf.id`。

## 分层

纯 Core 负责路径、命名、迁移计划、排序与最小 frontmatter patch；Adapter 封装 Vault 和资源管理器；App/UI 提供命令、设置、迁移和内容视图。

## 排序

稀疏整数默认间隔 1024。存在空隙时只写移动节点；无空隙时最多先局部重排 64 项，再退化为当前父节点全量物化。

## 一致性

Managed 状态监听 Vault 事件。唯一且无损的缺失节点笔记可以重建；歧义、覆盖和循环移动必须失败关闭。
