<template>
  <div class="error-boundary">
    <slot v-if="!hasError" />
    
    <div v-else class="error-fallback" :class="`error-${error.level}`">
      <div class="error-header">
        <el-icon class="error-icon"><WarningFilled /></el-icon>
        <h3>{{ getTitle(error.level) }}</h3>
      </div>
      
      <div class="error-content">
        <p class="error-message">{{ error.message }}</p>
        
        <el-collapse v-if="showDetails" class="error-details">
          <el-collapse-item title="详细信息" name="details">
            <div class="detail-row">
              <span class="label">错误类型:</span>
              <span class="value">{{ error.type }}</span>
            </div>
            <div class="detail-row" v-if="error.code">
              <span class="label">错误代码:</span>
              <span class="value">{{ error.code }}</span>
            </div>
            <div class="detail-row">
              <span class="label">发生时间:</span>
              <span class="value">{{ formatTime(error.timestamp) }}</span>
            </div>
            <div class="detail-row" v-if="error.stack">
              <span class="label">堆栈跟踪:</span>
              <pre class="stack-trace">{{ error.stack }}</pre>
            </div>
          </el-collapse-item>
        </el-collapse>
      </div>
      
      <div class="error-actions">
        <el-button type="primary" @click="handleRetry" v-if="canRetry">
          <el-icon><Refresh /></el-icon>
          重试
        </el-button>
        <el-button @click="handleClose">
          <el-icon><Close /></el-icon>
          关闭
        </el-button>
        <el-button type="danger" @click="handleClearAll">
          <el-icon><Delete /></el-icon>
          清除所有错误
        </el-button>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, watch } from 'vue'
import { WarningFilled, Refresh, Close, Delete } from '@element-plus/icons-vue'
import { errorHandler, ErrorLevel } from '../utils/error-handler'

export default {
  name: 'ErrorBoundary',
  
  components: {
    WarningFilled,
    Refresh,
    Close,
    Delete
  },
  
  props: {
    // 是否显示详细信息
    showDetails: {
      type: Boolean,
      default: true
    },
    // 是否可以重试
    canRetry: {
      type: Boolean,
      default: false
    },
    // 自动恢复的错误级别
    autoRecoverLevels: {
      type: Array,
      default: () => [ErrorLevel.DEBUG, ErrorLevel.INFO]
    }
  },
  
  emits: ['error', 'retry', 'close'],
  
  setup(props, { emit }) {
    const hasError = ref(false)
    const error = ref(null)
    const retryCount = ref(0)
    const maxRetries = 3
    
    // 监听错误
    const handleError = (err) => {
      // 检查是否应该自动恢复
      if (props.autoRecoverLevels.includes(err.level)) {
        return
      }
      
      error.value = err
      hasError.value = true
      retryCount.value = 0
      
      emit('error', err)
    }
    
    // 监听错误处理器
    watch(
      () => errorHandler.getRecentErrors(1)[0],
      (newError) => {
        if (newError && !hasError.value) {
          handleError(newError)
        }
      }
    )
    
    // 重试处理
    const handleRetry = async () => {
      if (retryCount.value >= maxRetries) {
        errorHandler.handleError(
          new Error('超过最大重试次数')
        )
        return
      }
      
      retryCount.value++
      hasError.value = false
      
      try {
        await emit('retry')
      } catch (err) {
        handleError(err)
      }
    }
    
    // 关闭错误提示
    const handleClose = () => {
      hasError.value = false
      error.value = null
      emit('close')
    }
    
    // 清除所有错误
    const handleClearAll = () => {
      errorHandler.clearErrors()
      handleClose()
    }
    
    // 获取标题
    const getTitle = (level) => {
      const titles = {
        [ErrorLevel.DEBUG]: '调试信息',
        [ErrorLevel.INFO]: '提示信息',
        [ErrorLevel.WARN]: '警告',
        [ErrorLevel.ERROR]: '错误',
        [ErrorLevel.FATAL]: '严重错误'
      }
      return titles[level] || '未知错误'
    }
    
    // 格式化时间
    const formatTime = (timestamp) => {
      const date = new Date(timestamp)
      return date.toLocaleString('zh-CN')
    }
    
    return {
      hasError,
      error,
      handleRetry,
      handleClose,
      handleClearAll,
      getTitle,
      formatTime
    }
  }
}
</script>

<style scoped>
.error-boundary {
  width: 100%;
  min-height: inherit;
}

.error-fallback {
  padding: 24px;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}

.error-fallback.error-debug {
  border-left: 4px solid #666;
}

.error-fallback.error-info {
  border-left: 4px solid #1890ff;
}

.error-fallback.error-warn {
  border-left: 4px solid #faad14;
}

.error-fallback.error-error {
  border-left: 4px solid #f5222d;
}

.error-fallback.error-fatal {
  border-left: 4px solid #722ed1;
}

.error-header {
  display: flex;
  align-items: center;
  margin-bottom: 16px;
}

.error-icon {
  font-size: 24px;
  margin-right: 12px;
}

.error-fallback.error-debug .error-icon { color: #666; }
.error-fallback.error-info .error-icon { color: #1890ff; }
.error-fallback.error-warn .error-icon { color: #faad14; }
.error-fallback.error-error .error-icon { color: #f5222d; }
.error-fallback.error-fatal .error-icon { color: #722ed1; }

.error-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.error-content {
  margin-bottom: 20px;
}

.error-message {
  margin: 0 0 16px 0;
  font-size: 14px;
  line-height: 1.6;
  color: #333;
}

.error-details {
  border: 1px solid #ebeef5;
  border-radius: 4px;
}

.detail-row {
  display: flex;
  margin-bottom: 12px;
  font-size: 13px;
}

.detail-row:last-child {
  margin-bottom: 0;
}

.detail-row .label {
  width: 100px;
  color: #606266;
  flex-shrink: 0;
}

.detail-row .value {
  color: #303133;
  word-break: break-all;
}

.stack-trace {
  margin: 8px 0;
  padding: 12px;
  background: #f5f7fa;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  color: #606266;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

.error-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
</style>
