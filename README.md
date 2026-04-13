# HelixAgent - 专业级 Desktop AI Agent 平台

<div align="center">

![Version](https://img.shields.io/badge/version-5.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)
![Status](https://img.shields.io/badge/status-active-success.svg)

**专业级桌面 AI Agent 平台 | 工具系统 | 任务规划 | 记忆系统 | 技能编排 | 多Agent协作**

[English](README_EN.md) | 简体中文

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

**HelixAgent** 是一个专业级的桌面 AI Agent 平台，旨在为用户提供一个功能完善、可扩展的 AI Agent 开发框架。平台采用现代化的分层架构设计，集成了 MCP (Model Context Protocol) 协议、智能任务规划、统一工具系统、记忆系统、技能编排、多 Agent 协作等核心能力。

### 设计目标

1. **模块化架构** - 高度解耦，便于扩展和维护
2. **标准化协议** - 支持 MCP 协议，实现工具互操作
3. **AI 原生** - 专为 AI 驱动设计，工具选择、任务规划均由 AI 完成
4. **桌面集成** - 原生桌面应用，支持跨平台部署
5. **生产就绪** - 完整的错误处理、日志记录、监控告警

### 核心问题解决

| 问题 | HelixAgent 解决方案 |
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

### 整体架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           HelixAgent 整体架构                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      Presentation Layer (展示层)                      │   │
│  │  ┌────────────────────────────────────────────────────────────────┐ │   │
│  │  │                    Vue 3 + Element Plus                         │ │   │
│  │  │  ChatView | AgentsView | TasksView | SkillsView | SettingsView  │ │   │
│  │  └────────────────────────────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                      │                                      │
│                                      ▼                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         API Gateway Layer (网关层)                    │   │
│  │                    HTTP Server + CORS + Auth + Logging               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                      │                                      │
│                                      ▼                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                          Routes Layer (路由层)                        │   │
│  │  ┌─────────┬─────────┬─────────┬─────────┬─────────┬─────────┐        │   │
│  │  │ /health │ /api    │ /api    │ /api    │ /api    │ /api    │        │   │
│  │  │         │ /mcp    │ /agents │ /skills │ /tasks  │ /memory │        │   │
│  │  └─────────┴─────────┴─────────┴─────────┴─────────┴─────────┘        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                      │                                      │
│                                      ▼                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         Services Layer (服务层)                     │   │
│  │  ┌──────────────┬──────────────┬──────────────┬──────────────┐      │   │
│  │  │ MCP Service  │ Agent Svc   │ Skill Svc   │ Memory Svc   │      │   │
│  │  ├──────────────┼──────────────┼──────────────┼──────────────┤      │   │
│  │  │ Task Svc     │ LLM Gateway │ Bridge Svc  │ Cache Svc    │      │   │
│  │  └──────────────┴──────────────┴──────────────┴──────────────┘      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                      │                                      │
│                                      ▼                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                       Agent Core Layer (Agent 核心层)                 │   │
│  │  ┌─────────────────┬─────────────────┬─────────────────┐            │   │
│  │  │    Tools       │    Planner      │    Memory       │            │   │
│  │  │ ┌───────────┐  │ ┌───────────┐   │ ┌───────────┐  │            │   │
│  │  │ │ Registry  │  │ │ TaskPlan │   │ │ ShortMem  │  │            │   │
│  │  │ │ Built-in  │  │ │ Executor │   │ │ LongMem   │  │            │   │
│  │  │ │   MCP     │  │ │ Optimizer│   │ │ Manager   │  │            │   │
│  │  │ └───────────┘  │ └───────────┘   │ └───────────┘  │            │   │
│  │  ├─────────────────┼─────────────────┼─────────────────┤            │   │
│  │  │    Skills      │    Task         │    State        │            │   │
│  │  │ ┌───────────┐  │ ┌───────────┐   │ ┌───────────┐  │            │   │
│  │  │ │ Registry  │  │ │  Queue   │   │ │ State    │  │            │   │
│  │  │ │ Executor  │  │ │ Handlers │   │ │ Manager  │  │            │   │
│  │  │ │  Loader   │  │ │ Scheduler│   │ │ Machine  │  │            │   │
│  │  │ └───────────┘  │ └───────────┘   │ └───────────┘  │            │   │
│  │  ├─────────────────┼─────────────────┼─────────────────┤            │   │
│  │  │    Agents      │   Learning      │    Vision       │            │   │
│  │  │ ┌───────────┐  │ ┌───────────┐   │ ┌───────────┐  │            │   │
│  │  │ │ BaseAgent │  │ │Experience │   │ │ Screen   │  │            │   │
│  │  │ │ Intellig. │  │ │ Reflector │   │ │ Capture  │  │            │   │
│  │  │ │ MultiAge. │  │ │ Strategy  │   │ │ Analyze  │  │            │   │
│  │  │ └───────────┘  │ └───────────┘   │ └───────────┘  │            │   │
│  │  └─────────────────┴─────────────────┴─────────────────┘            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                      │                                      │
│                                      ▼                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                          Bridge Layer (桥接层)                        │   │
│  │  ┌──────────────┬──────────────┬──────────────┬──────────────┐      │   │
│  │  │ MCP Servers  │ File System  │  Shell Cmd   │ 3rd Party    │      │   │
│  │  │ (11 servers) │ (read/write) │  (execute)  │  Services    │      │   │
│  │  └──────────────┴──────────────┴──────────────┴──────────────┘      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 核心模块详解

#### 1. Core Layer (核心层)

| 文件 | 职责 | 关键功能 |
|------|------|---------|
| [server.ts](file:///Users/472733389qq.com/Desktop/学习项目/crabclaw/server/core/server.ts) | HTTP 服务器主入口 | 请求路由、CORS、响应构建 (~150行) |
| [bootstrap.ts](file:///Users/472733389qq.com/Desktop/学习项目/crabclaw/server/core/bootstrap.ts) | 应用初始化 | 配置加载、技能加载、任务调度 |
| [http.ts](file:///Users/472733389qq.com/Desktop/学习项目/crabclaw/server/core/http.ts) | HTTP 服务器封装 | Bun.serve 配置、请求拦截 |

**启动流程**：
```typescript
// 1. bootstrap()      → 初始化配置、技能、MCP
// 2. createHttpServer() → 创建 HTTP 服务器  
// 3. handleRequest()   → 请求路由分发
// 4. gracefulShutdown() → 优雅关闭
```

#### 2. Routes Layer (路由层)

| 路由文件 | 路径前缀 | 职责 |
|---------|---------|------|
| health.routes.ts | `/health`, `/api/health` | 健康检查 |
| mcp.routes.ts | `/api/mcp` | MCP 协议路由 |
| agent.routes.ts | `/api/agents` | Agent 管理 |
| skill-market.routes.ts | `/api/skill-market` | 技能市场 |
| chat-history.routes.ts | `/api/chat-history` | 聊天历史 |
| config.routes.ts | `/api/config` | 配置管理 |
| bridge.routes.ts | `/api/bridge` | 桥接服务 |
| auth.routes.ts | `/api/auth` | 认证授权 |
| system.routes.ts | `/api/system` | 系统管理 |
| remote-control.routes.ts | `/api/remote-control` | 远程控制 |
| scheduled-tasks.routes.ts | `/api/scheduled-tasks` | 定时任务 |

#### 3. Agent Core Layer 详解

##### 3.1 工具系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                     Tool Registry                            │
│                  (统一工具注册表)                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │   Built-in      │  │   MCP Tools     │                   │
│  │   Tools         │  │                 │                   │
│  ├─────────────────┤  ├─────────────────┤                   │
│  │ • FileTool      │  │ • Filesystem    │                   │
│  │   - read_file   │  │ • Memory        │                   │
│  │   - write_file  │  │ • Puppeteer     │                   │
│  │   - delete_file │  │ • Brave Search  │                   │
│  │   - list_dir    │  │ • MySQL         │                   │
│  │                 │  │ • Chrome DevTools│                   │
│  │ • ShellTool     │  │ • Fetch         │                   │
│  │   - execute     │  │ • Shell         │                   │
│  │   - spawn       │  │ • ...           │                   │
│  │                 │  │                 │                   │
│  │ • McpTool       │  │                 │                   │
│  │   - wrap_mcp    │  │                 │                   │
│  └─────────────────┘  └─────────────────┘                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

##### 3.2 任务规划流程

```
User Input: "创建一个 Node.js 项目并部署到服务器"
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│                 LLM + Prompt                          │
│ 分析任务意图 → 识别依赖 → 拆分步骤 → 优化排序        │
└─────────────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│                  Plan Output                          │
│ Step 1: create_directory { path: "./my-app" }        │
│ Step 2: shell { cmd: "npm init -y" }               │
│ Step 3: file/write { path: "package.json", ... }   │
│ Step 4: shell { cmd: "npm install" }                │
│ Step 5: shell { cmd: "npm run build" }             │
│ Step 6: shell { cmd: "deploy.sh" }                 │
└─────────────────────────────────────────────────────┘
```

##### 3.3 记忆系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Memory Manager                            │
│                   (统一记忆管理器)                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                   Short Memory                        │   │
│  │  • TTL: 30 分钟 (可配置)                             │   │
│  │  • 存储: 内存 Map                                    │   │
│  │  • 用途: 当前对话上下文                              │   │
│  │  • 自动过期: ✅                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                 │
│                          │ 定期持久化                       │
│                          ▼                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                   Long Memory                        │   │
│  │  • 存储: SQLite + JSON 文件                         │   │
│  │  • 用途: 跨会话经验积累                              │   │
│  │  • 搜索: 语义相似度搜索                              │   │
│  │  • 持久化: ✅                                      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

##### 3.4 Agent 类型关系

```
┌─────────────────────────────────────────────────────────────┐
│                     Agent Types                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │   BaseAgent     │  │   McpAgent      │                  │
│  │   (抽象基类)     │  │   (MCP封装)     │                  │
│  │                 │◄─│                 │                  │
│  │ + initialize()  │  │ + call_mcp()    │                  │
│  │ + execute()     │  └─────────────────┘                  │
│  │ + getState()    │                                       │
│  └────────┬────────┘                                       │
│           │                                                  │
│    ┌──────┴──────┐                                          │
│    ▼             ▼                                          │
│ ┌─────────────────┐  ┌─────────────────┐                    │
│ │ IntelligentMcp  │  │    MultiAgent   │                    │
│ │ Agent          │  │    System      │                    │
│ │                │  │                │                    │
│ │ AI驱动工具选择  │  │ 子任务分解     │                    │
│ │ + selectTool() │  │ 并行执行       │                    │
│ │ + autoParam()  │  │ 结果汇总       │                    │
│ └─────────────────┘  └─────────────────┘                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

##### 3.5 学习反思流程

```
┌─────────────────────────────────────────────────────────────┐
│                   Learning & Reflection                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                Experience Graph                       │   │
│  │                                                      │   │
│  │  Node: "npm install 成功"                           │   │
│  │    │                                                │   │
│  │    ├──causal_relation──► Node: "网络状态良好"       │   │
│  │    │                                                │   │
│  │    └──similarity───────► Node: "上次安装成功"       │   │
│  │                                                      │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                 │
│                          ▼                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                 Reflection Process                    │   │
│  │                                                      │   │
│  │  1. 执行记录 ──► 分析因果链                         │   │
│  │  2. 识别成功因素 ──► 提取模式                       │   │
│  │  3. 生成建议 ──► 存入经验图谱                       │   │
│  │  4. 策略优化 ──► 更新参数                           │   │
│  │                                                      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 📁 项目结构

### 根目录结构

```
crabclaw/
├── bin/                          # 跨平台可执行文件
│   ├── neutralino-linux_*         # Linux 运行时
│   ├── neutralino-mac_*          # macOS 运行时
│   └── neutralino-win_*.exe       # Windows 运行时
│
├── data/                          # 数据存储
│   ├── experience-graph.json      # 经验图谱
│   ├── pattern-library.json       # 模式库
│   └── strategy-optimizer.json   # 策略优化器
│
├── dist/                          # 构建输出
│   ├── crabclaw-server           # 服务端可执行文件
│   └── desktop-agent-studio/     # 桌面应用
│       ├── linux_x64/
│       ├── mac_arm64/
│       ├── mac_x64/
│       └── win_x64.exe
│
├── docs/                          # 文档
│   ├── guides/                    # 用户指南
│   ├── reports/                   # 技术报告
│   ├── research/                  # 研究分析
│   └── technical/                 # 技术文档
│
├── frontend/                      # 前端 (Vue 3)
│   ├── src/
│   │   ├── views/                # 页面视图
│   │   ├── components/           # 组件
│   │   ├── composables/          # 组合式 API
│   │   ├── router/               # 路由
│   │   └── utils/                # 工具
│   ├── index.html
│   └── vite.config.js
│
├── server/                        # 后端 (Bun)
│   ├── core/                     # 核心层
│   ├── routes/                   # 路由层
│   ├── handlers/                 # 请求处理
│   ├── services/                 # 服务层
│   ├── agents/                   # Agent 系统
│   ├── tools/                    # 工具系统
│   ├── planner/                  # 任务规划
│   ├── memory/                   # 记忆系统
│   ├── skills/                  # 技能系统
│   ├── task/                    # 任务队列
│   ├── state/                   # 状态管理
│   ├── llm/                     # LLM 集成
│   ├── learning/                # 学习系统
│   ├── plugins/                 # 插件系统
│   ├── vision/                  # 屏幕理解
│   ├── bridge/                  # 桥接层
│   ├── concurrency/             # 并发控制
│   ├── middleware/               # 中间件
│   ├── shared/                   # 共享模块
│   ├── data/skills/             # 内置技能
│   └── __tests__/               # 单元测试
│
├── neutralino.config.json        # Neutralinojs 配置
├── package.json                  # 项目依赖
├── tsconfig.json                 # TypeScript 配置
├── vitest.config.ts             # 测试配置
└── README.md                     # 项目文档
```

### 后端目录详解

```
server/
├── core/                         # 核心层 (启动入口)
│   ├── server.ts                 # HTTP 主入口 (~150行)
│   ├── bootstrap.ts              # 应用初始化
│   └── http.ts                   # HTTP 服务器封装
│
├── api/                          # API 路由分发
│   └── routes.ts                 # 统一路由入口
│
├── routes/                        # 路由层 (11个路由文件)
│   ├── index.ts                 # 路由导出
│   ├── mcp.routes.ts            # MCP 路由
│   ├── agent.routes.ts          # Agent 路由
│   ├── skill-market.routes.ts    # 技能市场路由
│   ├── chat-history.routes.ts    # 聊天历史路由
│   ├── config.routes.ts          # 配置路由
│   ├── bridge.routes.ts         # 桥接路由
│   ├── auth.routes.ts            # 认证路由
│   ├── health.routes.ts         # 健康检查路由
│   ├── system.routes.ts         # 系统路由
│   ├── remote-control.routes.ts  # 远程控制路由
│   └── scheduled-tasks.routes.ts # 定时任务路由
│
├── handlers/                      # 请求处理层
│   ├── chat.handler.ts          # 聊天处理器
│   ├── chat-progress.ts         # 进度处理
│   └── system.handler.ts        # 系统处理
│
├── services/                      # 服务层 (25+ 服务)
│   ├── mcp.service.ts           # MCP 服务
│   ├── mcp-tool-registry.ts     # 工具注册表
│   ├── mcp-discovery-service.ts  # 服务发现
│   ├── action.service.ts        # 动作服务
│   ├── bridge.service.ts       # 桥接服务
│   ├── intelligent-agent.service.ts # 智能 Agent
│   ├── enhanced-agent.service.ts   # 增强 Agent
│   ├── enhanced-learning.service.ts # 增强学习
│   ├── multi-agent-coordinator.ts  # 多 Agent 协调
│   ├── reflection.service.ts   # 反思服务
│   ├── experience-store.ts    # 经验存储
│   ├── skill-market.service.ts # 技能市场
│   ├── task-scheduler.service.ts # 任务调度
│   ├── cache.service.ts        # 缓存服务
│   ├── config.service.ts       # 配置服务
│   ├── logger.service.ts       # 日志服务
│   ├── encryption.service.ts   # 加密服务
│   └── index.ts               # 服务导出
│
├── agents/                        # Agent 系统
│   ├── base.agent.ts           # Agent 基类
│   ├── intelligent-mcp-agent.ts # 智能 MCP Agent
│   ├── mcp.agent.ts           # MCP Agent
│   ├── multi-agent-system.ts   # 多 Agent 系统
│   ├── system.agent.ts         # 系统 Agent
│   └── index.ts               # 导出
│
├── tools/                         # 工具系统
│   ├── tool.types.ts          # 类型定义
│   ├── tool-registry.ts       # 工具注册表
│   ├── file.tool.ts          # 文件工具
│   ├── shell.tool.ts         # Shell 工具
│   ├── mcp.tool.ts          # MCP 工具适配
│   └── builtin-tools.service.ts # 内置工具服务
│
├── planner/                       # 任务规划
│   ├── planner.types.ts       # 类型定义
│   └── task-planner.ts        # 任务规划器
│
├── memory/                        # 记忆系统
│   ├── memory.types.ts        # 类型定义
│   ├── memory-manager.ts      # 记忆管理器
│   ├── short-memory.ts        # 短期记忆
│   ├── long-memory.ts         # 长期记忆
│   └── index.ts              # 导出
│
├── skills/                        # 技能系统
│   ├── skill.types.ts         # 类型定义
│   ├── skill-executor.ts      # 技能执行器
│   ├── skill-registry.ts      # 技能注册表
│   └── index.ts              # 导出
│
├── task/                          # 任务队列
│   ├── task.types.ts          # 类型定义
│   ├── task-queue.ts         # 任务队列
│   ├── task-handlers.ts      # 任务处理器
│   └── index.ts             # 导出
│
├── state/                         # 状态管理
│   ├── state.types.ts        # 类型定义
│   ├── agent-state-manager.ts # 状态管理器
│   └── index.ts             # 导出
│
├── llm/                          # LLM 集成
│   ├── gateway.ts            # LLM 网关
│   ├── router.ts             # 路由策略
│   ├── client.ts             # LLM 客户端
│   ├── types.ts             # 类型定义
│   ├── index.ts             # 导出
│   └── providers/           # LLM 提供者
│       ├── openai.ts       # OpenAI
│       ├── anthropic.ts     # Anthropic
│       └── ollama.ts       # Ollama
│
├── learning/                      # 学习系统
│   ├── learning-controller.ts # 学习控制器
│   ├── experience-graph.ts   # 经验图谱
│   ├── pattern-library.ts    # 模式库
│   ├── reflector.ts          # 反思器
│   ├── strategy-optimizer.ts # 策略优化器
│   └── types.ts             # 类型定义
│
├── plugins/                       # 插件系统
│   └── plugin-system.ts      # 插件核心
│
├── vision/                        # 屏幕理解
│   └── screen-understanding.ts # 屏幕理解
│
├── bridge/                        # 桥接层
│   └── action-runner.mjs     # Node.js 执行器
│
├── concurrency/                   # 并发控制
│   └── coroutine-scheduler.ts # 协程调度器
│
├── middleware/                    # 中间件
│   ├── auth.middleware.ts    # 认证中间件
│   └── error.middleware.ts   # 错误中间件
│
├── shared/                        # 共享模块
│   ├── types/                # 类型定义
│   │   ├── api.types.ts
│   │   ├── mcp.types.ts
│   │   ├── skill.types.ts
│   │   ├── system.types.ts
│   │   └── task.types.ts
│   ├── utils/               # 工具函数
│   │   ├── async.util.ts
│   │   ├── common.util.ts
│   │   ├── function.util.ts
│   │   ├── http.util.ts
│   │   └── string.util.ts
│   └── constants.ts         # 常量
│
├── data/skills/                  # 内置技能
│   ├── code-review/
│   ├── create-node-project/
│   ├── wechat-focus/
│   └── xiaohongshu-login/
│
├── __tests__/                    # 单元测试
│   ├── learning/
│   ├── error-recovery.test.ts
│   ├── string.util.test.ts
│   └── websocket.service.test.ts
│
├── .env                          # 环境变量
├── main.ts                       # 服务端入口
├── agent.ts                      # Agent 入口
├── mcp-config.json              # MCP 配置
└── data.db                       # SQLite 数据库
```

### 前端目录结构

```
frontend/
├── src/
│   ├── App.vue                 # 根组件
│   ├── main.ts                 # 前端入口
│   ├── env.d.ts                # 环境变量类型
│   ├── vite-env.d.ts
│   ├── styles.css              # 全局样式
│   │
│   ├── assets/
│   │   └── styles/
│   │       └── common.css     # 公共样式
│   │
│   ├── components/            # Vue 组件
│   │   ├── AgentDashboard.vue # Agent 仪表盘
│   │   ├── AgentOffice3D.vue  # 3D 可视化
│   │   ├── ErrorBoundary.vue # 错误边界
│   │   ├── ErrorNotification.vue # 错误通知
│   │   ├── MonitorPanel.vue   # 监控面板
│   │   └── agents/
│   │       └── AgentCard.vue # Agent 卡片
│   │
│   ├── composables/           # 组合式 API
│   │   ├── useVoiceInput.ts  # 语音输入
│   │   └── useWebSocket.ts   # WebSocket
│   │
│   ├── i18n/                 # 国际化
│   │   └── index.ts
│   │
│   ├── router/               # 路由
│   │   └── index.ts
│   │
│   ├── types/               # 类型
│   │   └── index.ts
│   │
│   ├── utils/              # 工具函数
│   │   ├── api-client.ts
│   │   ├── error-handler.ts
│   │   ├── ERROR_HANDLING_GUIDE.md
│   │   └── QUICK_START.md
│   │
│   └── views/               # 页面视图
│       ├── AgentsView.vue   # Agent 管理
│       ├── ChatView.vue    # 聊天
│       ├── ControlView.vue  # 控制面板
│       ├── McpView.vue     # MCP 管理
│       ├── SettingsView.vue # 设置
│       ├── SkillsView.vue  # 技能市场
│       └── TasksView.vue   # 任务管理
│
├── index.html
├── vite.config.js
├── tsconfig.json
└── .env
```

---

## 🚀 快速开始

### 环境要求

| 要求 | 最低版本 | 推荐版本 | 说明 |
|------|---------|---------|------|
| 操作系统 | macOS 10.14 / Linux / Windows 10 | macOS 12+ | 跨平台支持 |
| Node.js | >= 18 | >= 20 | 前端和部分工具 |
| Bun | >= 1.0 | >= 1.1 | 推荐使用 |
| Git | 任意版本 | 最新版本 | 代码管理 |

### 安装步骤

#### 1. 克隆项目

```bash
git clone https://github.com/qingfeng2055/HelixAgent.git
cd HelixAgent
```

#### 2. 安装依赖

```bash
# 使用 Bun (推荐)
bun install

# 或使用 npm
npm install
```

#### 3. 配置环境变量

```bash
# 复制环境变量模板
cp server/.env.example server/.env

# 编辑配置文件
nano server/.env
```

**最小配置 (server/.env)**：

```bash
# 服务器配置
PORT=17870
NODE_ENV=development

# LLM 配置 (至少选择一个)
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-your-api-key-here
```

#### 4. 启动开发服务器

```bash
# 同时启动前后端 (开发模式)
npm run dev

# 仅启动后端
npm run backend
```

#### 5. 访问应用

打开浏览器访问：
- **前端界面**: http://localhost:5173
- **后端 API**: http://localhost:17870

---

## ⚙️ 安装配置

### 完整环境变量配置

```bash
# ============================================
# 服务器配置
# ============================================
PORT=17870                              # HTTP 服务端口
NODE_ENV=development                    # development | production
HOST=0.0.0.0                           # 监听地址

# ============================================
# LLM 配置
# ============================================
LLM_PROVIDER=openai                    # openai | anthropic | ollama

# OpenAI
OPENAI_API_KEY=sk-xxx
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4-turbo-preview

# Anthropic
ANTHROPIC_API_KEY=sk-ant-xxx
ANTHROPIC_BASE_URL=https://api.anthropic.com
ANTHROPIC_MODEL=claude-3-opus-20240229

# Ollama (本地)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3

# ============================================
# MCP 配置
# ============================================
MCP_SERVERS=filesystem,memory,puppeteer,brave-search
AUTO_DISCOVER_MCP=true

# ============================================
# 记忆系统配置
# ============================================
MEMORY_PERSIST=true
MEMORY_MAX_SHORT=100
MEMORY_MAX_LONG=1000
MEMORY_SHORT_TTL=1800000

# ============================================
# CORS 配置
# ============================================
ALLOWED_ORIGIN=http://localhost:5173

# ============================================
# 日志配置
# ============================================
LOG_LEVEL=info
LOG_FILE=./logs/server.log

# ============================================
# 数据库配置
# ============================================
DB_PATH=./server/data.db

# ============================================
# 安全配置
# ============================================
ENCRYPTION_KEY=your-32-char-key-here
JWT_SECRET=your-jwt-secret-here
```

### MCP 服务器说明

| 服务器 | 用途 | 需要配置 |
|--------|------|---------|
| filesystem | 文件系统操作 | - |
| memory | 知识图谱 | - |
| puppeteer | 浏览器自动化 | - |
| brave-search | 网络搜索 | `BRAVE_API_KEY` |
| chrome-devtools | Chrome 控制 | Chrome 浏览器 |
| mysql | MySQL 数据库 | `MYSQL_*` 环境变量 |
| fetch | HTTP 请求 | - |
| shell | Shell 执行 | - |

---

## 💡 使用指南

### 1. 工具调用

#### 内置工具

```typescript
import { toolRegistry } from './server/tools/tool-registry'

// 读取文件
const result = await toolRegistry.execute('read_file', {
  path: '/tmp/test.txt',
  encoding: 'utf-8'
})
console.log(result.data.content)

// 执行 Shell 命令
const shellResult = await toolRegistry.execute('shell', {
  cmd: 'ls -la',
  timeout: 30000
})
```

#### MCP 工具

```typescript
import { mcpToolRegistry } from './server/services/mcp-tool-registry'

await mcpToolRegistry.initialize()

// AI 驱动的工具选择
const selection = await mcpToolRegistry.selectTool({
  userTask: '读取 /tmp/test.txt 文件内容'
})

console.log(`选择: ${selection.selectedTool.server}/${selection.selectedTool.tool}`)
console.log(`置信度: ${selection.confidence * 100}%`)
```

### 2. 任务规划

```typescript
import { taskPlanner } from './server/planner'

const plan = await taskPlanner.plan({
  goal: '创建一个 Node.js 项目并启动服务器',
  constraints: { timeout: 300000 }
})

console.log(`总步骤数: ${plan.steps.length}`)

for (const step of plan.steps) {
  const result = await taskPlanner.executeStep(step)
  if (!result.success) break
}
```

### 3. 技能执行

```typescript
import { skillRegistry } from './server/skills'

await skillRegistry.loadFromDirectory('./server/data/skills')

const result = await skillRegistry.execute('create-node-project', {
  projectName: 'my-app',
  template: 'typescript'
})

console.log(result.success ? '成功' : `失败: ${result.error}`)
```

### 4. 记忆系统

```typescript
import { memoryManager } from './server/memory'

await memoryManager.initialize()

// 短期记忆
const shortId = await memoryManager.addShort('用户正在创建项目')

// 长期记忆
const longId = await memoryManager.addLong('用户偏好 TypeScript', {
  type: 'preference'
})

// 搜索
const results = await memoryManager.search('TypeScript')
```

### 5. 多 Agent 协作

```typescript
import { multiAgentCoordinator } from './server/services/multi-agent-coordinator'

const result = await multiAgentCoordinator.coordinate({
  id: 'task-001',
  goal: '分析公司财务状况',
  subTasks: [
    { id: 'sub-1', agentType: 'research', goal: '搜索公司信息' },
    { id: 'sub-2', agentType: 'data', goal: '获取财务数据' },
    { id: 'sub-3', agentType: 'analysis', goal: '分析指标' }
  ],
  strategy: 'parallel'
})

console.log(`完成: ${result.completedSubTasks.length}/${result.subTaskResults.length}`)
```

### 6. 经验学习

```typescript
import { reflectionService } from './server/services/reflection.service'

const reflection = await reflectionService.reflect({
  taskId: 'deploy-001',
  goal: '部署 Web 应用',
  steps: [
    { tool: 'shell', args: { cmd: 'npm run build' }, success: true, duration: 15000 }
  ],
  startTime: Date.now() - 30000,
  endTime: Date.now()
})

console.log(`成功程度: ${reflection.successScore}/10`)
```

---

## 📊 API 参考

### 健康检查

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/health` | 健康检查 |
| GET | `/status` | 系统状态 |

### MCP 接口

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/mcp/servers` | 获取服务器列表 |
| GET | `/api/mcp/tools` | 获取所有工具 |
| POST | `/api/mcp/call` | 调用 MCP 工具 |

### Agent 接口

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/agents` | 获取 Agent 列表 |
| POST | `/api/agents/execute` | 执行 Agent |
| GET | `/api/agents/:id/state` | 获取状态 |

### 技能接口

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/skills` | 获取技能列表 |
| POST | `/api/skills/execute` | 执行技能 |

### 任务接口

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/tasks` | 获取任务列表 |
| POST | `/api/tasks` | 创建任务 |
| DELETE | `/api/tasks/:id` | 删除任务 |

### 记忆接口

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/memory/short` | 短期记忆 |
| GET | `/api/memory/long` | 长期记忆 |
| POST | `/api/memory/short` | 添加短期记忆 |
| POST | `/api/memory/long` | 添加长期记忆 |
| GET | `/api/memory/search` | 搜索记忆 |

---

## 🧪 开发指南

### 代码规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 类名 | PascalCase | `MemoryManager` |
| 接口名 | PascalCase + I前缀 | `IConfig` |
| 方法名 | camelCase | `initialize()` |
| 常量 | UPPER_SNAKE_CASE | `MAX_RETRIES` |
| 文件名 | kebab-case | `task-queue.ts` |

### 测试命令

```bash
# 运行所有测试
npm run test

# 监听模式
npm run test:watch

# 覆盖率
npm run test:coverage
```

---

## 🚢 部署运维

### 开发环境

```bash
git clone https://github.com/qingfeng2055/HelixAgent.git
cd HelixAgent
bun install
cp server/.env.example server/.env
npm run dev
```

### 生产构建

```bash
# 构建前端
npm run frontend:build

# 构建服务端
npm run build

# 构建桌面应用
npm run build:shell
```

---

## ❓ 常见问题

### Q: 启动失败，端口被占用？

```bash
# 查找占用端口的进程
lsof -i :17870

# 终止进程
kill -9 <PID>
```

### Q: MCP 服务器连接失败？

检查 MCP 配置和环境变量，确保 MCP 服务器已正确安装。

### Q: LLM 调用超时？

增加超时配置或检查网络连接。

---

<div align="center">

**HelixAgent v5.0.0**

*专业级 Desktop AI Agent 平台*

[架构完整度：100%] [核心能力：6/6] [生产就绪：是]

**让 AI Agent 开发更简单、更强大**

</div>
