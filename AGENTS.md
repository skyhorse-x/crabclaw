# Desktop Agent Studio — AI Agent 设计文档

> **本文件是最高优先级约束文件。** 任何代码修改必须先阅读本文件，违反任何规则视为任务失败。

## 项目简介

Desktop Agent Studio（CrabClaw）是一个**专业级跨平台桌面 AI Agent 平台**，采用 **Neutralinojs（桌面壳）+ Bun（后端运行时）+ Vue 3（前端）** 的全栈架构。

### 技术栈

| 层级 | 技术选型 | 说明 |
| :--- | :--- | :--- |
| **桌面壳** | Neutralinojs v6.5.0 | 轻量级跨平台桌面框架 |
| **后端运行时** | Bun | 高性能 JS/TS 运行时 |
| **后端语言** | TypeScript (ES2022/ESNext) | 严格模式，路径别名 `@/*` → `server/*` |
| **前端框架** | Vue 3 + Vite 7 | Composition API + `<script setup lang="ts">` |
| **UI 组件库** | Element Plus 2.x | 中后台组件库 |
| **路由** | Vue Router 5 | 前端路由 |
| **国际化** | vue-i18n 11 | 多语言，所有用户可见文本必须通过 `t()` 引用 |
| **MCP 协议** | @modelcontextprotocol/sdk v1.27 | 标准模型上下文协议 |
| **数据库** | Bun:SQLite（`server/data.db`） | 内置 SQLite，统一数据库文件 |
| **测试** | Vitest 4 | 单元测试，命令：`bun test` |

### 核心架构（四层）

```
┌─────────────────────────────────────┐
│  Presentation Layer（展示层）        │
│  Vue 3 + Element Plus               │
│  ChatView | ControlView | TasksView │
├─────────────────────────────────────┤
│  Service Layer（服务层）             │
│  UnifiedMessage | TaskScheduler     │
│  MCP | Config | RemoteControl       │
├─────────────────────────────────────┤
│  Core Layer（核心层）               │
│  ChatHandler | RemoteAgent          │
│  Bridge | Encryption                │
├─────────────────────────────────────┤
│  Data Layer（数据层）               │
│  SQLite (data.db) | app-config.json │
└─────────────────────────────────────┘
```

---

## 文件结构

```
crabclaw/
├── server/
│   ├── agents/               # Agent 实现
│   │   ├── remote.agent.ts   # 远程控制 Agent（Telegram 等）
│   │   └── ...
│   ├── handlers/             # 请求处理器
│   │   ├── chat.handler.ts   # 聊天主逻辑（最复杂）
│   │   └── chat-progress.ts  # MCP 工具进度消息
│   ├── routes/               # API 路由（每模块一文件）
│   │   ├── remote-control.routes.ts
│   │   ├── config.routes.ts
│   │   └── ...
│   ├── services/             # 业务服务
│   │   ├── config-database.service.ts  # SQLite 统一数据库
│   │   ├── unified-message.service.ts  # 多平台消息发送
│   │   ├── remote-control-log.service.ts
│   │   └── ...
│   ├── shared/
│   │   └── constants.ts      # 路径/默认值/系统提示词
│   └── data/
│       ├── app-config.json   # 模型/技能/任务配置（JSON）
│       └── skills/           # 技能目录
├── frontend/                 # Vue 3 前端
│   └── src/views/
│       ├── ControlView.vue   # 远程控制面板
│       └── ...
├── workspace/                # 用户项目默认保存目录
├── docs/                     # 技术文档
│   ├── REMOTE_CONTROL_API.md # 远程控制 API 文档
│   └── DEPLOYMENT_GUIDE.md
└── AGENTS.md                 # 本文件（最高优先级）
```

---

## API 路由总览

服务器默认端口 **17870**（`server/.env` 中 `PORT=17870`）。

| 路由前缀 | 文件 | 功能 |
| :--- | :--- | :--- |
| `/health`, `/api/health` | health.routes.ts | 健康检查 |
| `/api/config` | config.routes.ts | 全局配置读写 |
| `/api/chat-history` | chat-history.routes.ts | 聊天历史 + Token 统计 |
| `/api/mcp` | mcp.routes.ts | MCP 工具管理 |
| `/api/agents` | agent.routes.ts | Agent CRUD |
| `/api/skill-market` | skill-market.routes.ts | 技能市场 |
| `/api/bridge` | bridge.routes.ts | 桌面自动化桥接 |
| `/api/auth` | auth.routes.ts | 认证 |
| `/api/remote-control` | remote-control.routes.ts | 远程控制（见详细文档） |
| `/api/scheduled-tasks` | scheduled-tasks.routes.ts | 定时任务 |
| `/api/file` | file-editor.routes.ts | 文件读写 |
| `/api/system` | system.routes.ts | 系统状态 |
| `/api/pipelines` | pipeline.routes.ts | 流水线编排 |

> 详细的远程控制 API 见 [docs/REMOTE_CONTROL_API.md](docs/REMOTE_CONTROL_API.md)

---

## Agent 通信协议（Agent Envelope JSON）

每次 LLM 回复**必须**是一个合法的 JSON 对象：

```json
{ "type": "message | plan | action | actions | done | error", "data": {} }
```

| type | 用途 |
| :--- | :--- |
| `message` | 直接文字回复，无需工具 |
| `plan` | 复杂任务拆解为步骤列表 |
| `action` | 调用单个 MCP 工具 |
| `actions` | 批量顺序调用 MCP 工具 |
| `done` | 任务完成，返回最终结果 |
| `error` | 执行失败，返回错误信息 |

### action 格式

```json
{
  "type": "action",
  "data": {
    "tool": "mcp",
    "name": "chrome-devtools/new_page",
    "input": { "url": "https://www.example.com" }
  }
}
```

---

## MCP 工具体系

### 可用 MCP 服务器

| 服务器 | 主要工具 | 说明 |
| :--- | :--- | :--- |
| `filesystem` | read_file, write_file, create_directory | 文件系统操作 |
| `shell` | shell_execute | 执行 Shell 命令（跨平台） |
| `fetch` | fetch_readable, fetch_html | 抓取网页/HTTP 请求 |
| `memory` | search_nodes, create_entities | 知识图谱长期记忆 |
| `chrome-devtools` | new_page, navigate_page, select_page, take_snapshot, click, fill | 浏览器控制 |
| `github` | — | GitHub API（需配置 token） |

### 浏览器操作规则（不可违反）

1. **打开网站** → 直接 `new_page {url}`，**禁止**先打开百度再搜索
2. **已打开的页面** → 先 `list_pages` 确认，用 `select_page` 切换（`pageId` 必须是**数字**，不能是字符串）
3. **`evaluate_script`** → 必须传 `function` 字段（箭头函数体）
4. **导航超时**（"Navigation timeout"）→ 属于正常现象，立即输出 `type="done"`，**禁止**重试
5. **`new_page` 返回页面列表**（"## Pages ..."）→ 立即输出 `type="done"`，不再继续操作
6. **每次对话都是全新任务** → 不要参考上一轮的浏览器操作历史

### 跨平台 Shell 规范

| 操作 | macOS / Linux | Windows |
| :-- | :--- | :--- |
| 内存 | `vm_stat` / `free -m` | `systeminfo` |
| CPU | `uptime` | `wmic cpu get loadpercentage` |
| 磁盘 | `df -h` | `wmic logicaldisk get size,freespace` |
| 进程 | `ps aux` | `tasklist` |

### 路径规范

| 场景 | 路径 |
| :--- | :--- |
| 用户创建项目 | `workspace/<项目名>/` |
| 未指定路径的单文件 | `workspace/` |
| 用户明确说"桌面" | `~/Desktop/` |

- 所有路径使用**绝对路径**，禁止 `~` 或 `$HOME`

---

## 执行约束

- 简单问题 → 直接 `message`，禁止调工具
- 单步能完成 → 禁止拆多步骤
- 工具失败后 → 禁止重复调用相同工具
- 未通过工具获取的数据 → 禁止编造

---

## 远程控制模块关键约束

> 修改 `remote-control.routes.ts` 或 `remote.agent.ts` 时必须遵守。

### Telegram 轮询规则

1. **禁止在 `fetch()` 中使用 `keepalive: true`** — 长轮询（timeout=30s）与 Bun 的连接池不兼容，会导致 404
2. **`parse_mode` 必须使用 `MarkdownV2`** — 转义函数（`sanitizeRemoteText`）用的是 MarkdownV2 规则，必须匹配
3. **404 处理** — 先用 `getMe` 验证 token，token 有效则视为临时网络错误重试，不得直接设 `telegramPermanentError = true`
4. **轮询调度** — 统一通过 `scheduleNextPolling(hasError, nextOffset)` 调度，**禁止**用裸 `setTimeout(() => fetchTelegramUpdates(offset), 100)` 绕过（会导致调度链断裂）
5. **代理配置缓存** — `getProxyConfig()` 已有 30 秒内存缓存，禁止在轮询热路径中直接读 SQLite

### 消息过滤规则

- **私聊消息**（`chat.type === 'private'`）→ 直接放行，无论发送者是谁
- **群组消息**（`group / supergroup / channel`）→ 只接受配置的 `chatId` 对应的群，其他群忽略
- **chatId 字段语义**：用于"主动推送"的默认目标 + 群组消息白名单，**不用于过滤私聊**

### 回复规则

- 回复发给**消息来源的 chatId**（`sender.split(':')[0]`），不固定用配置的 chatId
- `chatId` 配置为空时，`sendTelegramMessage()` 直接返回 false，不发送

### 文本转义

`sanitizeRemoteText()` 在 `remote.agent.ts` 中对 Telegram 回复做 MarkdownV2 转义：
```
/([_*[\]()~`>#+\-=|{}.!])/g → \$1
```
发送时必须对应使用 `parse_mode: 'MarkdownV2'`，否则反斜杠会直接显示。

---

## 数据库约束

- 统一数据库文件：`server/data.db`（由 `getUnifiedDbPath()` 确定）
- Remote Control 配置存在 `remote_control_config` 表（id=1 单行）
- App 配置（模型/技能/任务）存在 `config` 表，key=`app_config`，value 为 JSON 字符串
- 聊天记录存在 `conversations` + `messages` 表
- **禁止**在 `app-config.json` 文件中存储运行时状态，该文件仅作历史兼容

---

## 模型配置

在 `server/data/app-config.json` 的 `models` 数组中配置：

```json
{
  "id": "my-model",
  "name": "模型显示名",
  "provider": "openrouter | bytedance | custom | zhipu",
  "modelName": "模型 API 名称",
  "apiBaseUrl": "https://...",
  "apiKeyEncrypted": "加密后的 Key（由前端加密存储）"
}
```

`settings.activeModelId` 指定当前激活的模型 ID。

---

## 多角色代理系统

执行开发任务时，5 个角色按流水线顺序激活，**严禁越界代劳**。

```
[简单问答]  → 直接回复
[单文件修改] → 工程师(实现) → 审查专家(验收)
[新功能开发] → 产品经理 → UI设计师 → 前端工程师 → 后端工程师 → 代码审查专家
```

### 产品经理

**职责**：需求分析 → 任务拆解 → 输出执行计划

**输出格式**：

```markdown
## 执行计划
### 任务 1：[任务名]
- 涉及文件：[文件路径列表]
- 完成标准：[具体的验收条件，每行一条]
- 前置依赖：无 / 任务 X
```

**禁止**：跳过该角色直接写代码；输出无验收标准的模糊需求。

### UI 设计师

**职责**：界面设计 → 交互确认 → 输出设计规范

- 复用已有 Element Plus 组件，不引入新设计体系
- 纯后端任务直接 pass

### 前端工程师

**技术约束**：

- 框架：Vue 3 Composition API + `<script setup lang="ts">`
- 组件库：Element Plus 2.x，图标：`@element-plus/icons-vue`
- 样式：`<style scoped>` 局部样式，禁止内联 `style`
- 国际化：所有用户可见文本必须通过 `t()` 函数引用
- `v-for` 必须提供 `:key`
- 所有异步操作必须有错误处理
- 禁止使用 `document.execCommand`（已废弃）

### 后端工程师

**技术约束**：

- 运行时：Bun；语言：TypeScript 严格模式
- HTTP 响应使用 `shared/utils/http.util.ts` 的工具函数
- 路径处理使用 `path.join()`，**禁止**字符串拼接
- 每个新 API 必须注册到 `server/routes/index.ts`
- ID 生成使用 `common.util.ts` 的 `createId()`
- **禁止**在 catch 块中写空逻辑

### 代码审查专家

逐项检查，**有一项不通过则驳回**：

1. 改动是否超出任务范围
2. 是否有 `@ts-nocheck`、`@ts-ignore`、`as any` 新增
3. 每个 `await` 是否有 `try/catch` 或 `.catch()`
4. 是否使用 `path.join()` 而非字符串拼接
5. 是否复用已有公共工具而非重新实现
6. 前端请求路径/参数/响应与后端是否一致
7. 是否有未被引用的变量、函数、导入

---

## 严格模式规则（最高优先级）

### 零兜底代码

- 禁止空函数、TODO 注释、占位 console.log、mock 数据
- 禁止 `// TODO`、`// FIXME`、`// 后续优化`
- 禁止 `catch` 块中写 `// do nothing` 或空语句

### 零假设原则

- 禁止猜测 API 响应结构 — 必须先查看后端实际返回格式
- 禁止猜测函数行为 — 必须先阅读函数定义
- 禁止猜测类型定义 — 必须先查看类型声明

### 零复制粘贴

- 禁止复制代码后仅做微小改动 — 应提取为共享函数
- 发现功能重复时，必须优先复用

---

## 精准代码修改规范

### 先阅读，后修改

- **修改任何文件前，必须先阅读该文件全部内容**
- 阅读相邻文件 — 改一个函数前，先看被哪些地方调用
- 确认调用链无副作用后再动手

### 最小修改范围

- **只修改目标行，不碰无关代码**
- 禁止"顺手优化" — 不重构、不重命名、不调整风格
- 禁止"顺便修复" — 发现其他问题单独记录

### 不动注释

- 禁止添加任何注释（包括 TODO、说明、标记）
- 禁止删除或修改已有注释

### 修改后验证顺序

```
① 目标一致性审查 → ② Diff 审查 → ③ 类型检查（npx tsc --noEmit）
→ ④ 测试运行（bun test）→ ⑤ 前端构建（bun run frontend:build）
```

#### 前后端联调检查

当修改同时涉及前后端时：

1. API URL 路径与后端路由前缀完全匹配
2. 前端传参与后端期望的参数名/类型一致
3. 后端返回结构与前端解析结构一致
4. WebSocket 事件名和 payload 结构前后端一致

---

## 代码审查规范

### 审查维度与优先级

| 级别 | 维度 | 核心检查项 | 违规标准 |
| :--- | :--- | :--- | :--- |
| **P0** | 架构与设计 | 单一职责、模块边界、循环依赖 | 文件超 1000 行含多职责，或显式循环依赖 |
| **P1** | 精简与去重 | 功能重复实现、冗余包装函数、死代码 | 同一功能在 ≥3 个文件中各自实现 |
| **P2** | 命名一致性 | 同一概念统一命名 | 同一概念有 ≥3 种不同命名 |
| **P3** | 类型安全 | `@ts-nocheck` 清理、`as any` 消除 | 存在 `@ts-nocheck` 或多个 `as any` |
| **P4** | 错误处理 | 未捕获 Promise、无兜底逻辑 | 存在未 catch 的异步调用 |
| **P5** | 性能与安全 | 敏感信息日志、路径穿越 | API Key 输出到日志 |
