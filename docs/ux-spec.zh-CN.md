---
source_language: zh-CN
translation_status: source
---

# Folder Nodes 交互规范

## Obsidian 一致性

界面使用 Obsidian 原生 Setting、Menu、Modal、Notice、主题变量、图标和键盘焦点。桌面最小目标 36px，粗指针为 44px。设置分为“常规”和“选区与命名”两类；语言下拉框使用 `Auto`、`简体中文`、`English`，其中 Auto 跟随 Obsidian。

## 选区创建

选中文字后的编辑器右键菜单与命令面板都显示“从选中文字创建 Folder Node”。确认弹窗同时显示父 Node、最终 Node Note 路径、alias 和 WikiLink；选区在确认前改变则停止创建。aliases 开关不改变 basename，前后缀也不改变 alias。

## Explorer Node Tree

点击 folder title 打开 Node Note，disclosure arrow 只展开或折叠。canonical Node Note 行隐藏。拖拽时必须显示 before line、into highlight 或 after line；drop 前不得修改 Vault。节点右键菜单复用创建、Contents、Visual、rename、move、merge、reorder 和 trash actions。

## Node Contents View

侧栏顶部显示 breadcrumb、当前 Node visual、标题和 New child node。Nodes 使用 visual cards；Files 使用图片 thumbnail cards 或 PDF、Audio、Video、generic typed cards。Sections 可折叠，宽侧栏使用 grid，窄侧栏自动使用 compact layout。每批最多渲染 200 项，图片使用 lazy loading。

## Visual Picker

用户可输入 Emoji、Lucide 名称、CSS 颜色或 Vault image wikilink，并可使用稳定预设。留空删除当前 `icon`。无有效声明时显示 fallback；打开继承后使用最近祖先 visual，并在 DOM 中保留继承来源用于提示。

## 迁移与健康

迁移和 Health 使用同一个只读摘要模型：叶子 Markdown、缺失 Node Note 和阻塞冲突。零变更时提交按钮禁用；冲突存在时禁止提交。进度条只在明确提交后推进，失败显示安全停止通知。
