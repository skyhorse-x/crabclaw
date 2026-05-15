# Desktop Agent Studio — AI Agent 设计文档

## 项目简介

Desktop Agent Studio 是一个桌面端 AI Agent 平台，允许用户通过自然语言驱动 AI 执行本地操作、浏览器控制、文件管理、Shell 命令等任务。

---

## Agent 架构

### 核心模式

Agent 采用 **按需激活** 模式：

- 简单问答 → 直接回复，不调用任何工具
- 需要操作 → 进入 Agent 模式，调用 MCP 工具执行

### 响应协议（Agent Envelope）

每次 LLM 回复必须是一个合法 JSON 对象：

```json
{ "type": "message | plan | action | actions | done | error", "data": {} }
```

| type | 用途 |
|------|------|
| `message` | 直接文字回复，无需工具 |
| `plan` | 复杂任务拆解为步骤列表 |
| `action` | 调用单个 MCP 工具 |
| `actions` | 批量顺序执行多个工具（步骤间无依赖时使用） |
| `done` | 任务完成，返回最终结果 |
| `error` | 执行失败，返回错误信息 |

---

## MCP 工具体系

### 可用 MCP 服务器

| 服务器 | 能力 |
|--------|------|
| `filesystem` | 读写文件、创建目录、搜索文件 |
| `shell` | 执行 Shell 命令（跨平台） |
| `fetch` | 抓取网页内容、HTTP 请求 |
| `memory` | 知识图谱读写（长期记忆） |
| `chrome-devtools` | 浏览器控制：打开页面、截图、点击、输入、执行脚本 |

### 工具调用格式

```json
{
  "type": "action",
  "data": {
    "tool": "chrome-devtools",
    "name": "new_page",
    "input": { "url": "https://www.example.com" }
  }
}
```

---

## 路径规范

| 场景 | 路径 |
|------|------|
| 用户创建项目 | `workspace/<项目名>/` |
| 未指定路径的单文件 | `workspace/` |
| 用户明确说"桌面" | `~/Desktop/` |

- 所有路径使用绝对路径，禁止 `~` 或 `$HOME`
- `filesystem` 工具不支持路径展开

---

## 浏览器操作规则

1. **打开网站** — 直接 `new_page`，禁止绕道百度搜索
2. **Navigation timeout** — 正常现象，视为成功，立即 `done`
3. **已打开的页面** — 先 `list_pages` 确认，用 `select_page` 切换，不重复 `new_page`
4. **`evaluate_script`** — 必须传 `function` 字段（箭头函数），禁止传裸代码

常见网站域名：

| 名称 | 域名 |
|------|------|
| 小红书 | www.xiaohongshu.com |
| 抖音 | www.douyin.com |
| B站 | www.bilibili.com |
| 淘宝 | www.taobao.com |
| 京东 | jd.com |
| 知乎 | www.zhihu.com |
| GitHub | github.com |

---

## 跨平台 Shell 规范

| 操作 | macOS | Linux | Windows |
|------|-------|-------|---------|
| 内存 | `vm_stat` | `free -m` | `systeminfo` |
| CPU | `uptime` | `uptime` | `wmic cpu get loadpercentage` |
| 磁盘 | `df -h` | `df -h` | `wmic logicaldisk get size,freespace` |
| 进程 | `ps aux` | `ps aux` | `tasklist` |

---

## 执行约束

- 简单问题 → 直接 `message`，禁止调工具
- 单步能完成 → 禁止拆多步骤
- 工具失败后 → 禁止重复调用相同工具（换方案或告知用户）
- 未通过工具获取的本机数据 → 禁止编造为"当前实时数据"

---

## 文件结构

```
crabclaw/
├── server/
│   ├── handlers/
│   │   ├── chat.handler.ts       # Agent 主逻辑、LLM 请求、工具调度
│   │   └── chat-progress.ts      # 工具执行进度描述
│   ├── services/
│   │   ├── mcp.service.ts        # MCP 连接与工具调用
│   │   ├── config.service.ts     # 配置读写
│   │   └── encryption.service.ts # API Key 加解密
│   ├── shared/
│   │   ├── constants.ts          # 路径、默认值常量
│   │   └── types/                # TypeScript 类型定义
│   └── data/
│       ├── app-config.json       # 模型配置、技能配置
│       └── skills/               # 技能文件目录
├── frontend/                     # Vue 3 前端
├── workspace/                    # 用户项目默认保存目录
└── AGENT.md                      # 本文件
```

---

## 模型配置

支持任意 OpenAI 兼容接口，在 `server/data/app-config.json` 的 `models` 数组中配置：

```json
{
  "id": "my-model",
  "name": "模型显示名",
  "provider": "openrouter | bytedance | custom",
  "modelName": "模型 API 名称",
  "apiBaseUrl": "https://...",
  "apiKeyEncrypted": "加密后的 Key"
}
```

`settings.activeModelId` 指定当前激活的模型。
