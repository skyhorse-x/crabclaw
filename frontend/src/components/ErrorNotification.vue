<template>
  <div class="error-notification-container">
    <transition-group name="error-slide">
      <div
        v-for="err in errors"
        :key="err.timestamp"
        class="error-notification"
        :class="`error-${err.level}`"
      >
        <div class="error-notification-content">
          <el-icon class="notification-icon">
            <component :is="getErrorIcon(err.level)" />
          </el-icon>
          
          <div class="notification-body">
            <div class="notification-title">{{ getTitle(err.level) }}</div>
            <div class="notification-message">{{ err.message }}</div>
          </div>
          
          <div class="notification-actions">
            <el-button
              link
              size="small"
              @click="handleClose(err)"
            >
              <el-icon><Close /></el-icon>
            </el-button>
          </div>
        </div>
        
        <el-progress
          v-if="autoClose && err.level !== 'fatal'"
          :percentage="100"
          :duration="getDuration(err.level)"
          :show-text="false"
          class="notification-progress"
        />
      </div>
    </transition-group>
  </div>
</template>

<script>
import { ref, onMounted, onUnmounted } from 'vue'
import { Close, Warning, InfoFilled, CircleCheckFilled } from '@element-plus/icons-vue'
import { errorHandler, ErrorLevel } from '../utils/error-handler'

export default {
  name: 'ErrorNotification',
  
  components: {
    Close,
    Warning,
    InfoFilled,
    CircleCheckFilled
  },
  
  props: {
    // 是否自动关闭
    autoClose: {
      type: Boolean,
      default: true
    },
    // 最大显示数量
    maxNotifications: {
      type: Number,
      default: 5
    }
  },
  
  setup() {
    const errors = ref([])
    let unsubscribe = null
    
    // 获取图标
    const getErrorIcon = (level) => {
      const icons = {
        [ErrorLevel.DEBUG]: 'InfoFilled',
        [ErrorLevel.INFO]: 'InfoFilled',
        [ErrorLevel.WARN]: 'Warning',
        [ErrorLevel.ERROR]: 'Warning',
        [ErrorLevel.FATAL]: 'Warning'
      }
      return icons[level] || 'Warning'
    }
    
    // 获取标题
    const getTitle = (level) => {
      const titles = {
        [ErrorLevel.DEBUG]: '调试',
        [ErrorLevel.INFO]: '提示',
        [ErrorLevel.WARN]: '警告',
        [ErrorLevel.ERROR]: '错误',
        [ErrorLevel.FATAL]: '严重错误'
      }
      return titles[level] || '错误'
    }
    
    // 获取自动关闭时间
    const getDuration = (level) => {
      const durations = {
        [ErrorLevel.DEBUG]: 3,
        [ErrorLevel.INFO]: 5,
        [ErrorLevel.WARN]: 8,
        [ErrorLevel.ERROR]: 10,
        [ErrorLevel.FATAL]: 0 // 不自动关闭
      }
      return (durations[level] || 5) * 1000
    }
    
    // 添加错误通知
    const addError = (error) => {
      errors.value.unshift(error)
      
      // 限制数量
      if (errors.value.length > this.maxNotifications) {
        errors.value.pop()
      }
      
      // 自动移除
      if (this.autoClose && error.level !== ErrorLevel.FATAL) {
        setTimeout(() => {
          removeError(error)
        }, getDuration(error.level))
      }
    }
    
    // 移除错误通知
    const removeError = (error) => {
      const index = errors.value.findIndex(e => e.timestamp === error.timestamp)
      if (index > -1) {
        errors.value.splice(index, 1)
      }
    }
    
    // 关闭处理
    const handleClose = (error) => {
      removeError(error)
    }
    
    // 监听错误
    onMounted(() => {
      unsubscribe = errorHandler.addListener(addError)
    })
    
    onUnmounted(() => {
      if (unsubscribe) {
        unsubscribe()
      }
    })
    
    return {
      errors,
      getErrorIcon,
      getTitle,
      getDuration,
      handleClose
    }
  }
}
</script>

<style scoped>
.error-notification-container {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 400px;
}

.error-notification {
  padding: 16px;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  position: relative;
  overflow: hidden;
}

.error-notification.error-debug {
  border-left: 4px solid #666;
}

.error-notification.error-info {
  border-left: 4px solid #1890ff;
}

.error-notification.error-warn {
  border-left: 4px solid #faad14;
}

.error-notification.error-error {
  border-left: 4px solid #f5222d;
}

.error-notification.error-fatal {
  border-left: 4px solid #722ed1;
}

.error-notification-content {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.notification-icon {
  font-size: 20px;
  flex-shrink: 0;
  margin-top: 2px;
}

.error-notification.error-debug .notification-icon { color: #666; }
.error-notification.error-info .notification-icon { color: #1890ff; }
.error-notification.error-warn .notification-icon { color: #faad14; }
.error-notification.error-error .notification-icon { color: #f5222d; }
.error-notification.error-fatal .notification-icon { color: #722ed1; }

.notification-body {
  flex: 1;
  min-width: 0;
}

.notification-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 4px;
  color: #303133;
}

.notification-message {
  font-size: 13px;
  line-height: 1.5;
  color: #606266;
  word-break: break-all;
}

.notification-actions {
  flex-shrink: 0;
  margin-left: 8px;
}

.notification-progress {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 2px;
}

.notification-progress :deep(.el-progress-bar) {
  padding-right: 0;
}

.notification-progress :deep(.el-progress-bar__outer) {
  height: 2px;
}

/* 动画 */
.error-slide-enter-active,
.error-slide-leave-active {
  transition: all 0.3s ease;
}

.error-slide-enter-from {
  transform: translateX(100%);
  opacity: 0;
}

.error-slide-enter-to {
  transform: translateX(0);
  opacity: 1;
}

.error-slide-leave-from {
  transform: translateX(0);
  opacity: 1;
}

.error-slide-leave-to {
  transform: translateX(100%);
  opacity: 0;
}
</style>
