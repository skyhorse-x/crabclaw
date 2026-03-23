# 安全配置指南

## 🔐 概述

MiniMonkey 现在提供了完整的安全机制，包括：

- ✅ **API Key 加密存储** - AES-256-CBC 加密算法
- ✅ **身份认证系统** - Token-based 认证
- ✅ **权限管理** - 基于角色的权限控制
- ✅ **Token 刷新机制** - 自动续期
- ✅ **会话管理** - 过期时间控制

---

## 🚀 快速开始

### 1. 启用认证系统

创建或修改 `.env` 文件：

```bash
# 启用认证（生产环境必须设置为 true）
ENABLE_AUTH=true

# 认证密钥（请修改为随机字符串）
AUTH_SECRET_KEY=your-super-secret-key-change-in-production

# Token 过期时间（小时）
AUTH_TOKEN_EXPIRATION=24

# 加密密钥（用于 API Key 加密）
ENCRYPTION_PASSWORD=your-encryption-password-change-in-production

# 加密盐值（可选，建议设置）
ENCRYPTION_SALT=random-salt-string
```

### 2. 登录获取 Token

```bash
curl -X POST http://localhost:17871/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "your-password"
  }'
```

**响应**:
```json
{
  "ok": true,
  "message": "登录成功",
  "data": {
    "token": "abc123...",
    "expiresIn": 24,
    "user": {
      "id": "user-1234567890",
      "username": "admin"
    }
  }
}
```

### 3. 使用 Token 访问 API

```bash
curl http://localhost:17871/api/config \
  -H "Authorization: Bearer abc123..."
```

---

## 📚 API 接口

### 认证相关

#### POST `/api/auth/login` - 用户登录

**请求**:
```json
{
  "username": "admin",
  "password": "password123"
}
```

**响应**:
```json
{
  "ok": true,
  "message": "登录成功",
  "data": {
    "token": "xxx",
    "expiresIn": 24,
    "user": {
      "id": "user-xxx",
      "username": "admin"
    }
  }
}
```

#### POST `/api/auth/logout` - 用户登出

**请求头**:
```
Authorization: Bearer <token>
```

**响应**:
```json
{
  "ok": true,
  "message": "登出成功"
}
```

#### GET `/api/auth/me` - 获取当前用户信息

**请求头**:
```
Authorization: Bearer <token>
```

**响应**:
```json
{
  "ok": true,
  "data": {
    "user": {
      "id": "user-xxx",
      "username": "admin",
      "permissions": ["read", "write"]
    },
    "expiresAt": 1234567890
  }
}
```

#### POST `/api/auth/refresh` - 刷新 Token

**请求头**:
```
Authorization: Bearer <old-token>
```

**响应**:
```json
{
  "ok": true,
  "message": "Token 已刷新",
  "data": {
    "token": "new-token-xxx",
    "expiresIn": 24
  }
}
```

#### GET `/api/auth/status` - 获取认证状态

**响应**:
```json
{
  "ok": true,
  "data": {
    "authEnabled": true,
    "activeTokens": 5,
    "tokenExpiration": 24
  }
}
```

---

## 🔒 API Key 加密存储

### 自动加密

当您保存配置时，系统会自动加密 API Key：

```javascript
// 前端保存配置
await fetch('/api/config', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer <token>'
  },
  body: JSON.stringify({
    settings: {
      apiKey: 'sk-xxx...' // 明文 API Key
    }
  })
})
```

**后端处理流程**:
1. 接收明文 API Key
2. 使用 AES-256-CBC 加密
3. 将加密后的数据保存到 `apiKeyEncrypted` 字段
4. 读取时自动解密

### 配置文件格式

```json
{
  "settings": {
    "modelProvider": "openai",
    "modelName": "gpt-4o",
    "apiKey": "sk-xxx",           // 明文（兼容用）
    "apiKeyEncrypted": "iv:encrypted-data"  // 加密后（优先使用）
  }
}
```

**注意**: 系统会优先使用 `apiKeyEncrypted`，如果解密失败则回退到 `apiKey`。

---

## 🛡️ 安全最佳实践

### 1. 环境变量管理

**✅ 推荐做法**:
```bash
# .env.production
ENABLE_AUTH=true
AUTH_SECRET_KEY=$(openssl rand -hex 32)
ENCRYPTION_PASSWORD=$(openssl rand -hex 16)
```

**❌ 不推荐**:
```bash
# 不要使用默认密钥
AUTH_SECRET_KEY=default-encryption-key
```

### 2. 密钥生成

使用 OpenSSL 生成安全密钥：

```bash
# 生成 32 字节密钥
openssl rand -hex 32

# 生成 16 字节盐值
openssl rand -hex 16
```

### 3. 权限管理

为用户分配最小权限：

```typescript
// 普通用户
const token = authService.generateToken(
  userId,
  username,
  ['read'] // 只读权限
)

// 管理员
const adminToken = authService.generateToken(
  userId,
  username,
  ['read', 'write', 'admin'] // 完全权限
)
```

### 4. Token 安全

- ✅ 定期刷新 Token（建议每 23 小时）
- ✅ 登出时撤销 Token
- ✅ 不在 URL 中传递 Token
- ✅ 使用 HTTPS（生产环境）

---

## 🔧 配置选项

### AuthConfig

```typescript
interface AuthConfig {
  secretKey: string          // 认证密钥
  tokenExpiration: number    // Token 过期时间（小时）
  enableAuth: boolean        // 是否启用认证
}
```

### EncryptionConfig

```typescript
interface EncryptionConfig {
  password: string    // 加密密码
  salt?: string       // 加密盐值
  algorithm: string   // 加密算法（默认 aes-256-cbc）
  keylen: number      // 密钥长度（默认 32）
}
```

---

## ⚠️ 注意事项

### 1. 兼容性

- 为了向后兼容，明文 `apiKey` 仍然保留
- 系统优先使用加密的 `apiKeyEncrypted`
- 如果解密失败，回退到明文

### 2. 性能影响

- 加密/解密操作会增加少量延迟（< 10ms）
- Token 验证每次请求都会进行
- 建议启用缓存减少重复验证

### 3. 安全限制

- 当前实现基于内存存储 Token（重启失效）
- 生产环境建议使用 Redis 等持久化存储
- 敏感操作建议添加二次验证

---

## 🐛 故障排查

### Q1: Token 无效错误

**错误**: `Token 无效或已过期`

**解决方案**:
1. 检查 Token 是否正确传递
2. 确认 Token 未过期
3. 重新登录获取新 Token

### Q2: API Key 解密失败

**错误**: `解密失败`

**可能原因**:
- 加密密钥变更
- 配置文件损坏

**解决方案**:
1. 检查 `.env` 中的 `ENCRYPTION_PASSWORD` 是否正确
2. 重新输入明文 API Key 并保存

### Q3: 认证未生效

**问题**: 不需要 Token 也能访问 API

**解决方案**:
1. 确认 `ENABLE_AUTH=true`
2. 重启服务器
3. 检查环境变量是否加载

---

## 📖 相关文档

- [Bridge 使用指南](./BRIDGE_USAGE_GUIDE.md)
- [任务规划器使用指南](./TASK_PLANNER_GUIDE.md)
- [部署指南](./DEPLOYMENT_GUIDE.md)

---

<div align="center">

**Security Guide v1.0.0**

*保护您的 AI Agent 平台安全*

[加密算法：AES-256-CBC] [认证方式：Token-based] [权限控制：RBAC]

</div>
