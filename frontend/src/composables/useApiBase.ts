import { ref } from 'vue'

// 在模块加载时立即确定 apiBase，避免组件 onMounted 时 apiBase 还是空字符串
// dev 模式（Vite proxy，port 5173/4173）：相对路径，保持空字符串
// 打包模式（Neutralino 内嵌 webview，port 既不是 5173 也不是 4173）：必须用绝对地址
function getInitialApiBase(): string {
  if (typeof window === 'undefined') return ''
  const port = parseInt(window.location.port)
  if ([4173, 5173].includes(port)) return ''
  // 打包模式：直接用默认端口，discoverBackend() 之后会修正
  return `http://127.0.0.1:${__BACKEND_PORT__}`
}

// 全局单例：所有组件共享同一个 apiBase
const apiBase = ref(getInitialApiBase())

export function useApiBase() {
  function buildApiUrl(path: string): string {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`
    return `${apiBase.value}${normalizedPath}`
  }

  // 探活实际后端端口（处理端口被占用后自动换端口的情况）
  async function discoverBackend(): Promise<void> {
    const port = parseInt(window.location.port)
    if ([4173, 5173].includes(port)) return

    const backendPort = __BACKEND_PORT__ || 17870
    const ports: number[] = Array.from(new Set([backendPort, 17870]))
    const candidates = ports.map(p => `http://127.0.0.1:${p}`)

    for (const base of candidates) {
      try {
        const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(2000) })
        if (res.ok) {
          apiBase.value = base
          return
        }
      } catch {
        // 继续下一个
      }
    }
    // 兜底保持当前值不变
  }

  return { apiBase, buildApiUrl, discoverBackend }
}
