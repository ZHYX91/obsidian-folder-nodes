---
source_language: zh-CN
translation_status: source
---

# Folder Nodes — 发布流程

## 版本与候选

`package.json`、`manifest.json`、`versions.json` 和 CHANGELOG 必须使用同一版本。候选只包含同一次 production build 生成的 `main.js`、`manifest.json`、`styles.css` 与版本化 zip。构建后记录 commit、tree、文件大小和 SHA-256；后续步骤不得重新构建替换候选。

## 发布门禁

候选前运行 `npm ci`、`npm run check`、`npm run release:check` 和大目录 benchmark。隔离 Vault 主机验收必须绑定 exact candidate。四页设置、主页、Explorer/标题图标、disclosure arrow、Explorer/Contents Node 拖拽、Contents 三类菜单与键盘入口、普通文件 into 移动及冲突拒绝、选区右键、Visual、静态相册、两类豁免、详细维护预览、只读 Health 和删除等主机能力没有日期证据时，不得在 README 或 release notes 中宣称已通过。必须单独确认 Folder Nodes 未创建 GIF、视频或音频播放控件。

## Git 与 GitHub

本地 commit、push、tag、GitHub Release、Obsidian community submission 和正式 Vault 部署是独立动作。Commit 使用正常 Git 身份与 Conventional Commit subject。没有用户明确授权不得 push、创建 tag、发布 Release 或提交社区目录。

创建 tag 前，从当前远端默认分支 HEAD 手动运行只读 Release preflight，并输入计划版本；它要求
远端 tag 与同版本 Release 尚不存在，运行完整门禁并生成手动安装 ZIP，但不发布。推送数值 tag
后才进入写权限阶段。失败的 tag workflow 可以安全重跑：只有既有 Release 为稳定、不可变、精确
四资产、字节与当前候选一致，且四项 provenance 均绑定同一 tag 和 commit 时，才按成功 no-op
接受；否则必须提升版本，绝不覆盖、编辑或追加同 tag 资产。`SHA256SUMS` 只存在于 workflow
handoff，公共 Release 固定为三个 loose assets 与版本化 ZIP。

## 正式 Vault

正式部署前确认 exact Vault、插件 ID 和 Obsidian 进程。保留现有 `data.json`；只复制 exact candidate 的三个运行文件，部署后重新计算哈希并确认 enabled 状态。正式 Vault 不能运行迁移 fixture 或自动 destructive acceptance。

## 发布内容

Release notes 只列实际实现且已验证的功能、迁移说明、受支持属性契约、兼容性和已知限制。受支持属性契约包括 `aliases`、`icon`、`folderNodeChildrenSort`、`folderNodeSiblingRank`。截图必须来自已验收 Obsidian 主机且不得包含私人 Vault 信息。
