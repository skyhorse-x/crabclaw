# 远程控制 API 文档

> 对应源码：`server/routes/remote-control.routes.ts`  
> Agent 实现：`server/agents/remote.agent.ts`  
> 消息发送：`server/services/unified-message.service.ts`

---

## 接口总览

| 方法 | 路径 | 功能 |
| :--- | :--- | :--- |
| GET | `/api/remote-control/config` | 获取远程控制配置 |
| POST/PUT | `/api/remote-control/config` | 更新远程控制配置 |
| POST | `/api/remote-control/send` | 主动向平台发送消息 |
| GET | `/api/remote-control/logs` | 获取操作日志 |
| POST | `/api/remote-control/hook` | 接收 Webhook（Telegram/QQ/飞书） |

---

## GET `/api/remote-control/config`

获取当前远程控制的完整配置。

**响应示例**：

```json
{
  "enabled": true,
  "proxyEnabled": false,
  "commandPrefix": "/agent",
  "verifyCode": "",
  "telegram": {
    "enabled": true,
    "botToken": "123456:ABC...",
    "chatId": "-5084498962",
    "proxyEnabled": false
  },
  "qq": {
    "enabled": false,
    "botId": "",
    "webhook": "",
    "proxyEnabled": false,
    "appSecret": ""
  },
  "wechat": { "enabled": false, "webhook": "", "proxyEnabled": false },
  "feishu": { "enabled": false, "appId": "", "appSecret": "", "webhook": "", "proxyEnabled": false },
  "discord": { "enabled": false, "botToken": "", "channelId": "", "proxyEnabled": false },
  "slack": { "enabled": false, "botToken": "", "channelId": "", "proxyEnabled": false },
  "teams": { "enabled": false, "appId": "", "appSecret": "", "webhook": "", "proxyEnabled": false },
  "whatsapp": { "enabled": false, "accountSid": "", "authToken": "", "fromNumber": "", "proxyEnabled": false }
}
```

---

## POST/PUT `/api/remote-control/config`

更新远程控制配置，支持部分更新（只传需要修改的字段）。

**请求体**（全量示例）：

```json
{
  "enabled": true,
  "commandPrefix": "/agent",
  "telegram": {
    "enabled": true,
    "botToken": "123456:ABC...",
    "chatId": "123456789",
    "proxyEnabled": false
  }
}
```

**字段说明**：

| 字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| `enabled` | boolean | 总开关，false 时所有平台停止响应 |
| `commandPrefix` | string | 命令前缀，如 `/agent`。设置后群组中需带前缀；私聊无需前缀 |
| `verifyCode` | string | 验证码（预留字段，暂未启用鉴权） |
| `telegram.botToken` | string | BotFather 颁发的 Bot Token |
| `telegram.chatId` | string | 默认推送目标的 chat_id（个人ID 或 群组ID）。群组 ID 为负数 |
| `telegram.proxyEnabled` | boolean | 是否通过系统代理访问 Telegram |

**响应**：

```json
{ "ok": true }
```

---

## POST `/api/remote-control/send`

主动向指定平台发送一条消息。**不依赖用户先发消息**，可用于定时推送、告警通知等场景。

**请求体**：

```json
{
  "platform": "telegram",
  "content": "服务器 CPU 使用率超过 90%，请及时处理！",
  "chatId": "123456789"
}
```

| 字段 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `platform` | string | 否 | 平台名，默认 `telegram`。可选值见下表 |
| `content` | string | 是 | 消息内容（纯文本） |
| `text` | string | 否 | `content` 的别名，两者取其一 |
| `chatId` | string | 否 | 目标 chat_id。不传则使用配置中的默认 chatId |

**支持的平台**：

| platform | 说明 | 必须配置 |
| :--- | :--- | :--- |
| `telegram` | Telegram Bot | botToken + chatId |
| `qq` | QQ 机器人（官方） | webhook |
| `wechat` | 企业微信机器人 | webhook |
| `feishu` | 飞书机器人 | webhook |
| `discord` | Discord Bot | botToken + channelId |
| `slack` | Slack Bot | botToken + channelId |
| `teams` | Microsoft Teams | webhook |
| `whatsapp` | WhatsApp（Twilio） | accountSid + authToken + fromNumber |

**成功响应**：

```json
{
  "ok": true,
  "platform": "telegram",
  "messageId": "12345"
}
```

**失败响应**（HTTP 500）：

```json
{
  "ok": false,
  "platform": "telegram",
  "error": "chat_id 未配置，请在设置中填写 Chat ID"
}
```

**常见错误**：

| 错误信息 | 原因 | 解决方法 |
| :--- | :--- | :--- |
| `Bot token 未配置` | botToken 为空 | 控制面板填写 Bot Token |
| `chat_id 未配置` | chatId 为空且请求未传 chatId | 控制面板填写 Chat ID，或请求时传 chatId |
| `HTTP 404` | Bot Token 已失效 | 去 BotFather 重新生成 token |
| `HTTP 403` | Bot 未加入该群或被踢出 | 将 bot 加入群组 |

---

## GET `/api/remote-control/logs`

获取远程控制操作日志（最近 N 条）。

**响应示例**：

```json
[
  {
    "id": 1,
    "eventType": "message_received",
    "platform": "telegram",
    "summary": "收到消息: 查看系统内存",
    "detail": "chatId=123456789",
    "extra": "@username",
    "level": "info",
    "createdAt": 1716000000000
  }
]
```

**eventType 说明**：

| eventType | 说明 |
| :--- | :--- |
| `message_received` | 收到用户消息并开始处理 |
| `message_ignored` | 消息被过滤（非授权群组） |
| `message_broadcast` | 消息已广播到前端 |
| `polling_start` | 轮询开始或恢复 |
| `polling_error` | 轮询出错 |
| `webhook_received` | 收到 Webhook 推送 |
| `agent_error` | Agent 处理失败 |
| `system` | 系统事件（启动/配置加载等） |

---

## POST `/api/remote-control/hook`

接收第三方平台的 Webhook 推送（仅在配置了 Webhook 模式时使用）。Telegram 默认使用**长轮询**模式，不需要此接口。

**请求体**（Telegram Update 格式）：

```json
{
  "update_id": 123456,
  "message": {
    "message_id": 1,
    "chat": { "id": 123456789, "type": "private" },
    "from": { "id": 123456789, "username": "user" },
    "text": "/agent 帮我查系统内存"
  }
}
```

---

## 消息接收规则

### 私聊 vs 群组

| 来源 | 过滤规则 |
| :--- | :--- |
| 私聊（`chat.type = private`） | 直接放行，无论发送者是谁 |
| 群组（`group / supergroup / channel`） | 只接受配置的 `chatId` 对应的群，其他群消息忽略 |

**设计原则**：`chatId` 配置项有两个作用：
1. 主动推送的默认目标（`send` 接口不传 chatId 时使用）
2. 群组消息白名单（只有匹配的群才响应）

私聊消息不受 chatId 限制，任何人私聊 bot 都会得到响应。

### 命令前缀

- 群组中，配置了 `commandPrefix`（如 `/agent`）后，消息必须以该前缀开头才会被处理
- 私聊中，有无前缀均处理（前缀会被自动去掉）
- 空前缀 = 接受所有消息

### 回复目标

回复**永远发给消息来源的 chatId**，不是配置的默认 chatId。这样私聊和不同群组都能独立收到回复。

---

## Telegram 专项说明

### 长轮询模式（默认）

服务器启动后自动开始轮询 `getUpdates?timeout=30`，无需任何外部配置。

**轮询参数**：
- `limit=10` — 每次最多取 10 条
- `timeout=30` — 服务端长等待 30 秒（Telegram 服务器侧）
- `offset` — 自动追踪，确保消息不重复

**重连机制**：
- 正常间隔：2 秒
- 出错后：30s 起步，每次错误 +5s，最大 120s
- 404 处理：先用 `getMe` 验证 token 有效性，token 有效则视为临时网络错误重试

### Token 失效排查

```bash
# 直接测试 token 是否有效
curl "https://api.telegram.org/bot<YOUR_TOKEN>/getMe"

# 正常响应
{"ok":true,"result":{"id":123,"is_bot":true,"first_name":"MyBot",...}}

# token 失效
{"ok":false,"error_code":404,"description":"Not Found"}
```

Token 失效原因：在 BotFather 中执行了 `Revoke current token`。解决：去 BotFather 获取新 token 并在控制面板更新。

### 获取个人 Chat ID

1. 私聊你的 bot 发任意消息
2. 访问：`https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates`
3. 在响应中找 `message.from.id`（个人 ID）或 `message.chat.id`（群组 ID，负数）

### 回复格式

回复使用 **MarkdownV2** 格式（`parse_mode: MarkdownV2`）。特殊字符会被自动转义：

```
_ * [ ] ( ) ~ ` > # + - = | { } . !
```

---

## 代理配置

如果服务器无法直接访问 Telegram，在系统设置中开启代理：

```json
{
  "settings": {
    "proxy": {
      "enabled": true,
      "host": "127.0.0.1",
      "port": 7890,
      "protocol": "http",
      "username": "",
      "password": ""
    }
  }
}
```

单独给 Telegram 开启代理：在控制面板 Telegram 配置中勾选"使用代理"。

代理配置有 **30 秒内存缓存**，修改配置后最多等待 30 秒生效。

---

## 开发约束（修改本模块前必读）

1. **禁止在 fetch() 中添加 `keepalive: true`** — 长轮询连接与 Bun 连接池不兼容
2. **`parse_mode` 必须与转义函数匹配** — 当前固定为 `MarkdownV2`，两处必须同步修改
3. **轮询调度统一用 `scheduleNextPolling(hasError, nextOffset)`** — 禁止裸 `setTimeout`
4. **404 不等于 token 失效** — 必须先 `getMe` 验证，再决定是否停止轮询
5. **`chatId` 为空时禁止发送** — 不得回落到 `'me'` 或其他占位值
