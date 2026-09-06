---
source_language: zh-CN
translation_status: source
---

# Folder Nodes — 发布流程

本文定义 Folder Nodes 的可重复发布流程。源码、Candidate Bundle、产品验收、GitHub 发布与正式
Vault 部署保持独立。

## 边界

获授权的稳定版本 tag push 触发发布。也可在同一 tag 上手动派发，选择只验证或发布，两种入口共用工作流。宿主验收可选；发布不会部署到 Vault。

## 版本与源码

`manifest.json`、`package.json`、`package-lock.json`、`versions.json` 与 CHANGELOG 必须使用同一
规范版本并绑定精确 commit/tree。干净工作树必须通过 `npm run release:check`，包括 ordering
quick/large guardrail 与 tag identity 门禁。

## Candidate Bundle v3

vendored release-core `3.0.0` 和薄 adapter 创建唯一 Candidate Bundle v3，包含 `main.js`、
`manifest.json`、`styles.css`、`folder-nodes-x.y.z.zip`、`SHA256SUMS` 与
`candidate-bundle.json`。Bundle 同时绑定工具链、core/config/workflow、产品 payload、场景合同
与全部 fixture 哈希，不存在 receipt 或 envelope 双栈。

## 可选产品验收

使用同一 Bundle 开展桌面和 Android 模拟器验收，覆盖规范 `folder-nodes` 列表、旧字段兼容与
显式属性迁移、隐藏节点及继承后代、Root 行会话眼睛、分组节点动作、结构预览、selection 创建、
sparse ordering，以及 Node Graph 的 scope、只由属性控制的子树隐藏、handle、搜索、2D/3D、
触摸目标和重启。Android 真机与 iOS 不在范围内。

## 独立工作流

tag push 与手动派发共用构建、发布和发布后验证任务。只读构建任务生成并验证 Bundle；发布任务下载同一固定资产，不重复构建，在写入前验证事件、tag、提交和 Bundle 摘要。手动 verify 模式不执行发布。

## 发布与核验

Actions 为四个公开资产生成 SLSA 构建证明。发布器核对其源码、tag 和工作流，创建草稿，下载并检查全部草稿资产，然后正式发布 immutable Release。独立任务再检查已发布资产。公开附件仅为三个松散文件和版本 ZIP；Bundle 元数据保留在 CI artifact 中。GitHub 发布结果与 Community Directory 审核结果分别记录。

## 失败、回退与部署

既有同 tag Release 只有完全一致时才是零写 no-op；任何差异都失败且不得覆盖，修复使用新版本。
正式 Vault 部署需对精确 Vault 单独授权并保留 `data.json`；隔离 Vault 或模拟器结果不能替代正式
部署授权。
