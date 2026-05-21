import { ref } from 'vue'

const DEV_PORTS = [4173, 5173]

declare const __BACKEND_PORT__: number

function isDevMode(): boolean {
  if (typeof window === 'undefined') return false
  return DEV_PORTS.includes(parseInt(window.location.port))
}

function getInitialApiBase(): string {
  if (typeof window === 'undefined') return ''
  if (isDevMode()) return ''
  return `http://127.0.0.1:${__BACKEND_PORT__ || 17870}`
}

const apiBase = ref(getInitialApiBase())

export function useApiBase() {
  function buildApiUrl(path: string): string {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`
    return `${apiBase.value}${normalizedPath}`
  }

  function getWsBase(): string {
    if (isDevMode()) return ''
    return apiBase.value.replace(/^http/, 'ws')
  }

  // 探活单个地址，超时内返回 true/false
  async function probe(base: string, timeout: number): Promise<boolean> {
    try {
      const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(timeout) })
      return res.ok
    } catch {
      return false
    }
  }

  // 并发探活候选端口，带重试，最多等待 backendStartupMs 毫秒
  async function discoverBackend(): Promise<void> {
    if (isDevMode()) return

    const compiledPort = __BACKEND_PORT__ || 17870
    const candidatePorts = Array.from(new Set([compiledPort, 17870, 17871, 17872, 17873]))
    const candidates = candidatePorts.map(p => `http://127.0.0.1:${p}`)

    const maxWaitMs = 15000   // 最多等后端启动 15 秒
    const retryIntervalMs = 500
    const probeTimeout = 800
    const deadline = Date.now() + maxWaitMs

    while (Date.now() < deadline) {
      const results = await Promise.all(candidates.map(base => probe(base, probeTimeout).then(ok => ok ? base : null)))
      const found = results.find(r => r !== null)
      if (found) {
        apiBase.value = found
        return
      }
      // 后端还没就绪，等一会再试
      await new Promise(resolve => setTimeout(resolve, retryIntervalMs))
    }

    // 超时仍未发现：保持初始值，请求会失败并提示用户
    console.warn('[useApiBase] Backend not found after 15s, using default:', apiBase.value)
  }

  return { apiBase, buildApiUrl, getWsBase, discoverBackend }
}
