/**
 * MiniMonkey 插件系统核心实现
 * @description 提供完整的插件化架构，支持第三方插件开发和热插拔
 */

// ==================== 类型定义 ====================

/**
 * 插件能力枚举
 */
export enum PluginCapability {
  COMMAND = 'command',           // 注册命令
  TOOL = 'tool',                 // 注册工具
  SERVICE = 'service',           // 注册服务
  UI_COMPONENT = 'ui-component', // 注册 UI 组件
  THEME = 'theme',               // 注册主题
  KEYBINDING = 'keybinding'      // 注册快捷键
}

/**
 * 插件元信息
 */
export interface PluginManifest {
  id: string
  name: string
  version: string
  description: string
  author: string
  homepage?: string
  repository?: string
  license: string
  engines: {
    minimonkey: string
  }
  capabilities: PluginCapability[]
  dependencies?: Record<string, string>
  permissions?: string[]
  configSchema?: any
}

/**
 * 插件接口定义
 */
export interface IPlugin {
  readonly manifest: PluginManifest
  
  /**
   * 插件激活时调用
   */
  onActivate(ctx: PluginContext): Promise<void>
  
  /**
   * 插件停用时调用
   */
  onDeactivate(): Promise<void>
  
  /**
   * 获取插件配置默认值
   */
  getDefaultConfig?(): Record<string, any>
}

/**
 * 插件上下文（依赖注入容器）
 */
export class PluginContext {
  // === 系统服务 ===
  public readonly logger: ILogger
  public readonly config: IConfigService
  public readonly storage: IStorageService
  public readonly events: IEventBus
  
  // === AI 能力 ===
  public readonly llm: ILLMService
  public readonly planner: ITaskPlanner
  public readonly memory: IMemoryService
  
  // === 桌面控制 ===
  public readonly bridge: IBridgeService
  public readonly screen: IScreenService
  public readonly window: IWindowService
  
  // === 注册器 ===
  private commands: Map<string, ICommand> = new Map()
  private tools: Map<string, ITool> = new Map()
  private services: Map<string, IService> = new Map()
  
  constructor(injector: DependencyInjector) {
    this.logger = injector.get('logger')
    this.config = injector.get('config')
    this.storage = injector.get('storage')
    this.events = injector.get('events')
    this.llm = injector.get('llm')
    this.planner = injector.get('planner')
    this.memory = injector.get('memory')
    this.bridge = injector.get('bridge')
    this.screen = injector.get('screen')
    this.window = injector.get('window')
  }
  
  /**
   * 注册命令
   */
  registerCommand(command: ICommand): void {
    if (this.commands.has(command.name)) {
      throw new Error(`命令已存在：${command.name}`)
    }
    this.commands.set(command.name, command)
    this.logger.info(`[Plugin] 注册命令：${command.name}`)
  }
  
  /**
   * 注册工具
   */
  registerTool(tool: ITool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`工具已存在：${tool.name}`)
    }
    this.tools.set(tool.name, tool)
    this.logger.info(`[Plugin] 注册工具：${tool.name}`)
  }
  
  /**
   * 注册服务
   */
  registerService(service: IService): void {
    if (this.services.has(service.id)) {
      throw new Error(`服务已存在：${service.id}`)
    }
    this.services.set(service.id, service)
    this.logger.info(`[Plugin] 注册服务：${service.id}`)
  }
  
  /**
   * 获取已注册的命令
   */
  getCommand(name: string): ICommand | undefined {
    return this.commands.get(name)
  }
  
  /**
   * 获取已注册的工具
   */
  getTool(name: string): ITool | undefined {
    return this.tools.get(name)
  }
  
  /**
   * 获取已注册的服务
   */
  getService(id: string): IService | undefined {
    return this.services.get(id)
  }
}

// ==================== 插件管理器 ====================

/**
 * 插件加载器
 */
export class PluginLoader {
  /**
   * 从文件路径加载插件
   */
  async loadFromPath(pluginPath: string): Promise<IPlugin> {
    try {
      // 1. 读取 manifest.json
      const manifestPath = path.join(pluginPath, 'manifest.json')
      const manifestContent = await fs.readFile(manifestPath, 'utf-8')
      const manifest: PluginManifest = JSON.parse(manifestContent)
      
      // 2. 验证版本兼容性
      this.validateVersion(manifest.engines.minimonkey)
      
      // 3. 验证签名（生产环境）
      if (process.env.NODE_ENV === 'production') {
        await this.verifySignature(pluginPath, manifest)
      }
      
      // 4. 安装依赖
      if (manifest.dependencies) {
        await this.installDependencies(pluginPath, manifest.dependencies)
      }
      
      // 5. 加载插件主模块
      const mainModule = await import(path.join(pluginPath, manifest.main || 'index.js'))
      const plugin: IPlugin = new mainModule.DefaultPlugin()
      
      return plugin
    } catch (error) {
      throw new Error(`加载插件失败：${error.message}`)
    }
  }
  
  /**
   * 验证版本兼容性
   */
  private validateVersion(requiredVersion: string): void {
    const currentVersion = process.env.MINIMONKEY_VERSION || '1.0.0'
    
    if (!semver.satisfies(currentVersion, requiredVersion)) {
      throw new Error(
        `版本不兼容：需要 MiniMonkey ${requiredVersion}，当前版本 ${currentVersion}`
      )
    }
  }
  
  /**
   * 验证插件签名
   */
  private async verifySignature(pluginPath: string, manifest: PluginManifest): Promise<void> {
    const signaturePath = path.join(pluginPath, 'signature.json')
    
    if (!fs.existsSync(signaturePath)) {
      throw new Error('插件缺少签名文件')
    }
    
    const signature = JSON.parse(await fs.readFile(signaturePath, 'utf-8'))
    const isValid = await crypto.verifySignature(manifest, signature)
    
    if (!isValid) {
      throw new Error('插件签名验证失败')
    }
  }
  
  /**
   * 安装插件依赖
   */
  private async installDependencies(pluginPath: string, dependencies: Record<string, string>): Promise<void> {
    const packageJsonPath = path.join(pluginPath, 'package.json')
    let packageJson: any = {}
    
    if (fs.existsSync(packageJsonPath)) {
      packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'))
    }
    
    // 合并依赖
    packageJson.dependencies = {
      ...packageJson.dependencies,
      ...dependencies
    }
    
    // 安装（使用 bun install）
    await Bun.$`cd ${pluginPath} && bun install`
  }
}

/**
 * 插件管理器
 */
export class PluginManager {
  private plugins: Map<string, LoadedPlugin> = new Map()
  private contexts: Map<string, PluginContext> = new Map()
  private loader: PluginLoader = new PluginLoader()
  private eventBus: IEventBus
  
  constructor(eventBus: IEventBus) {
    this.eventBus = eventBus
  }
  
  /**
   * 加载并激活插件
   */
  async loadPlugin(pluginPath: string, context: PluginContext): Promise<void> {
    const pluginId = path.basename(pluginPath)
    
    try {
      // 1. 加载插件
      const plugin = await this.loader.loadFromPath(pluginPath)
      
      // 2. 检查是否已加载
      if (this.plugins.has(pluginId)) {
        throw new Error(`插件已加载：${pluginId}`)
      }
      
      // 3. 调用激活钩子
      await plugin.onActivate(context)
      
      // 4. 记录插件信息
      const loadedPlugin: LoadedPlugin = {
        id: pluginId,
        plugin,
        context,
        path: pluginPath,
        activatedAt: new Date(),
        status: 'active'
      }
      
      this.plugins.set(pluginId, loadedPlugin)
      this.contexts.set(pluginId, context)
      
      // 5. 发布事件
      this.eventBus.emit('plugin:loaded', { pluginId, plugin })
      
      context.logger.info(`[PluginManager] 插件加载成功：${pluginId}`)
    } catch (error) {
      context.logger.error(`[PluginManager] 插件加载失败：${pluginId}`, error)
      throw error
    }
  }
  
  /**
   * 卸载插件
   */
  async unloadPlugin(pluginId: string): Promise<void> {
    const loadedPlugin = this.plugins.get(pluginId)
    
    if (!loadedPlugin) {
      throw new Error(`插件未加载：${pluginId}`)
    }
    
    try {
      // 1. 调用停用钩子
      await loadedPlugin.plugin.onDeactivate()
      
      // 2. 清理资源
      loadedPlugin.status = 'inactive'
      
      // 3. 移除记录
      this.plugins.delete(pluginId)
      this.contexts.delete(pluginId)
      
      // 4. 发布事件
      this.eventBus.emit('plugin:unloaded', { pluginId })
      
      loadedPlugin.context.logger.info(`[PluginManager] 插件卸载成功：${pluginId}`)
    } catch (error) {
      loadedPlugin.context.logger.error(`[PluginManager] 插件卸载失败：${pluginId}`, error)
      throw error
    }
  }
  
  /**
   * 热重载插件
   */
  async reloadPlugin(pluginId: string): Promise<void> {
    const loadedPlugin = this.plugins.get(pluginId)
    
    if (!loadedPlugin) {
      throw new Error(`插件未加载：${pluginId}`)
    }
    
    // 1. 卸载
    await this.unloadPlugin(pluginId)
    
    // 2. 清除缓存
    delete require.cache[require.resolve(loadedPlugin.path)]
    
    // 3. 重新加载
    await this.loadPlugin(loadedPlugin.path, loadedPlugin.context)
  }
  
  /**
   * 获取所有已加载的插件
   */
  getLoadedPlugins(): LoadedPlugin[] {
    return Array.from(this.plugins.values())
  }
  
  /**
   * 获取插件统计信息
   */
  getStats(): PluginStats {
    const plugins = this.getLoadedPlugins()
    
    return {
      total: plugins.length,
      active: plugins.filter(p => p.status === 'active').length,
      inactive: plugins.filter(p => p.status === 'inactive').length
    }
  }
}

// ==================== 辅助函数 ====================

/**
 * 创建插件快捷方式
 */
export function createPlugin(manifest: Partial<PluginManifest>, impl: Partial<IPlugin>): IPlugin {
  return {
    manifest: {
      id: manifest.id!,
      name: manifest.name!,
      version: manifest.version || '1.0.0',
      description: manifest.description || '',
      author: manifest.author || '',
      license: manifest.license || 'MIT',
      engines: manifest.engines || { minimonkey: '^1.0.0' },
      capabilities: manifest.capabilities || [],
      ...manifest
    },
    
    async onActivate(ctx: PluginContext): Promise<void> {
      await impl.onActivate?.(ctx)
    },
    
    async onDeactivate(): Promise<void> {
      await impl.onDeactivate?.()
    },
    
    getDefaultConfig(): Record<string, any> {
      return impl.getDefaultConfig?.() || {}
    }
  }
}
