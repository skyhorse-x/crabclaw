# 🚀 快速开始 - 前端错误处理

## ⚡ 5 分钟集成

### 1️⃣ 在根组件添加错误通知

编辑 `frontend/src/App.vue`，在模板顶部添加：

```vue
<template>
  <div id="app">
    <!-- 添加这行 -->
    <ErrorNotification />
    
    <!-- 你的其他内容 -->
    <router-view />
  </div>
</template>

<script>
import ErrorNotification from './components/ErrorNotification.vue'

export default {
  components: {
    ErrorNotification
  }
}
</script>
```

### 2️⃣ 使用错误边界包裹组件

```vue
<template>
  <ErrorBoundary can-retry @retry="loadData">
    <UserList :data="users" />
  </ErrorBoundary>
</template>

<script>
import ErrorBoundary from './components/ErrorBoundary.vue'

export default {
  components: { ErrorBoundary },
  
  data() {
    return { users: [] }
  },
  
  async mounted() {
    await this.loadData()
  },
  
  methods: {
    async loadData() {
      const response = await fetch('/api/users')
      const data = await response.json()
      this.users = data.users
    }
  }
}
</script>
```

### 3️⃣ 使用 API 客户端替换 fetch

**之前**:
```javascript
const response = await fetch('/api/users')
const data = await response.json()
```

**现在**:
```javascript
import { apiClient } from './utils/api-client'

const data = await apiClient.get('/api/users')
// 自动处理：Token、超时、错误、重试
```

---

## 🎯 常用场景

### 场景 1: 表单提交

```vue
<template>
  <el-form @submit.prevent="handleSubmit">
    <el-input v-model="form.email" placeholder="邮箱" />
    <el-button type="primary" native-type="submit">提交</el-button>
  </el-form>
</template>

<script>
import { apiClient } from './utils/api-client'
import { errorHandler, ErrorType } from './utils/error-handler'

export default {
  data() {
    return { form: { email: '' } }
  },
  
  methods: {
    async handleSubmit() {
      // 验证
      if (!this.form.email) {
        throw errorHandler.createValidationError(
          '请输入邮箱',
          'email'
        )
      }
      
      // 提交
      try {
        await apiClient.post('/api/users', this.form)
        this.$message.success('提交成功')
      } catch (error) {
        // 错误已自动显示
        console.error('提交失败:', error)
      }
    }
  }
}
</script>
```

### 场景 2: 文件上传

```javascript
async function uploadFile(file) {
  try {
    const formData = new FormData()
    formData.append('file', file)
    
    const response = await apiClient.request('/api/upload', {
      method: 'POST',
      body: formData
    })
    
    return response.data.url
  } catch (error) {
    if (error.type === ErrorType.NETWORK) {
      ElMessage.error('网络不稳定，请重试')
    }
    throw error
  }
}
```

### 场景 3: 批量加载数据

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

## 🔧 配置选项

### ErrorBoundary 属性

```vue
<ErrorBoundary
  :show-details="true"     <!-- 显示详细错误信息 -->
  :can-retry="true"        <!-- 显示重试按钮 -->
  :auto-recover-levels="[ErrorLevel.DEBUG, ErrorLevel.INFO]"
  @error="handleError"
  @retry="handleRetry"
  @close="handleClose"
/>
```

### ErrorNotification 属性

```vue
<ErrorNotification
  :auto-close="true"       <!-- 自动关闭 -->
  :max-notifications="5"   <!-- 最多显示 5 条 -->
/>
```

---

## 📊 错误级别

| 级别 | 颜色 | 自动关闭 | 使用场景 |
|------|------|----------|----------|
| DEBUG | 灰色 | 3 秒 | 调试日志 |
| INFO | 蓝色 | 5 秒 | 用户提示 |
| WARN | 黄色 | 8 秒 | 警告信息 |
| ERROR | 红色 | 10 秒 | 一般错误 |
| FATAL | 紫色 | ❌ | 严重错误 |

---

## 🐛 常见问题

### Q1: 如何手动触发错误通知？

```javascript
import { errorHandler, AppError, ErrorType } from './utils/error-handler'

errorHandler.handleError(
  new AppError('自定义错误消息', {
    type: ErrorType.VALIDATION,
    level: ErrorLevel.ERROR
  })
)
```

### Q2: 如何禁用自动 Token 刷新？

```javascript
// 不要调用 apiClient.init()
// 或手动设置 token
apiClient.setToken(localStorage.getItem('auth_token'))
```

### Q3: 如何全局捕获 Vue 组件错误？

```javascript
// main.js
import { errorHandler } from './utils/error-handler'

app.config.errorHandler = (err, instance, info) => {
  errorHandler.handleError(err)
}
```

---

## 📚 更多文档

- [完整 API 参考](./ERROR_HANDLING_GUIDE.md)
- [最佳实践](./ERROR_HANDLING_GUIDE.md#最佳实践)
- [故障排查](./ERROR_HANDLING_GUIDE.md#故障排查)

---

<div align="center">

**Quick Start Guide v1.0.0**

*5 分钟集成企业级错误处理系统*

[Vue 3] [Element Plus] [Auto Recovery]

</div>
