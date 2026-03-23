# 🎨 前端错误处理指南

## 📋 概述

MiniMonkey 前端现在拥有完整的错误处理机制，包括：

- ✅ **全局错误捕获** - 自动捕获 JavaScript 和 Promise 错误
- ✅ **错误边界组件** - 优雅的错误展示和恢复
- ✅ **API 请求拦截** - 统一的网络错误处理
- ✅ **错误通知系统** - 友好的用户提示

---

## 🚀 快速开始

### 1. 使用错误边界组件

```vue
<template>
  <ErrorBoundary @error="handleError" @retry="handleRetry">
    <YourComponent />
  </ErrorBoundary>
</template>

<script>
import ErrorBoundary from './components/ErrorBoundary.vue'

export default {
  components: { ErrorBoundary },
  
  methods: {
    handleError(error) {
      console.error('组件发生错误:', error)
    },
    
    async handleRetry() {
      // 重试逻辑
      await this.loadData()
    }
  }
}
</script>
```

### 2. 使用 API 客户端

```javascript
import { apiClient } from './utils/api-client'

// GET 请求
const data = await apiClient.get('/api/config')

// POST 请求
const result = await apiClient.post('/api/skill', {
  name: 'My Skill',
  steps: [...]
})

// 带参数的请求
const users = await apiClient.get('/api/users', {
  page: 1,
  pageSize: 10
})
```

### 3. 显示错误通知

错误会自动显示在右上角：

```javascript
import { errorHandler } from './utils/error-handler'

// 手动触发错误通知
errorHandler.handleError(
  new AppError('操作失败', {
    type: ErrorType.VALIDATION,
    level: ErrorLevel.ERROR
  })
)
```

---

## 📚 API 参考

### ErrorHandler

全局错误处理器，提供以下功能：

#### 创建错误

```javascript
// 网络错误
errorHandler.createNetworkError('网络连接失败', 500)

// API 错误
errorHandler.createAPIError('接口调用失败', '/api/users')

// 认证错误
errorHandler.createAuthError('登录已过期')

// 验证错误
errorHandler.createValidationError('邮箱格式不正确', 'email')
```

#### 监听错误

```javascript
// 添加监听器
const unsubscribe = errorHandler.addListener((error) => {
  console.log('收到错误:', error)
})

// 移除监听器
unsubscribe()
```

#### 获取错误历史

```javascript
// 获取最近 10 个错误
const errors = errorHandler.getRecentErrors(10)

// 清除所有错误
errorHandler.clearErrors()
```

---

### ApiClient

统一的 API 请求客户端。

#### 配置

```javascript
// 设置 Token
apiClient.setToken('your-jwt-token')

// 清除 Token
apiClient.clearToken()

// 从 localStorage 自动恢复
apiClient.init()
```

#### 请求方法

```javascript
// GET
const data = await apiClient.get(endpoint, params)

// POST
const result = await apiClient.post(endpoint, body)

// PUT
await apiClient.put(endpoint, body)

// DELETE
await apiClient.delete(endpoint)
```

#### 自动功能

- ✅ **Token 自动刷新** - 401 错误时自动刷新 Token
- ✅ **超时控制** - 30 秒超时自动取消
- ✅ **错误统一处理** - 所有错误都会通过 ErrorHandler 处理
- ✅ **认证检查** - 自动携带 Token

---

### ErrorBoundary

错误边界组件属性：

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `showDetails` | Boolean | `true` | 显示详细信息 |
| `canRetry` | Boolean | `false` | 允许重试 |
| `autoRecoverLevels` | Array | `[DEBUG, INFO]` | 自动恢复的错误级别 |

#### 事件

```vue
<ErrorBoundary
  @error="handleError"
  @retry="handleRetry"
  @close="handleClose"
>
```

---

### ErrorNotification

错误通知组件属性：

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `autoClose` | Boolean | `true` | 自动关闭 |
| `maxNotifications` | Number | `5` | 最大显示数量 |

---

## 🎯 最佳实践

### 1. 组件错误处理

```vue
<template>
  <ErrorBoundary can-retry @retry="loadData">
    <UserList :data="users" />
  </ErrorBoundary>
</template>

<script>
export default {
  data() {
    return {
      users: [],
      loading: false
    }
  },
  
  async mounted() {
    await this.loadData()
  },
  
  methods: {
    async loadData() {
      this.loading = true
      try {
        const response = await apiClient.get('/api/users')
        this.users = response.data.users
      } catch (error) {
        // 错误已被自动处理和显示
        console.error('加载失败:', error)
      } finally {
        this.loading = false
      }
    }
  }
}
</script>
```

### 2. 表单验证错误

```javascript
async function handleSubmit(form) {
  try {
    // 验证表单
    if (!form.email) {
      throw errorHandler.createValidationError(
        '请输入邮箱',
        'email'
      )
    }
    
    // 提交数据
    await apiClient.post('/api/users', form)
    
    ElMessage.success('提交成功')
  } catch (error) {
    // 错误会被自动显示
    console.error('提交失败:', error)
  }
}
```

### 3. 文件上传错误处理

```javascript
async function uploadFile(file) {
  try {
    const formData = new FormData()
    formData.append('file', file)
    
    const response = await apiClient.request('/api/upload', {
      method: 'POST',
      body: formData,
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })
    
    return response.data.url
  } catch (error) {
    if (error.type === ErrorType.NETWORK) {
      ElMessage.error('网络不稳定，请重试')
    } else if (error.type === ErrorType.API) {
      ElMessage.error(error.message)
    }
    throw error
  }
}
```

### 4. 批量请求错误处理

```javascript
async function loadAllData() {
  const endpoints = ['/api/users', '/api/posts', '/api/comments']
  
  const results = await Promise.allSettled(
    endpoints.map(endpoint => apiClient.get(endpoint))
  )
  
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error(`加载 ${endpoints[index]} 失败:`, result.reason)
    }
  })
  
  return results
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value)
}
```

---

## 🔧 自定义错误类型

```javascript
// 扩展错误类型
export const CustomErrorType = {
  ...ErrorType,
  BUSINESS: 'business',
  PERMISSION: 'permission'
}

// 创建自定义错误
class BusinessError extends AppError {
  constructor(message, code) {
    super(message, {
      type: CustomErrorType.BUSINESS,
      code
    })
  }
}

// 使用
throw new BusinessError('库存不足', 'STOCK_INSUFFICIENT')
```

---

## 📊 错误级别说明

| 级别 | 颜色 | 自动关闭 | 使用场景 |
|------|------|----------|----------|
| **DEBUG** | 灰色 | 3 秒 | 调试信息 |
| **INFO** | 蓝色 | 5 秒 | 用户提示 |
| **WARN** | 黄色 | 8 秒 | 警告信息 |
| **ERROR** | 红色 | 10 秒 | 一般错误 |
| **FATAL** | 紫色 | ❌ 不关闭 | 严重错误 |

---

## 🐛 故障排查

### Q1: 错误通知不显示

**检查**:
1. 确认已导入 `ErrorNotification` 组件
2. 检查是否在根组件中使用
3. 查看控制台是否有错误

### Q2: API 请求未携带 Token

**解决**:
```javascript
// 确保调用了 init()
apiClient.init()

// 或手动设置 Token
apiClient.setToken(localStorage.getItem('auth_token'))
```

### Q3: 错误边界不生效

**原因**: 错误发生在异步操作中

**解决**:
```vue
<!-- ✅ 正确用法 -->
<ErrorBoundary>
  <AsyncComponent />
</ErrorBoundary>

<!-- ❌ 错误用法 -->
<ErrorBoundary>
  <button @click="asyncOperation">Click</button>
</ErrorBoundary>
```

---

## 📈 性能优化

### 1. 限制错误数量

```javascript
// 最多保存 50 个错误
errorHandler.maxErrors = 50
```

### 2. 防止重复通知

```javascript
// 添加去重逻辑
const seenErrors = new Set()

errorHandler.addListener((error) => {
  const key = `${error.type}-${error.message}`
  if (seenErrors.has(key)) return
  seenErrors.add(key)
})
```

### 3. 延迟上报服务器

```javascript
// 批量上报，减少请求次数
let errorBuffer = []
let reportTimer = null

errorHandler.addListener((error) => {
  errorBuffer.push(error)
  
  clearTimeout(reportTimer)
  reportTimer = setTimeout(() => {
    if (errorBuffer.length > 0) {
      // 批量上报
      fetch('/api/error/report', {
        method: 'POST',
        body: JSON.stringify(errorBuffer)
      })
      errorBuffer = []
    }
  }, 5000)
})
```

---

## 🎨 样式定制

修改主题色：

```css
/* styles.css */
.error-notification.error-error {
  border-left-color: #ff4d4f; /* 自定义红色 */
}

.error-notification.error-error .notification-icon {
  color: #ff4d4f;
}
```

---

<div align="center">

**Frontend Error Handling Guide v1.0.0**

*构建更健壮的前端应用*

[Vue 3] [Element Plus] [Error Boundary] [Auto Recovery]

</div>
