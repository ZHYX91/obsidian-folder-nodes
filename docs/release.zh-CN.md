---
source_language: zh-CN
translation_status: source
---

# Folder Nodes — 发布流程

本文定义 Folder Nodes 的可重复发布流程。源码、Candidate Bundle、产品验收、GitHub 发布与正式
Vault 部署保持独立。

## 边界

普通 tag push 不触发发布。commit、push、tag、workflow dispatch、GitHub Release 与正式 Vault
部署分别授权；任何门禁通过都不会扩大授权范围。

## 版本与源码

`manifest.json`、`package.json`、`package-lock.json`、`versions.json` 与 CHANGELOG 必须使用同一
规范版本并绑定精确 commit/tree。干净工作树必须通过 `npm run release:check`，包括 ordering
quick/large guardrail 与 tag identity 门禁。

## Candidate Bundle v3

vendored release-core `2.0.0` 和薄 adapter 创建唯一 Candidate Bundle v3，包含 `main.js`、
`manifest.json`、`styles.css`、`folder-nodes-x.y.z.zip`、`SHA256SUMS` 与
`candidate-bundle.json`。Bundle 同时绑定工具链、core/config/workflow、产品 payload、场景合同
与全部 fixture 哈希，不存在 receipt 或 envelope 双栈。

## 产品验收

同一 Bundle 必须通过桌面和 Android 模拟器验收，覆盖隐藏节点及继承后代、session reveal、
preview-first migration、selection 创建、sparse ordering，以及 Node Graph 的 scope、handle、搜索、
2D/3D、触摸目标和重启。Android 真机与 iOS 不在范围内。

## 独立工作流

生成并签入的 standalone workflow 只接受显式 `workflow_dispatch`。只读 verify job 在精确
commit 上执行一次独立安装与一次完整 `release:check`，重建并 source-verify Bundle；publish
job 下载该 artifact 后只做 transport verification，不恢复 `dist`。

## 发布与核验

通过的 closure 不授权发布；单独 authorization 绑定同一 Bundle 与 closure。首次 mutation 前
workflow 深度验证两份记录、标签和只读 preflight。公共 Release 恰好包含三个 loose assets 与
版本 ZIP；`SHA256SUMS` 和 `candidate-bundle.json` 仅属于私有 Bundle。发布后回读全部托管字节
与 provenance。

## 失败、回退与部署

既有同 tag Release 只有完全一致时才是零写 no-op；任何差异都失败且不得覆盖，修复使用新版本。
正式 Vault 部署需对精确 Vault 单独授权并保留 `data.json`；隔离 Vault 或模拟器结果不能替代正式
部署授权。
