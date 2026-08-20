---
source_language: zh-CN
translation_status: source
---

# Folder Nodes 测试策略

## 自动化测试

单元测试覆盖路径、选区命名、frontmatter 最小修改、迁移冲突和稀疏排序。覆盖率门禁为 statements 80%、lines 80%、functions 75%、branches 70%。

## 性能测试

10,000 个直接子节点的常规排序必须只产生一个属性 patch，并在两秒内完成计划计算。

## 主机验收

只在隔离 Vault 验收插件加载、两页设置、节点创建、选区 aliases、迁移预览、资源管理器打开、内容视图与回收站删除。

## 正式部署

正式 Vault 部署不是验收替代品。部署前后核对三个运行文件哈希，保留已有 data.json，并单独记录启用状态。
