// 只在打包模式下通过 Neutralino 启动后端二进制
// 开发模式（npm run dev / neu run）后端已由 dev 脚本启动，本模块不执行任何操作

const HEALTH_CHECK_PORTS = [17870, 17871]

async function tryHealthCheck(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`)
    if (!res.ok) return false
    const data = await res.json()
    return data?.ok === true
  } catch {
    return false
  }
}

function getNeutralino(): any {
  return (window as any).Neutralino
}

function getNlOs(): string {
  return String((window as any).NL_OS || '').toLowerCase()
}

export async function ensureBackendRunning(): Promise<void> {
  // 1. 检查后端是否已经在运行（开发模式 / 用户手动启动）
  for (const port of HEALTH_CHECK_PORTS) {
    if (await tryHealthCheck(port)) {
      console.log(`[Backend] Already running on port ${port}`)
      return
    }
  }
  console.log('[Backend] No running backend found')

  // 2. 没有 Neutralino → 浏览器开发模式，后端由 dev 脚本启动
  const Neutralino = getNeutralino()
  if (!Neutralino?.os) {
    console.warn('[Backend] Neutralino not available — browser dev mode, skipping spawn')
    return
  }

  // 3. 打包模式：通过 Neutralino 启动二进制
  // NL_CWD 是 Neutralino 进程的工作目录，与 crabclaw-server 同级
  const nlCwd: string = (window as any).NL_CWD || ''
  const nlOs = getNlOs()
  const binaryName = nlOs === 'windows' ? 'crabclaw-server.exe' : 'crabclaw-server'
  const binaryPath = nlCwd ? `${nlCwd}/${binaryName}` : binaryName

  console.log('[Backend] Spawning binary:', binaryPath)

  try {
    await Neutralino.os.spawnProcess(binaryPath)
    console.log('[Backend] Process spawned')
  } catch (e: any) {
    console.error('[Backend] Failed to spawn:', e?.message || e)
    return
  }

  // 4. 等待后端就绪（最多 15 秒）
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 500))
    for (const port of HEALTH_CHECK_PORTS) {
      if (await tryHealthCheck(port)) {
        console.log(`[Backend] Ready on port ${port} after ${(i + 1) * 500}ms`)
        return
      }
    }
  }

  console.warn('[Backend] Timed out waiting for backend to become ready')
}
