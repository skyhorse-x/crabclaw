/**
 * MCP 路由
 * 处理 MCP 相关的 HTTP 路由
 */

import { getMcpTools, callMcpTool, disconnectAllMcp } from '../services/mcp.service'
import { readJsonBody } from '../shared/utils'
import type { McpServerMarketItem } from '../shared/types'
import { logger } from '../services/logger.service'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const MCP_CONFIG_PATH = path.join(process.cwd(), 'mcp-config.json')
const PACKAGE_JSON_PATH = path.join(process.cwd(), 'package.json')

const PACKAGE_ID_TO_CONFIG_KEY: Record<string, string> = {
  '@modelcontextprotocol/server-filesystem': 'filesystem',
  '@modelcontextprotocol/server-memory': 'memory',
  '@modelcontextprotocol/server-fetch': 'fetch',
  '@modelcontextprotocol/server-puppeteer': 'chrome-devtools',
  '@modelcontextprotocol/server-github': 'github',
  '@modelcontextprotocol/server-postgres': 'postgres',
  '@modelcontextprotocol/server-sqlite': 'sqlite',
  '@modelcontextprotocol/server-sequential-thinking': 'sequential-thinking',
  '@brave/brave-search-mcp-server': 'brave-search',
  '@f4ww4z/mcp-mysql-server': 'mysql',
  '@wong2/mcp-cli': 'cli',
  'chrome-devtools-mcp': 'chrome-devtools',
  'mcp-fetch-server': 'fetch'
}

async function loadPackageJson(): Promise<{ dependencies?: Record<string, string>, devDependencies?: Record<string, string> }> {
  try {
    const content = await readFile(PACKAGE_JSON_PATH, 'utf8')
    return JSON.parse(content)
  } catch {
    return {}
  }
}

async function loadMcpConfigFile(): Promise<{ mcpServers: Record<string, any> }> {
  try {
    const content = await readFile(MCP_CONFIG_PATH, 'utf8')
    return JSON.parse(content)
  } catch {
    return { mcpServers: {} }
  }
}

async function isPackageInstalled(packageId: string): Promise<boolean> {
  const pkg = await loadPackageJson()
  return !!(pkg.dependencies?.[packageId] || pkg.devDependencies?.[packageId])
}

async function saveMcpConfigFile(config: any): Promise<void> {
  try {
    await writeFile(MCP_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8')
  } catch (error) {
    logger.error('Failed to save MCP config file', error)
    throw error
  }
}

const MCP_MARKET_DATA: McpServerMarketItem[] = [
  {
    id: '@modelcontextprotocol/server-filesystem',
    name: 'Filesystem',
    description: '文件系统操作，支持读写文件、浏览目录',
    category: '文件系统',
    author: 'Anthropic',
    downloads: 50000,
    url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem'
  },
  {
    id: '@modelcontextprotocol/server-github',
    name: 'GitHub',
    description: 'GitHub API 集成，支持仓库、Issue、PR 操作',
    category: '开发工具',
    author: 'Anthropic',
    downloads: 40000,
    url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/github'
  },
  {
    id: '@modelcontextprotocol/server-postgres',
    name: 'PostgreSQL',
    description: 'PostgreSQL 数据库连接和查询',
    category: '数据库',
    author: 'Anthropic',
    downloads: 30000,
    url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/postgres'
  },
  {
    id: '@modelcontextprotocol/server-sqlite',
    name: 'SQLite',
    description: 'SQLite 数据库操作',
    category: '数据库',
    author: 'Anthropic',
    downloads: 25000,
    url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/sqlite'
  },
  {
    id: '@modelcontextprotocol/server-puppeteer',
    name: 'Puppeteer',
    description: '浏览器自动化，支持网页截图、爬虫',
    category: '浏览器',
    author: 'Anthropic',
    downloads: 35000,
    url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/puppeteer'
  },
  {
    id: '@modelcontextprotocol/server-fetch',
    name: 'Fetch',
    description: 'HTTP 请求工具，支持 GET/POST 等',
    category: '网络',
    author: 'Anthropic',
    downloads: 20000,
    url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/fetch'
  },
  {
    id: '@modelcontextprotocol/server-memory',
    name: 'Memory',
    description: '知识图谱内存存储',
    category: '存储',
    author: 'Anthropic',
    downloads: 15000,
    url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/memory'
  },
  {
    id: '@modelcontextprotocol/server-sequential-thinking',
    name: 'Sequential Thinking',
    description: '结构化思维和问题解决',
    category: '推理',
    author: 'Anthropic',
    downloads: 10000,
    url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking'
  }
]

/**
 * 处理 MCP 路由请求
 */
export async function handleMcpRoute(pathname: string, request: Request) {
  // GET /api/mcp
  if (pathname === '/api/mcp' && request.method === 'GET') {
    try {
      const mcpTools = await getMcpTools()
      const config = await loadMcpConfigFile()
      const configKeys = Object.keys(config.mcpServers)
      
      const servers = await Promise.all(MCP_MARKET_DATA.map(async item => {
        const configKey = PACKAGE_ID_TO_CONFIG_KEY[item.id]
        const isInConfig = configKey ? configKeys.includes(configKey) : false
        const isPackageInstalledNow = await isPackageInstalled(item.id)
        
        return {
          ...item,
          installed: isInConfig || isPackageInstalledNow
        }
      }))

      return new Response(JSON.stringify({
        ok: true,
        servers,
        tools: mcpTools
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    } catch (error) {
      logger.error('Get MCP servers failed', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      return new Response(JSON.stringify({
        ok: false,
        error: errorMessage,
        servers: []
      }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      })
    }
  }

  // POST /api/mcp/call
  if (pathname === '/api/mcp/call' && request.method === 'POST') {
    try {
      const body = await readJsonBody(request)
      const { server, tool, args } = body
      
      if (!server || !tool) {
        return new Response(JSON.stringify({
          ok: false,
          error: '缺少 server 或 tool 参数'
        }), {
          status: 400,
          headers: { 'content-type': 'application/json' }
        })
      }
      
      const result = await callMcpTool(server, tool, args || {})
      
      if (result.ok) {
        return new Response(JSON.stringify({
          ok: true,
          message: 'success',
          data: { result: result.result }
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      } else {
        return new Response(JSON.stringify({
          ok: false,
          error: result.error
        }), {
          status: 500,
          headers: { 'content-type': 'application/json' }
        })
      }
    } catch (error) {
      logger.error('MCP call failed', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      return new Response(JSON.stringify({
        ok: false,
        error: errorMessage
      }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      })
    }
  }

  // POST /api/mcp/install
  if (pathname === '/api/mcp/install' && request.method === 'POST') {
    try {
      const body = await readJsonBody(request)
      const config = body?.config

      if (!config || !config.mcpServers || typeof config.mcpServers !== 'object') {
        return new Response(JSON.stringify({
          ok: false,
          error: '缺少 mcpServers 配置'
        }), {
          status: 400,
          headers: { 'content-type': 'application/json' }
        })
      }

      const existing = await loadMcpConfigFile()
      const merged = {
        mcpServers: {
          ...existing.mcpServers,
          ...config.mcpServers
        }
      }

      await saveMcpConfigFile(merged)
      // 确保 MCP 连接会使用最新配置
      await disconnectAllMcp()
      await getMcpTools()

      return new Response(JSON.stringify({
        ok: true,
        message: 'MCP 服务器已安装（或已更新）'
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    } catch (error) {
      logger.error('MCP install failed', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      return new Response(JSON.stringify({
        ok: false,
        error: `安装失败：${errorMessage}`
      }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      })
    }
  }

  // POST /api/mcp/uninstall
  if (pathname === '/api/mcp/uninstall' && request.method === 'POST') {
    try {
      const body = await readJsonBody(request)
      const id = body?.id

      if (!id) {
        return new Response(JSON.stringify({
          ok: false,
          error: '缺少 server id'
        }), {
          status: 400,
          headers: { 'content-type': 'application/json' }
        })
      }

      const existing = await loadMcpConfigFile()
      if (!existing.mcpServers || !existing.mcpServers[id]) {
        return new Response(JSON.stringify({
          ok: true,
          message: 'MCP 服务器未安装'
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      }

      const updated = { ...existing, mcpServers: { ...existing.mcpServers } }
      delete updated.mcpServers[id]
      await saveMcpConfigFile(updated)
      await disconnectAllMcp()

      return new Response(JSON.stringify({
        ok: true,
        message: 'MCP 服务器已卸载'
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    } catch (error) {
      logger.error('MCP uninstall failed', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      return new Response(JSON.stringify({
        ok: false,
        error: `卸载失败：${errorMessage}`
      }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      })
    }
  }

  return null
}
