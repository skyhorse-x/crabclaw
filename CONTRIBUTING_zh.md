# 贡献指南

感谢您对 HelixAgent 项目的关注！本文档提供了贡献代码的指南和说明。

---

## 📋 目录

- [行为准则](#行为准则)
- [入门指南](#入门指南)
- [开发环境配置](#开发环境配置)
- [进行更改](#进行更改)
- [提交更改](#提交更改)
- [代码规范](#代码规范)
- [测试](#测试)
- [报告问题](#报告问题)

---

## 🤝 行为准则

本项目遵循所有贡献者都应遵守的行为准则。请在所有互动中保持尊重和建设性。

### 我们的标准

- 使用受欢迎和包容性的语言
- 尊重不同的观点和经历
- 优雅地接受建设性的批评
- 专注于对社区最有利的事情
- 对其他社区成员表示同情

---

## 🎯 入门指南

### 环境要求

- Node.js 18+ 或 Bun 1.0+
- TypeScript 5.0+
- Git

### Fork 仓库

1. 在 GitHub 上 Fork 仓库
2. 克隆你的 Fork 到本地：
   ```bash
   git clone git@github.com:skyhorse-x/crabclaw.git
   cd crabclaw
   ```

3. 添加上游远程仓库：
   ```bash
   git remote add upstream https://github.com/skyhorse-x/crabclaw.git
   ```

---

## 🔧 开发环境配置

### 安装依赖

```bash
bun install
```

### 配置环境变量

1. 复制环境变量文件：
   ```bash
   cp server/.env.example server/.env
   ```

2. 编辑 `server/.env` 配置你的设置

### 运行开发服务器

```bash
neu run
```

---

## ✏️ 进行更改

### 创建分支

为你的更改创建一个分支：

```bash
git checkout -b feature/你的功能名称
# 或
git checkout -b fix/你的修复名称
```

### 保持分支更新

定期从上游仓库拉取更新：

```bash
git fetch upstream
git rebase upstream/main
```

### 进行更改

对代码库进行更改。请确保：

- 遵循现有代码风格
- 编写清晰、有文档的代码
- 为新功能编写测试
- 根据需要更新文档

---

## 📤 提交更改

### 提交更改

编写清晰、简洁的提交信息：

```
feat: 添加新的 MCP 服务器集成

- 添加对文件系统 MCP 服务器的支持
- 更新工具注册表以处理新服务器
- 添加集成测试
```

### 推送更改

将分支推送到你的 Fork：

```bash
git push origin feature/你的功能名称
```

### 创建 Pull Request

1. 进入 GitHub 上的原始仓库
2. 点击 "New Pull Request"
3. 选择你的分支
4. 填写 PR 模板：
   - **标题**：清晰、描述性的标题
   - **描述**：解释做了什么以及为什么
   - **截图**：如果有 UI 更改
   - **测试**：描述你如何测试的

### PR 审核流程

- 维护者将审核你的 PR
- 处理任何反馈或请求的更改
- 批准后，你的 PR 将被合并

---

## 📏 代码规范

### TypeScript

- 使用严格的 TypeScript 模式
- 尽可能避免使用 `any` 类型
- 使用接口定义对象结构
- 明确导出类型

### Vue 组件

- 使用 Composition API 和 `<script setup>`
- Props 应该类型化
- 使用计算属性处理派生数据
- 遵循 Vue 3 最佳实践

### 错误处理

- 始终使用 try-catch 处理错误
- 提供有意义的错误消息
- 适当记录错误
- 从 API 返回正确的错误响应

### 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 变量 | camelCase | `userName`, `isActive` |
| 常量 | UPPER_SNAKE | `MAX_RETRY_COUNT` |
| 函数 | camelCase | `getUserData()` |
| 类 | PascalCase | `UserService` |
| 接口 | PascalCase | `UserProfile` |
| 文件 | kebab-case | `user-service.ts` |

---

## 🧪 测试

### 运行测试

```bash
bun test
```

### 编写测试

- 为所有新功能编写测试
- 保持测试覆盖率
- 使用描述性的测试名称

```typescript
describe('UserService', () => {
  it('应该创建新用户', async () => {
    const user = await userService.create({
      name: '测试用户',
      email: 'test@example.com'
    });
    expect(user.id).toBeDefined();
  });
});
```

---

## 🐛 报告问题

### 创建问题之前

- 先搜索现有问题
- 使用最新版本验证问题
- 在干净的环境中检查是否复现

### 创建问题

使用 [问题模板](./.github/ISSUE_TEMPLATE/) 并包括：

- HelixAgent 版本
- 操作系统
- Node.js/Bun 版本
- 复现问题的清晰步骤
- 预期与实际行为
- 相关的日志或截图

---

## 📜 许可证

通过贡献代码，你同意你的贡献将在 MIT 许可证下获得许可。

---

## 🙏 感谢您

您的贡献使开源社区成为一个学习和创作的绝佳场所。感谢您的时间和努力！

---

## 🔗 相关链接

- [项目仓库](https://github.com/skyhorse-x/crabclaw)
- [问题跟踪器](https://github.com/skyhorse-x/crabclaw/issues)
- [讨论区](https://github.com/skyhorse-x/crabclaw/discussions)

---

English | [简体中文](./CONTRIBUTING_zh.md)
