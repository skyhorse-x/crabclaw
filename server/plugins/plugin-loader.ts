import { readdir, stat, mkdir } from 'node:fs/promises'
import path from 'node:path'
import type { CrabclawPlugin, PluginContext, PluginRouteHandler } from './plugin-types'

const pluginRouteHandlers: Map<string, PluginRouteHandler> = new Map()

export function getPluginRouteHandlers(): Map<string, PluginRouteHandler> {
  return pluginRouteHandlers
}

let dataDir = ''

export function setPluginDataDir(dir: string) {
  dataDir = dir
}

export function getPluginDataDir(): string {
  return dataDir
}

export async function loadPlugins(pluginsDir: string): Promise<CrabclawPlugin[]> {
  const plugins: CrabclawPlugin[] = []
  setPluginDataDir(path.join(pluginsDir, '..', 'data', 'plugins'))

  try {
    await mkdir(getPluginDataDir(), { recursive: true })
  } catch {}

  let entries: string[] = []
  try {
    entries = await readdir(pluginsDir)
  } catch {
    return plugins
  }

  for (const entry of entries) {
    const pluginPath = path.join(pluginsDir, entry)
    const stats = await stat(pluginPath)
    if (!stats.isDirectory()) continue
    if (entry.startsWith('.')) continue

    try {
      const manifest = await import(path.join(pluginPath, 'manifest.json'), { with: { type: 'json' } })
      const manifestData = manifest.default || manifest

      const mainModule = await import(path.join(pluginPath, manifestData.main || 'index.ts'))
      const PluginClass = mainModule.default
      if (!PluginClass) {
        continue
      }

      const plugin: CrabclawPlugin = new PluginClass()
      plugins.push(plugin)
    } catch (err: any) {
      console.error(`[PluginLoader] Failed to load plugin: ${entry}`, err?.message || err)
      continue
    }
  }

  return plugins
}

export async function initPlugins(pluginsDir: string, coreLogger: any): Promise<void> {
  const plugins = await loadPlugins(pluginsDir)

  if (plugins.length === 0) return

  for (const plugin of plugins) {
    const pluginDataDir = path.join(getPluginDataDir(), plugin.manifest.id)
    try {
      await mkdir(pluginDataDir, { recursive: true })
    } catch {}

    const ctx: PluginContext = {
      registerRoute(pathPrefix: string, handler: PluginRouteHandler) {
        pluginRouteHandlers.set(pathPrefix, handler)
      },
      logger: {
        info: (msg: string, data?: any) => coreLogger.info(`[Plugin:${plugin.manifest.id}] ${msg}`, data),
        warn: (msg: string, data?: any) => coreLogger.warn(`[Plugin:${plugin.manifest.id}] ${msg}`, data),
        error: (msg: string, data?: any) => coreLogger.error(`[Plugin:${plugin.manifest.id}] ${msg}`, data),
        debug: (msg: string, data?: any) => coreLogger.debug(`[Plugin:${plugin.manifest.id}] ${msg}`, data),
      },
      getPluginDataDir: () => pluginDataDir,
    }

    await plugin.onInit(ctx)
  }
}
