---
source_language: zh-CN
translation_status: source
---

# Folder Nodes 发布规范

## 版本与门禁

manifest、package、lockfile、versions 和无 `v` tag 必须一致。使用 Node 24.18.0、npm 11.16.0，并通过 `npm run release:check`。

## 产物

公开运行文件固定为 `main.js`、`manifest.json`、`styles.css`，压缩包为 `folder-nodes-<version>.zip`。

## CI 与发布

CI 构建一次并上传固定候选；发布任务按 artifact ID 和 digest 下载、校验 SHA256、生成证明，再用已验证 tag 发布并核对不可变资产。

## 动作边界

本地提交、push、tag、GitHub Release、社区插件申请和正式 Vault 部署是独立动作，不能相互推定授权。
