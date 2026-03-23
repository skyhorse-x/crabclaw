# 🔐 快速部署指南

## 📋 环境准备

### 系统要求

- **Node.js**: v18+ 或 **Bun**: v1.0+
- **操作系统**: macOS / Linux / Windows (WSL)
- **内存**: 至少 2GB
- **磁盘**: 至少 500MB

---

## ⚡ 快速开始

### 1. 克隆项目

```bash
git clone <repository-url>
cd MiniMonkey
```

### 2. 安装依赖

```bash
# 使用 npm
npm install

# 或使用 bun（推荐）
bun install
```

### 3. 配置环境变量

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑 .env 文件，配置必要参数
vim .env
```

### 4. 生成安全密钥

**重要**: 生产环境必须修改默认密钥！

```bash
# 生成认证密钥（32 字节）
AUTH_SECRET_KEY=$(openssl rand -hex 32)

# 生成加密密码（16 字节）
ENCRYPTION_PASSWORD=$(openssl rand -hex 16)

# 生成加密盐值（8 字节）
ENCRYPTION_SALT=$(openssl rand -hex 8)
```

将生成的值填入 `.env` 文件。

### 5. 启动应用

```bash
# 开发模式（热重载）
npm run dev

# 或分别启动
npm run backend:watch  # 后端
npm run frontend:dev   # 前端
```

访问：http://localhost:17871

---

## 🔒 安全配置

### 必选项

| 配置项 | 说明 | 默认值 | 建议 |
|--------|------|--------|------|
| `ENABLE_AUTH` | 启用身份认证 | `false` | **生产环境必须为 true** |
| `AUTH_SECRET_KEY` | 认证密钥 | 固定字符串 | 使用 openssl 随机生成 |
| `ENCRYPTION_PASSWORD` | 加密密码 | 固定字符串 | 使用 openssl 随机生成 |
| `DEFAULT_ADMIN_PASSWORD` | 管理员密码 | `admin123` | **必须修改为强密码** |

### 默认账户

- **用户名**: `admin`
- **密码**: `.env` 中配置的 `DEFAULT_ADMIN_PASSWORD`

**⚠️ 警告**: 首次启动后请立即修改管理员密码！

---

## 🛠️ 部署选项

### 选项 1: 本地部署

适合个人使用和开发测试。

```bash
# 直接运行
npm run dev
```

### 选项 2: Docker 部署（推荐生产环境）

创建 `Dockerfile`:

```dockerfile
FROM oven/bun:1

WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

COPY . .

EXPOSE 17871

CMD ["bun", "run", "server/core/server.ts"]
```

构建和运行:

```bash
docker build -t minimonkey .
docker run -d -p 17871:17871 \
  -e ENABLE_AUTH=true \
  -e AUTH_SECRET_KEY=$(openssl rand -hex 32) \
  -e ENCRYPTION_PASSWORD=$(openssl rand -hex 16) \
  minimonkey
```

### 选项 3: PM2 部署

```bash
# 安装 PM2
npm install -g pm2

# 创建 ecosystem.config.js
module.exports = {
  apps: [{
    name: 'minimonkey',
    script: 'bun',
    args: 'run server/core/server.ts',
    env: {
      NODE_ENV: 'production',
      ENABLE_AUTH: 'true'
    }
  }]
}

# 启动
pm2 start
pm2 save
pm2 startup
```

---

## 📊 生产环境检查清单

部署前请确认以下项目：

### 安全配置
- [ ] `ENABLE_AUTH=true`
- [ ] `AUTH_SECRET_KEY` 已更换为随机值
- [ ] `ENCRYPTION_PASSWORD` 已更换为随机值
- [ ] `DEFAULT_ADMIN_PASSWORD` 已修改
- [ ] API Key 已加密存储

### 性能优化
- [ ] 启用日志级别为 WARN 或 ERROR
- [ ] 配置适当的缓存策略
- [ ] 设置进程数（PM2）
- [ ] 启用 Gzip 压缩

### 监控运维
- [ ] 配置日志轮转
- [ ] 设置健康检查端点
- [ ] 配置告警通知
- [ ] 备份策略

---

## 🔧 故障排查

### Q1: 无法启动

**错误**: `Port 17871 is already in use`

**解决方案**:
```bash
# 查找占用端口的进程
lsof -i :17871

# 杀死进程
kill -9 <PID>

# 或修改端口
echo "BACKEND_PORT=17872" >> .env
```

### Q2: 认证失败

**错误**: `Token 无效或已过期`

**解决方案**:
1. 检查 `.env` 中的 `AUTH_SECRET_KEY` 是否正确
2. 清除浏览器缓存
3. 重新登录获取新 Token

### Q3: API Key 解密失败

**错误**: `解密失败`

**原因**: `ENCRYPTION_PASSWORD` 变更

**解决方案**:
1. 恢复原来的 `ENCRYPTION_PASSWORD`
2. 或重新输入明文 API Key 并保存

---

## 📈 性能调优

### 日志级别

生产环境建议只记录 WARN 和 ERROR:

```bash
# .env
LOG_LEVEL=WARN
```

### 并发配置

```bash
# 最大并发任务数
MAX_CONCURRENT_TASKS=5

# Token 刷新间隔（小时）
AUTH_TOKEN_EXPIRATION=24
```

### 缓存优化

```bash
# 配置缓存 TTL（毫秒）
CACHE_TTL=5000
```

---

## 🔄 更新升级

```bash
# 拉取最新代码
git pull origin main

# 安装新依赖
npm install

# 重启服务
pm2 restart minimonkey

# 或 Docker 重新构建
docker-compose build && docker-compose up -d
```

---

## 📞 技术支持

遇到问题？

- 📖 查看 [完整文档](./PROJECT_DOCUMENTATION.md)
- 🔐 [安全配置指南](./SECURITY_CONFIG_GUIDE.md)
- 🌉 [Bridge 使用指南](./BRIDGE_USAGE_GUIDE.md)
- 🤖 [AI 任务规划指南](./TASK_PLANNER_GUIDE.md)

---

<div align="center">

**Deployment Guide v1.0.0**

*快速、安全地部署您的 AI Agent 平台*

[Node.js 18+] [Bun 1.0+] [Docker] [PM2]

</div>
