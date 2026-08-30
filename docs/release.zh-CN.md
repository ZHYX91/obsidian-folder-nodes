---
source_language: zh-CN
translation_status: source
---

# Folder Nodes — 发布流程

## 版本与候选

`package.json`、`manifest.json`、`versions.json` 和 CHANGELOG 必须使用同一版本。候选只包含同一次 production build 生成的 `main.js`、`manifest.json`、`styles.css` 与版本化 zip。构建后记录 commit、tree、文件大小和 SHA-256；后续步骤不得重新构建替换候选。

## 发布门禁

候选前运行 `npm ci`、`npm run check` 和 `npm run release:check`。普通检查包含公共元数据、
精确 production 文件集合与 vendored release-core 校验；发布门禁还检查本地 tag 状态并运行两档
目录 benchmark。隔离 Vault 主机验收必须绑定 exact candidate。桌面端覆盖五页设置、主页、Explorer/标题图标、disclosure arrow、Explorer/Contents Node 拖拽、Contents 三类菜单与键盘入口、普通文件 into 移动及冲突拒绝、选区右键、Visual、静态相册、两类豁免、详细维护预览、只读 Health 和删除。还要覆盖节点图谱的全局/子树/局部渐进默认、局部父级上下文且不扩出兄弟、多分支、普通/Alt/范围展开、仅会话展开及重启安全默认、旧关系状态迁移、SearchComponent 展开/恢复、外部聚焦、链接默认关闭且可独立开启、节点菜单、Tooltip 与键盘、窄窗口换行、2D/3D 共用选择，以及无覆盖提示的大图安全。必须单独确认 Folder Nodes 未创建 GIF、视频或音频播放控件。

节点图谱的仓库/桌面候选交接要求窄屏、粗指针和触控自动化覆盖，但不把真实 Android 运行设为阻塞门；未运行时必须记录为“未覆盖”，绝不能写成已通过。另行授权的移动端验收可使用当前模拟器，覆盖节点图谱范围、把手、搜索、2D/3D、触控目标和重启，并同时覆盖既有的无 draggable、原生移动、菜单、rank 与窄屏场景。模拟器、真机和 iOS 结论不得互相替代，本流程不暗示任何 iOS 结果。

## Git 与 GitHub

本地 commit、push、tag、GitHub Release、Obsidian community submission 和正式 Vault 部署是独立动作。Commit 使用正常 Git 身份与 Conventional Commit subject。没有用户明确授权不得 push、创建 tag、发布 Release 或提交社区目录。

使用 vendored release core 构建一次确定性 candidate handoff。Workspace 分别记录 candidate
envelope、通过的 acceptance closure，以及只绑定该候选的明确发布授权。在已验收 commit 上创建
精确数值 tag 仍是独立且需要明确授权的动作；推送 tag 本身不会触发发布。

手动 workflow 默认只读 `verify`。Workspace 只有在提供精确 candidate commit、candidate /
envelope / closure / authorization 摘要，以及原始可移植 closure 与 authorization 字节时，才
派发 `publish`。验证任务重建候选并上传唯一固定 artifact；写权限任务解码并严格校验证据，
通过 core publication boundary 后，在任何写入前先只读检查 GitHub：Release 不存在才允许暂存、
签发 provenance 和创建；既有 Release 只有字节与 provenance 全部精确通过时才按零写入安全重跑
接受；任何冲突都在这些写入前失败。`publish-github` 会重复边界与既有状态检查。独立
post-verification 任务回读 hosted bytes、资产元数据、tag 身份与 provenance；否则必须提升
版本，绝不覆盖、编辑或追加同 tag 资产。`candidate.json` 与 `SHA256SUMS` 只存在于 workflow handoff，公共 Release
固定为三个 loose assets 与版本化 ZIP。

## 正式 Vault

源码、PR 与隔离候选完成后默认停止，不部署正式 Vault；只有用户另行授权 exact Vault 才进入部署。部署前确认 exact Vault、插件 ID 和 Obsidian 进程。保留现有 `data.json`；只复制 exact candidate 的三个运行文件，部署后重新计算哈希并确认 enabled 状态。正式 Vault 不能运行迁移 fixture 或自动 destructive acceptance。

## 发布内容

Release notes 只列实际实现且已验证的功能、迁移说明、受支持属性契约、兼容性和已知限制。受支持属性契约包括 `aliases`、`icon`、`folderNodeChildrenSort`、`folderNodeSiblingRank`。截图必须来自已验收 Obsidian 主机且不得包含私人 Vault 信息。
