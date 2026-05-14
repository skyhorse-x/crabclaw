// 仅在打包后（非 dev 模式）通过 Neutralino.os.spawnProcess 启动后端二进制

async function getAppDirectory(): Promise<string> {
  const Neutralino = (window as any).Neutralino
  if (Neutralino?.filesystem) {
    try {
      const execPath = await Neutralino.filesystem.getCurrentDir()
      return execPath
    } catch {}
  }
  return ''
}

function getPlatformBinary(): string {
  const ua = navigator.userAgent.toLowerCase()
  const isWin = ua.includes('win')
  const isMac = ua.includes('mac')
  const arch = (navigator as any).userAgentData?.architecture || ''
  const isArm = arch === 'arm' || ua.includes('arm')

  if (isWin) return 'crabclaw-server.exe'
  if (isMac) return isArm ? 'crabclaw-server' : 'crabclaw-server'
  return 'crabclaw-server'
}

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

export async function startBackend(): Promise<string> {
  const Neutralino = (window as any).Neutralino
  console.log('[Backend] Neutralino available:', !!Neutralino)
  console.log('[Backend] Neutralino.os available:', !!Neutralino?.os)
  console.log('[Backend] Neutralino.filesystem available:', !!Neutralino?.filesystem)

  if (!Neutralino?.os || !Neutralino?.filesystem) {
    console.warn('[Backend] Neutralino APIs not available, using default port')
    return 'http://localhost:17870'
  }

  const appDir = await getAppDirectory()
  console.log('[Backend] App directory:', appDir)

  // 清理旧的 .port 文件
  try {
    await Neutralino.filesystem.removeFile(`${appDir}/server/.port`)
    console.log('[Backend] Removed old .port file')
  } catch (e) {
    console.log('[Backend] No old .port file to remove')
  }

  const binary = getPlatformBinary()
  const binaryPath = `${appDir}/${binary}`
  console.log('[Backend] Binary path:', binaryPath)

  try {
    console.log('[Backend] Spawning process...')
    await Neutralino.os.spawnProcess(binaryPath)
    console.log('[Backend] Process spawned successfully')
  } catch (e: any) {
    console.error('[Backend] Failed to spawn:', e?.message || e)
    return 'http://localhost:17870'
  }

  // 等待后端写入 .port 文件，最多 15 秒
  for (let i = 0; i < 50; i++) {
    await sleep(300)
    try {
      const content = await Neutralino.filesystem.readFile(`${appDir}/server/.port`)
      const port = content.trim()
      if (port && !isNaN(Number(port))) {
        console.log('[Backend] Started on port:', port)
        return `http://localhost:${port}`
      }
    } catch (e) {
      if (i % 10 === 0) console.log('[Backend] Waiting for .port file...', i)
    }
  }

  console.error('[Backend] Timed out waiting for .port file')
  return 'http://localhost:17870'
}
