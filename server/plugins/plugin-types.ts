export interface PluginManifest {
  id: string
  name: string
  version: string
  description: string
  author?: string
  homepage?: string
}

export interface PluginRouteHandler {
  (pathname: string, request: Request): Promise<Response | null>
}

export interface PluginContext {
  registerRoute(pathPrefix: string, handler: PluginRouteHandler): void
  logger: {
    info(msg: string, data?: any): void
    warn(msg: string, data?: any): void
    error(msg: string, data?: any): void
    debug(msg: string, data?: any): void
  }
  getPluginDataDir(): string
}

export interface CrabclawPlugin {
  readonly manifest: PluginManifest
  onInit(ctx: PluginContext): Promise<void>
  onDestroy?(): Promise<void>
}
