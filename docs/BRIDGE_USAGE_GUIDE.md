# Bridge 桥接层使用指南

## 📖 概述

Bridge 桥接层提供了后端服务器与 Neutralinojs 桌面端通信的能力，使得 AI Agent 可以执行系统级操作，如：

- ✅ 鼠标控制（移动、点击、双击）
- ✅ 键盘输入（文本输入、组合键）
- ✅ 屏幕操作（截图、获取尺寸）
- ✅ 窗口管理（获取活动窗口信息）
- ✅ 系统命令执行

---

## 🏗️ 架构设计

```
┌─────────────────┐
│   AI Agent      │
│  (任务规划器)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  callBridge()   │
│  (统一接口)     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ BridgeService   │
│  (HTTP 客户端)   │
└────────┬────────┘
         │
         ▼ HTTP POST /api/bridge/*
┌─────────────────┐
│ Neutralino.js   │
│  (桌面前端)     │
└────────┬────────┘
         │
         ▼ Native API
┌─────────────────┐
│   Operating     │
│    System       │
└─────────────────┘
```

---

## 🚀 快速开始

### 1. 基本使用

```typescript
import { getBridgeService } from './server/services/bridge.service'

const bridge = getBridgeService()
await bridge.testConnection()

// 移动鼠标到坐标 (500, 300)
const result = await bridge.call('mouse.move', { x: 500, y: 300 })
console.log(result) // { ok: true, message: '...' }

// 点击鼠标左键
await bridge.call('mouse.click', { button: 'left' })

// 输入文本
await bridge.call('keyboard.type', { text: 'Hello World' })
```

### 2. 使用工具调用

```typescript
import { toolRegistry } from './server/tools'

// 通过工具系统调用 Bridge
const result = await toolRegistry.executeTool('bridge_call', {
  command: 'mouse.move',
  payload: { x: 100, y: 200 }
})
```

---

## 📚 API 接口

### 鼠标控制

#### GET `/api/bridge/mouse/position`
获取鼠标当前位置

**响应**:
```json
{
  "ok": true,
  "result": { "x": 500, "y": 300 }
}
```

#### POST `/api/bridge/mouse/move`
移动鼠标到指定位置

**请求**:
```json
{
  "x": 500,
  "y": 300
}
```

**响应**:
```json
{
  "ok": true,
  "message": "鼠标已移动到 (500, 300)"
}
```

#### POST `/api/bridge/mouse/click`
点击鼠标

**请求**:
```json
{
  "button": "left"  // left | right | middle
}
```

**响应**:
```json
{
  "ok": true,
  "message": "左键点击完成"
}
```

#### POST `/api/bridge/mouse/double-click`
双击鼠标

**响应**:
```json
{
  "ok": true,
  "message": "双击完成"
}
```

---

### 键盘控制

#### POST `/api/bridge/keyboard/type`
输入文本（通过剪贴板）

**请求**:
```json
{
  "text": "Hello World"
}
```

**响应**:
```json
{
  "ok": true,
  "message": "文本已复制到剪贴板：Hello World"
}
```

#### POST `/api/bridge/keyboard/hotkey`
按下组合键

**请求**:
```json
{
  "keys": ["ctrl", "c"]
}
```

**响应**:
```json
{
  "ok": true,
  "message": "组合键命令已发送"
}
```

---

### 屏幕操作

#### GET `/api/bridge/screen/size`
获取屏幕尺寸

**响应**:
```json
{
  "ok": true,
  "result": {
    "width": 1920,
    "height": 1080
  }
}
```

#### POST `/api/bridge/screen/capture`
截取屏幕

**响应**:
```json
{
  "ok": true,
  "result": "data:image/png;base64,iVBORw0KG..."
}
```

---

### 通用接口

#### POST `/api/bridge/call`
通用 Bridge 调用接口

**请求**:
```json
{
  "command": "mouse.move",
  "payload": {
    "x": 100,
    "y": 200
  }
}
```

**支持的命令前缀**:
- `mouse.*` - 鼠标相关
- `keyboard.*` - 键盘相关
- `window.*` - 窗口相关
- `screen.*` - 屏幕相关
- `system.*` - 系统相关

---

## 💡 使用示例

### 示例 1: 打开应用程序

```typescript
// 1. 点击开始菜单
await callBridge('mouse.move', { x: 50, y: 1050 })
await callBridge('mouse.click', { button: 'left' })

// 2. 输入应用名称
await callBridge('keyboard.type', { text: '记事本' })

// 3. 按回车打开
await callBridge('keyboard.hotkey', { keys: ['enter'] })
```

### 示例 2: 截图并保存

```typescript
// 1. 截取屏幕
const screenshotResult = await callBridge('screen.capture')

if (screenshotResult.ok) {
  const base64Image = screenshotResult.result
  
  // 2. 保存到文件
  await writeToFile('./screenshots/capture.png', base64Image)
  
  console.log('截图已保存')
}
```

### 示例 3: 表单填写

```typescript
// 1. 移动到第一个输入框
await callBridge('mouse.move', { x: 600, y: 400 })
await callBridge('mouse.click', { button: 'left' })

// 2. 输入用户名
await callBridge('keyboard.type', { text: 'zhangsan' })

// 3. 按 Tab 切换到下一个输入框
await callBridge('keyboard.hotkey', { keys: ['tab'] })

// 4. 输入密码
await callBridge('keyboard.type', { text: 'password123' })

// 5. 提交
await callBridge('keyboard.hotkey', { keys: ['enter'] })
```

---

## 🔧 配置选项

### BridgeConfig

```typescript
interface BridgeConfig {
  frontendPort: number    // 前端端口，默认 4173
  timeout: number         // 超时时间（毫秒），默认 5000
}
```

### 自定义配置

```typescript
import { getBridgeService } from './server/services/bridge.service'

const bridgeService = getBridgeService({
  frontendPort: 3000,
  timeout: 10000
})
```

---

## ⚠️ 注意事项

### 1. 环境依赖

- Bridge 功能**仅在 Neutralino 桌面环境中可用**
- 开发模式下需要同时启动前后端
- 生产模式下需要构建完整的桌面应用

### 2. 安全限制

- 某些系统操作可能需要管理员权限
- 键盘输入通过剪贴板实现，可能被安全软件拦截
- 部分功能在不同操作系统上表现可能不同

### 3. 性能考虑

- 避免频繁调用鼠标/键盘操作（建议间隔 > 100ms）
- 截图操作较消耗资源，不建议高频使用
- 大量文本输入建议分批进行

---

## 🐛 故障排查

### Q1: Bridge 连接失败

**错误**: `Bridge 服务未连接，请确保前端已启动`

**解决方案**:
1. 确认前端已启动：`npm run frontend:dev`
2. 检查端口是否正确（默认 4173）
3. 测试连接：`GET /api/bridge/ping`

### Q2: 鼠标/键盘操作无响应

**可能原因**:
- Neutralino 权限不足
- 目标应用有安全防护
- 操作系统限制

**解决方案**:
1. 以管理员身份运行应用
2. 检查系统权限设置
3. 尝试使用系统自带的自动化工具

### Q3: 截图返回空白图片

**解决方案**:
1. 检查显示器是否开启
2. 确认有多显示器时选择正确的屏幕
3. 更新显卡驱动

---

## 🔗 相关文档

- [Neutralino.js 官方文档](https://neutralino.js.org/docs)
- [MCP 协议文档](https://modelcontextprotocol.io)
- [任务规划器使用指南](./TASK_PLANNER_GUIDE.md)

---

<div align="center">

**Bridge Service v1.0.0**

*桌面自动化核心组件*

[支持平台：Windows/macOS/Linux] [依赖：Neutralino.js]

</div>
