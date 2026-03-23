# HelixAgent - 专业级 Desktop AI Agent 平台

<div align="center">

![Version](https://img.shields.io/badge/version-5.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)
![Status](https://img.shields.io/badge/status-active-success.svg)

**专业级桌面 AI Agent 平台 | 工具系统 | 任务规划 | 记忆系统 | 技能编排**

</div>

---

## 📖 简介

**HelixAgent** 是一个专业级的桌面 AI Agent 平台，采用现代化的分层架构设计，集成了 MCP 协议、智能任务规划、统一工具系统、记忆系统、技能编排等核心能力。

### 核心特性

- 🧠 **智能任务规划** - 自动拆解复杂任务为可执行步骤
- 🔧 **统一工具系统** - 8+ 内置工具，支持 MCP 工具适配
- 💾 **双模记忆系统** - 短期对话上下文 + 长期持久化记忆
- 🎯 **技能编排** - JSON 定义的可复用技能
- ⚡ **任务队列** - 并发控制、优先级调度、重试机制
- 📊 **状态追踪** - 完整的 Agent 生命周期管理
- 🔌 **MCP 集成** - 支持标准 Model Context Protocol

---

## 🏗️ 架构设计

```
┌─────────────────────────────────────────┐
│          HTTP Request / Frontend        │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│              Core Layer                 │
│         (启动入口、HTTP 服务器)           │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│            Routes & Handlers            │
│         (路由匹配、请求处理)             │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│             Services Layer              │
│        (业务逻辑、服务管理)              │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│          Agent Core Layer ⭐            │
│  ┌──────────┬──────────┬─────────────┐  │
│  │  Tools   │ Planner  │   Memory    │  │
│  │  工具    │  规划    │   记忆      │  │
│  ├──────────┼──────────┼─────────────┤  │
│  │  Skills  │   Task   │    State    │  │
│  │  技能    │   队列   │    状态     │  │
│  └──────────┴──────────┴─────────────┘  │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│           Bridge / System               │
│      (系统调用、MCP Servers)            │
└─────────────────────────────────────────┘
```

---

## 📁 项目结构

```
HelixAgent/
├── server/                          # 后端服务器
│   ├── core/                        # 核心层
│   │   ├── server.ts               # 主入口 (150 行)
│   │   ├── bootstrap.ts            # 应用初始化
│   │   └── http.ts                 # HTTP 服务器
│   │
│   ├── routes/                      # 路由层
│   │   ├── mcp.routes.ts
│   │   ├── system.routes.ts
│   │   └── health.routes.ts
│   │
│   ├── handlers/                    # 请求处理层
│   │   ├── chat.handler.ts
│   │   └── system.handler.ts
│   │
│   ├── services/                    # 服务层
│   │   ├── mcp.service.ts
│   │   ├── action.service.ts
│   │   ├── logger.service.ts
│   │   ├── config.service.ts
│   │   └── cache.service.ts
│   │
│   ├── agents/                      # Agent 层
│   │   ├── base.agent.ts
│   │   ├── mcp.agent.ts
│   │   └── system.agent.ts
│   │
│   ├── tools/                       # 工具系统 ⭐
│   │   ├── tool.types.ts
│   │   ├── tool-registry.ts
│   │   ├── file.tool.ts
│   │   ├── shell.tool.ts
│   │   └── mcp.tool.ts
│   │
│   ├── planner/                     # 任务规划 ⭐
│   │   ├── planner.types.ts
│   │   └── task-planner.ts
│   │
│   ├── memory/                      # 记忆系统 ⭐
│   │   ├── memory.types.ts
│   │   ├── short-memory.ts
│   │   ├── long-memory.ts
│   │   └── memory-manager.ts
│   │
│   ├── skills/                      # 技能系统 ⭐
│   │   ├── skill.types.ts
│   │   ├── skill-executor.ts
│   │   └── skill-registry.ts
│   │
│   ├── task/                        # 任务队列 ⭐
│   │   ├── task.types.ts
│   │   ├── task-queue.ts
│   │   └── task-handlers.ts
│   │
│   ├── state/                       # 状态管理 ⭐
│   │   ├── state.types.ts
│   │   └── agent-state-manager.ts
│   │
│   ├── middleware/                  # 中间件
│   │   └── error.middleware.ts
│   │
│   ├── bridge/                      # 桥接层
│   │   └── action-runner.mjs
│   │
│   └── shared/                      # 共享模块
│       ├── utils/
│       ├── types/
│       └── constants.ts
│
├── data/                            # 数据和配置
│   └── skills/                      # 技能定义
│       └── create-node-project.skill.json
│
├── frontend/                        # 前端界面
│   └── src/
│
├── logs/                            # 日志文件
├── package.json
└── tsconfig.json
```

---

## 🚀 快速开始

### 环境要求

- Node.js >= 18 或 Bun >= 1.0
- Git

### 安装依赖

```bash
npm install
# 或
bun install
```

### 开发模式

```bash
# 同时启动前后端
npm run dev

# 只启动后端
npm run backend

# 后端热重载
npm run backend:watch
```

### 生产构建

```bash
# 构建前端
npm run frontend:build

# 构建桌面应用
npm run build:shell
```

---

## 💡 使用示例

### 1. 工具调用

```typescript
import { toolRegistry } from './server'

// 读取文件
const result = await toolRegistry.executeTool('read_file', {
  path: '/tmp/test.txt'
})

console.log(result.data.content)
```

### 2. 任务规划

```typescript
import { taskPlanner } from './server'

// 规划任务
const plan = await taskPlanner.plan('创建 Node.js 项目')

console.log(plan.steps)
// [
//   { tool: 'create_directory', ... },
//   { tool: 'shell', ... },
//   ...
// ]
```

### 3. 技能执行

```typescript
import { skillRegistry } from './server'

// 加载技能
await skillRegistry.loadFromDirectory('./data/skills')

// 执行技能
const result = await skillRegistry.execute('create-node-project', {
  projectName: 'my-app'
})

console.log(result.success) // true
```

### 4. 记忆系统

```typescript
import { memoryManager } from './server'

// 初始化
await memoryManager.initialize()

// 添加短期记忆
await memoryManager.addShort('用户正在创建项目')

// 添加长期记忆
await memoryManager.addLong('用户偏好 TypeScript', {
  type: 'preference'
})

// 搜索记忆
const memories = await memoryManager.searchLong('TypeScript')
```

### 5. 任务队列

```typescript
import { taskQueue, registerBuiltInHandlers } from './server'

// 注册处理器
registerBuiltInHandlers(taskQueue)

// 添加任务
const taskId = await taskQueue.add({
  name: '读取文件',
  type: 'tool',
  priority: 'normal',
  data: { tool: 'read_file', input: { path: './test.txt' } }
})

// 等待完成
const result = await taskQueue.waitForTask(taskId)
```

### 6. Agent 状态管理

```typescript
import { agentStateManager } from './server'

// 初始化 Agent
agentStateManager.initialize('agent-1')

// 设置状态
agentStateManager.setState('agent-1', 'thinking')

// 订阅状态变化
agentStateManager.subscribe((event) => {
  console.log(`${event.agentId}: ${event.oldState} -> ${event.newState}`)
})
```

---

## 📊 API 接口

### 健康检查
- `GET /health` - 健康状态
- `GET /status` - 详细状态

### MCP 接口
- `GET /api/mcp/servers` - MCP 服务器列表
- `GET /api/mcp/tools` - 所有 MCP 工具
- `POST /api/mcp/call` - 调用 MCP 工具

### 技能接口
- `GET /api/skills` - 技能列表
- `POST /api/run/skill` - 执行技能

### 任务接口
- `GET /api/tasks` - 任务列表
- `POST /api/tasks` - 创建任务
- `PUT /api/tasks/:id` - 更新任务
- `DELETE /api/tasks/:id` - 删除任务

---

## 🎯 核心能力

### ✅ 已实现 (100%)

| 能力 | 状态 | 说明 |
|------|------|------|
| 工具系统 | ✅ | 统一 Tool Registry、8+ 工具 |
| 任务规划 | ✅ | 智能任务拆解、依赖管理 |
| 记忆系统 | ✅ | 短期/长期双模记忆 |
| 技能系统 | ✅ | JSON 定义、步骤编排 |
| 任务队列 | ✅ | 并发控制、优先级调度 |
| 状态管理 | ✅ | 11 种状态追踪 |
| MCP 集成 | ✅ | 标准协议支持 |

---

## 📈 架构优势

### 代码质量
- **server.ts 减少 89%** - 从 1436 行到 150 行
- **70+ 模块化文件** - 职责清晰
- **TypeScript 严格模式** - 类型安全

### 扩展性
- **插件化设计** - 工具/技能可插拔
- **统一接口** - 所有工具相同调用方式
- **MCP 兼容** - 支持标准协议

### AI 原生
- **Agent 层** - 专为 AI 驱动设计
- **任务规划** - 智能任务拆解
- **工具调用** - LLM 友好接口

---

## 📚 文档

- [架构升级报告](./AGENT_ARCHITECTURE_UPGRADE.md)
- [核心能力实现](./CORE_CAPABILITIES_COMPLETED.md)
- [项目详细介绍](./PROJECT_INTRODUCTION.md)
- [架构重构完成](./ARCHITECTURE_REFACTOR_COMPLETED.md)

---

## 🔧 技术栈

- **运行时**: Bun / Node.js
- **语言**: TypeScript 5.0+
- **HTTP**: Bun.serve
- **桌面**: Neutralinojs
- **协议**: MCP (Model Context Protocol)
- **前端**: Vue 3 + Vite

---

## 🤝 贡献

### 开发环境
```bash
git clone https://github.com/qingfeng2055/HelixAgent.git
cd HelixAgent
npm install
npm run dev
```

### 代码规范
- 使用 TypeScript 严格模式
- 遵循 ESLint + Prettier
- 编写类型注释
- 添加必要的文档

---

## 📄 许可证

MIT License

---

## 🔗 相关链接

- **GitHub**: https://github.com/qingfeng2055/HelixAgent
- **MCP 协议**: https://modelcontextprotocol.io
- **Neutralinojs**: https://neutralino.js.org
- **Bun**: https://bun.sh

---

<div align="center">

**HelixAgent v5.0.0**

*专业级 Desktop AI Agent 平台*

[架构完整度：100%] [核心能力：6/6] [生产就绪：是]

</div>
