# crabclaw - 专业级桌面 AI Agent 平台

<div align="center">

![版本](https://img.shields.io/badge/version-5.0.0-blue.svg)
![许可证](https://img.shields.io/badge/license-MIT-green.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)
![状态](https://img.shields.io/badge/status-active-success.svg)

**专业级桌面 AI Agent 平台 | 工具系统 | 任务规划 | 记忆系统 | 技能编排 | 多Agent协作**

[English](README.md) | [简体中文](README_zh.md)

</div>

---

## 📖 目录

- [简介](#简介)
- [核心特性](#核心特性)
- [架构设计](#架构设计)
- [项目结构](#项目结构)
- [快速开始](#快速开始)
- [安装配置](#安装配置)
- [使用指南](#使用指南)
- [API 参考](#api-参考)
- [开发指南](#开发指南)
- [部署运维](#部署运维)
- [常见问题](#常见问题)

---

## 📖 简介

### 项目背景

**crabclaw** 是一个专业级的桌面 AI Agent 平台，旨在为开发者和用户提供一个功能完善、可扩展的 AI Agent 开发框架。平台采用现代化的分层架构设计，集成了 MCP (Model Context Protocol) 协议、智能任务规划、统一工具系统、记忆系统、技能编排、多 Agent 协作等核心能力。

### 设计目标

1. **模块化架构** - 高度解耦，便于扩展和维护
2. **标准化协议** - 支持 MCP 协议，实现工具互操作
3. **AI 原生** - 专为 AI 驱动设计，工具选择、任务规划均由 AI 完成
4. **桌面集成** - 原生桌面应用，支持跨平台部署
5. **生产就绪** - 完整的错误处理、日志记录、监控告警

### 核心问题解决

| 问题 | crabclaw 解决方案 |
|------|-------------------|
| 工具调用碎片化 | 统一工具注册表，支持 MCP 协议标准化 |
| 任务规划复杂 | 智能任务拆解，自动依赖管理 |
| 记忆管理困难 | 双模记忆系统，短期+长期分层管理 |
| 多 Agent 协作 | 完整的多 Agent 协调机制 |
| 持续学习能力不足 | 经验图谱+反思机制，持续优化 |

---

## ✨ 核心特性

| 特性 | 说明 |
|------|------|
| 🧠 **智能任务规划** | 自动拆解复杂任务为可执行步骤，支持依赖管理和优化排序 |
| 🔧 **统一工具系统** | 8+ 内置工具，MCP 工具适配，AI 驱动的工具自主选择 |
| 💾 **双模记忆系统** | 短期对话上下文 + 长期持久化记忆，支持语义搜索 |
| 🎯 **技能编排** | JSON 定义的可复用技能，步骤编排执行，热加载 |
| ⚡ **任务队列** | 并发控制、优先级调度、重试机制、超时处理 |
| 📊 **状态追踪** | 完整的 Agent 生命周期管理，11 种状态追踪 |
| 🔌 **MCP 集成** | 支持标准 Model Context Protocol 协议，11 个内置服务器 |
| 🤖 **多 Agent 协作** | 子任务分解、并行执行、结果汇总 |
| 📈 **深度学习反思** | 经验总结、因果分析、策略优化 |
| 🔗 **桥接系统** | 跨语言调用、系统命令执行 |
| 🌐 **WebSocket 通信** | 实时通信、进度推送、事件订阅 |
| 📦 **插件系统** | 模块化架构、热插拔支持 |

---

## 🏗️ 架构设计

### 设计原则

1. **分层职责** - 每一层只关注自己的职责
2. **依赖倒置** - 高层模块不依赖低层模块
3. **接口隔离** - 使用小而专的接口
4. **开闭原则** - 对扩展开放，对修改关闭

### 系统架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          crabclaw 整体架构                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      Presentation Layer (展示层)                      │   │
│  │  ┌────────────────────────────────────────────────────────────────┐ │   │
│  │  │                    Vue 3 + Element Plus                         │ │   │
│  │  │  ChatView | AgentsView | TasksView | SkillsView | SettingsView  │ │   │
│  │  └────────────────────────────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                       Service Layer (服务层)                         │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────┐  │   │
│  │  │Agent Service │ │Task Service  │ │Skill Service │ │LLM Service │  │   │
│  │  └──────────────┘ └──────────────┘ └──────────────┘ └────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        Core Layer (核心层)                            │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────┐  │   │
│  │  │Task Planner  │ │Tool Registry│ │Memory Manager│ │Bridge Svc  │  │   │
│  │  └──────────────┘ └──────────────┘ └──────────────┘ └────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      Learning Layer (学习层)                          │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────┐  │   │
│  │  │Experience    │ │Pattern       │ │Strategy      │ │Reflection  │  │   │
│  │  │Graph         │ │Library       │ │Optimizer     │ │Mechanism   │  │   │
│  │  └──────────────┘ └──────────────┘ └──────────────┘ └────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 📁 项目结构

```
crabclaw/
├── frontend/                 # Vue 3 前端应用
│   ├── src/
│   │   ├── components/       # 可复用 Vue 组件
│   │   ├── views/            # 页面视图
│   │   ├── composables/      # Vue 组合式函数
│   │   ├── router/           # Vue Router 配置
│   │   ├── i18n/             # 国际化
│   │   └── utils/            # 工具函数
│   └── index.html
├── server/                   # Node.js 后端服务
│   ├── agents/               # Agent 实现
│   ├── core/                 # 核心服务器功能
│   ├── handlers/            # 请求处理器
│   ├── learning/            # 学习和反思
│   ├── llm/                 # LLM 提供商和网关
│   ├── memory/              # 记忆管理
│   ├── routes/              # API 路由
│   ├── services/            # 业务服务
│   ├── skills/              # 技能系统
│   └── tools/               # 工具实现
├── docs/                     # 文档
│   ├── guides/              # 用户指南
│   ├── technical/           # 技术文档
│   ├── reports/             # 项目报告
│   └── research/           # 研究分析
├── data/                     # 数据文件
└── bin/                      # 可执行文件
```

---

## 🚀 快速开始

### 环境要求

- Node.js 18+ (用于 npm 包管理)
- Neutralinojs CLI (`npm install -g @neutralinojs/neu`)

### 安装步骤

```bash
# 克隆仓库
git clone git@github.com:skyhorse-x/crabclaw.git
cd crabclaw

# 安装依赖
bun install

# 使用 Neutralino 启动开发服务器
neu run
```

### 配置

1. 复制 `server/.env.example` 到 `server/.env`
2. 配置你的 LLM 提供商 API 密钥
3. 使用 `neu run` 启动服务器

---

## 🔧 配置说明

### LLM 配置

在 `server/.env` 中配置你的 LLM 提供商：

```env
OPENAI_API_KEY=your-api-key
ANTHROPIC_API_KEY=your-api-key
OLLAMA_BASE_URL=http://localhost:11434
```

### MCP 服务器

MCP 服务器配置位于 `server/mcp-config.json`。

---

## 📖 使用指南

### 聊天界面

主要聊天界面支持：
- 自然语言对话
- 文件操作
- 代码生成和审查
- 任务委托

### Agent 管理

创建和管理具有不同能力的多个 AI Agent：
- 系统 Agent - 中央协调器
- MCP Agent - 工具执行
- 智能 Agent - AI 驱动决策

### 技能市场

从市场浏览和安装技能，或使用 JSON 定义创建你自己的技能。

---

## 📡 API 参考

### 聊天 API

```http
POST /api/chat
Content-Type: application/json

{
  "message": "你的消息",
  "agentId": "agent-1",
  "context": {}
}
```

### Agent API

```http
GET /api/agents - 获取所有 Agent 列表
POST /api/agents - 创建新 Agent
GET /api/agents/:id - 获取 Agent 详情
DELETE /api/agents/:id - 删除 Agent
```

### 任务 API

```http
GET /api/tasks - 获取所有任务
POST /api/tasks - 创建新任务
GET /api/tasks/:id - 获取任务详情
PUT /api/tasks/:id - 更新任务
```

---

## 🔨 开发指南

### 项目初始化

```bash
# 安装开发依赖
bun install

# 运行类型检查
npm run typecheck

# 运行代码检查
npm run lint

# 运行测试
npm test
```

### 构建

```bash
# 构建前端
npm run frontend:build

# 使用 Neutralino 构建桌面应用
npm run build:shell
```

### 运行开发

```bash
# 使用 Neutralino 启动
neu run
```

---

## 📦 部署

### 桌面应用

使用 Neutralinojs 构建跨平台桌面应用：

```bash
npm run build:shell
```

可执行文件将生成在 `dist/` 目录。

---

## 🔒 安全

安全配置详情请参阅 [安全配置指南](docs/SECURITY_CONFIG_GUIDE.md)。

---

## 📄 许可证

MIT 许可证 - 详见 LICENSE 文件。

---

## 🔗 相关链接

- [GitHub 仓库](https://github.com/skyhorse-x/crabclaw)
- [克隆仓库](git@github.com:skyhorse-x/crabclaw.git)
- [MCP 协议文档](https://modelcontextprotocol.io)
- [Neutralinojs 文档](https://neutralino.js.org)
- [Bun 运行时文档](https://bun.sh)

---

[English](README.md) | 简体中文
