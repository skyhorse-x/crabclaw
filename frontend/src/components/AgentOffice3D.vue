<template>
  <div class="office-wrapper">
    <div class="office-header">
      <div class="office-title">代理办公室（3D）</div>
      <div class="office-meta">在线工位 {{ seats.length }}</div>
    </div>

    <div class="office-viewport">
      <div class="office-stage">
        <div class="office-room">
          <div class="room-floor"></div>
          <div class="room-ceiling"></div>
          <div class="room-wall room-wall-back">
            <div class="wall-window"></div>
            <div class="wall-window"></div>
            <div class="wall-lamp"></div>
          </div>
          <div class="room-wall room-wall-left"></div>
          <div class="room-wall room-wall-right"></div>

          <div
            v-for="seat in seats"
            :key="seat.agent.id"
            class="workstation"
            :style="{ left: seat.left, top: seat.top }"
          >
            <div class="desk-3d">
              <div class="desk-top"></div>
              <div class="desk-front"></div>
              <div class="desk-side"></div>
            </div>

            <div class="desk-monitor">{{ seat.agent.name }}</div>

            <div class="worker">
              <div class="worker-head" :style="{ backgroundColor: seat.agent.color || '#3b82f6' }"></div>
              <div class="worker-body" :class="`status-${seat.agent.status}`"></div>
              <div class="worker-chair"></div>
            </div>

            <div class="desk-name">{{ seat.agent.name }}</div>
            <div class="desk-task">{{ seat.agent.currentTask || '待命中' }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface AgentItem {
  id: string
  name: string
  color?: string
  status?: 'idle' | 'running' | 'paused' | 'error' | string
  currentTask?: string
}

const props = defineProps<{
  agents: AgentItem[]
}>()

const seats = computed(() => {
  const columns = 4
  const spacingX = 248
  const spacingY = 184
  const startX = 92
  const startY = 94
  return (props.agents || []).map((agent, index) => {
    const row = Math.floor(index / columns)
    const col = index % columns
    return {
      agent,
      left: `${startX + col * spacingX}px`,
      top: `${startY + row * spacingY}px`
    }
  })
})
</script>

<style scoped>
.office-wrapper {
  width: 100%;
}

.office-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.office-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.office-meta {
  font-size: 12px;
  color: var(--text-muted);
}

.office-viewport {
  border-radius: 14px;
  border: 1px solid var(--border-color);
  background: radial-gradient(circle at 50% 8%, #faf5ff 0%, #ede9fe 65%, #ddd6fe 100%);
  overflow: auto;
  min-height: 620px;
  padding: 18px;
}

.office-stage {
  width: 1160px;
  min-height: 790px;
  margin: 0 auto;
  perspective: 1600px;
}

.office-room {
  position: relative;
  width: 1120px;
  height: 760px;
  margin: 0 auto;
  transform-style: preserve-3d;
  transform: rotateX(56deg) rotateZ(-1deg);
}

.room-floor,
.room-ceiling,
.room-wall {
  position: absolute;
  inset: 0;
  border-radius: 18px;
}

.room-floor {
  background:
    linear-gradient(rgba(124, 58, 237, 0.1) 1px, transparent 1px),
    linear-gradient(90deg, rgba(124, 58, 237, 0.1) 1px, transparent 1px),
    #faf5ff;
  background-size: 52px 52px;
  box-shadow: inset 0 0 110px rgba(124, 58, 237, 0.14), 0 30px 56px rgba(76, 29, 149, 0.2);
}

.room-ceiling {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.35), rgba(255, 255, 255, 0.08));
  transform: translateZ(260px);
  opacity: 0.44;
}

.room-wall-back {
  height: 250px;
  top: 0;
  border-radius: 16px 16px 0 0;
  background: linear-gradient(180deg, #f5f3ff, #e9d5ff);
  border: 1px solid rgba(124, 58, 237, 0.22);
  transform-origin: top;
  transform: translateY(-250px) rotateX(90deg);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 44px;
}

.wall-window {
  width: 190px;
  height: 118px;
  border-radius: 10px;
  border: 6px solid rgba(124, 58, 237, 0.26);
  background: linear-gradient(180deg, #ddd6fe 0%, #c4b5fd 100%);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.6);
}

.wall-lamp {
  width: 74px;
  height: 16px;
  border-radius: 999px;
  background: #f8fafc;
  box-shadow: 0 0 24px rgba(255, 255, 255, 0.9);
}

.room-wall-left {
  width: 250px;
  left: 0;
  background: linear-gradient(90deg, #ede9fe, #f5f3ff);
  border: 1px solid rgba(124, 58, 237, 0.2);
  transform-origin: left;
  transform: translateX(-250px) rotateY(90deg);
}

.room-wall-right {
  width: 250px;
  left: auto;
  right: 0;
  background: linear-gradient(270deg, #ede9fe, #f5f3ff);
  border: 1px solid rgba(124, 58, 237, 0.2);
  transform-origin: right;
  transform: translateX(250px) rotateY(-90deg);
}

.workstation {
  position: absolute;
  width: 194px;
  min-height: 124px;
  padding: 8px 10px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.93);
  border: 1px solid rgba(148, 163, 184, 0.32);
  box-shadow: 0 10px 24px rgba(17, 24, 39, 0.2);
  transform: translateZ(28px);
}

.desk-3d {
  position: relative;
  width: 100%;
  height: 24px;
  margin-bottom: 7px;
}

.desk-top {
  height: 14px;
  border-radius: 7px 7px 3px 3px;
  background: linear-gradient(90deg, #3b82f6, #1d4ed8);
}

.desk-front {
  position: absolute;
  left: 6px;
  right: 6px;
  top: 12px;
  height: 9px;
  border-radius: 0 0 5px 5px;
  background: #6d28d9;
}

.desk-side {
  position: absolute;
  right: 0;
  top: 6px;
  width: 7px;
  height: 14px;
  border-radius: 0 4px 4px 0;
  background: #5b21b6;
}

.desk-monitor {
  height: 18px;
  border-radius: 6px;
  background: #111827;
  color: #e5e7eb;
  font-size: 10px;
  line-height: 18px;
  text-align: center;
  margin-bottom: 7px;
}

.worker {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 7px;
}

.worker-head {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.84);
}

.worker-body {
  width: 36px;
  height: 10px;
  border-radius: 999px;
  background: #94a3b8;
}

.worker-chair {
  width: 15px;
  height: 10px;
  border-radius: 4px;
  background: #64748b;
}

.status-idle { background: #94a3b8; }
.status-running { background: #16a34a; }
.status-paused { background: #d97706; }
.status-error { background: #dc2626; }

.desk-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.desk-task {
  font-size: 11px;
  color: var(--text-secondary);
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
