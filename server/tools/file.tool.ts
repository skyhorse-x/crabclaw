/**
 * 文件操作工具
 * 提供文件读写、删除等操作
 */

import { readFile, writeFile, mkdir, unlink, stat, readdir } from 'node:fs/promises'
import path from 'node:path'
import type { ITool, ToolInputSchema, ToolResult } from './tool.types'
import { logger } from '../services/logger.service'

/**
 * 读取文件工具
 */
export class ReadFileTool implements ITool {
  readonly name = 'read_file'
  readonly description = '读取文件内容'
  
  readonly inputSchema: ToolInputSchema = {
    type: 'object',
    properties: {
      path: {
        name: 'path',
        type: 'string',
        description: '文件路径',
        required: true
      },
      encoding: {
        name: 'encoding',
        type: 'string',
        description: '文件编码',
        default: 'utf8'
      }
    },
    required: ['path']
  }

  async execute(input: Record<string, any>): Promise<ToolResult> {
    const { path: filePath, encoding = 'utf8' } = input

    try {
      logger.debug('[ReadFileTool] Reading file', { path: filePath })
      
      const content = await readFile(filePath, encoding)
      
      return {
        ok: true,
        data: { content, path: filePath, size: content.length }
      }
    } catch (error: any) {
      logger.error('[ReadFileTool] Read failed', error)
      
      return {
        ok: false,
        error: `读取文件失败：${error.message}`
      }
    }
  }
}

/**
 * 写入文件工具
 */
export class WriteFileTool implements ITool {
  readonly name = 'write_file'
  readonly description = '写入文件内容'
  
  readonly inputSchema: ToolInputSchema = {
    type: 'object',
    properties: {
      path: {
        name: 'path',
        type: 'string',
        description: '文件路径',
        required: true
      },
      content: {
        name: 'content',
        type: 'string',
        description: '文件内容',
        required: true
      },
      createDir: {
        name: 'createDir',
        type: 'boolean',
        description: '是否自动创建目录',
        default: true
      }
    },
    required: ['path', 'content']
  }

  async execute(input: Record<string, any>): Promise<ToolResult> {
    const { path: filePath, content, createDir = true } = input

    try {
      logger.debug('[WriteFileTool] Writing file', { path: filePath })
      
      if (createDir) {
        const dir = path.dirname(filePath)
        await mkdir(dir, { recursive: true })
      }

      await writeFile(filePath, content, 'utf8')
      
      return {
        ok: true,
        data: { written: true, path: filePath, size: content.length }
      }
    } catch (error: any) {
      logger.error('[WriteFileTool] Write failed', error)
      
      return {
        ok: false,
        error: `写入文件失败：${error.message}`
      }
    }
  }
}

/**
 * 删除文件工具
 */
export class DeleteFileTool implements ITool {
  readonly name = 'delete_file'
  readonly description = '删除文件'
  
  readonly inputSchema: ToolInputSchema = {
    type: 'object',
    properties: {
      path: {
        name: 'path',
        type: 'string',
        description: '文件路径',
        required: true
      }
    },
    required: ['path']
  }

  async execute(input: Record<string, any>): Promise<ToolResult> {
    const { path: filePath } = input

    try {
      logger.debug('[DeleteFileTool] Deleting file', { path: filePath })
      
      await unlink(filePath)
      
      return {
        ok: true,
        data: { deleted: true, path: filePath }
      }
    } catch (error: any) {
      logger.error('[DeleteFileTool] Delete failed', error)
      
      return {
        ok: false,
        error: `删除文件失败：${error.message}`
      }
    }
  }
}

/**
 * 列出目录工具
 */
export class ListDirectoryTool implements ITool {
  readonly name = 'list_directory'
  readonly description = '列出目录内容'
  
  readonly inputSchema: ToolInputSchema = {
    type: 'object',
    properties: {
      path: {
        name: 'path',
        type: 'string',
        description: '目录路径',
        required: true
      }
    },
    required: ['path']
  }

  async execute(input: Record<string, any>): Promise<ToolResult> {
    const { path: dirPath } = input

    try {
      logger.debug('[ListDirectoryTool] Listing directory', { path: dirPath })
      
      const entries = await readdir(dirPath, { withFileTypes: true })
      
      const files = entries
        .filter(entry => entry.isFile())
        .map(entry => entry.name)
      
      const directories = entries
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
      
      return {
        ok: true,
        data: {
          path: dirPath,
          files,
          directories,
          totalEntries: entries.length
        }
      }
    } catch (error: any) {
      logger.error('[ListDirectoryTool] List failed', error)
      
      return {
        ok: false,
        error: `列出目录失败：${error.message}`
      }
    }
  }
}

/**
 * 检查文件是否存在工具
 */
export class FileExistsTool implements ITool {
  readonly name = 'file_exists'
  readonly description = '检查文件是否存在'
  
  readonly inputSchema: ToolInputSchema = {
    type: 'object',
    properties: {
      path: {
        name: 'path',
        type: 'string',
        description: '文件路径',
        required: true
      }
    },
    required: ['path']
  }

  async execute(input: Record<string, any>): Promise<ToolResult> {
    const { path: filePath } = input

    try {
      await stat(filePath)
      
      return {
        ok: true,
        data: { exists: true, path: filePath }
      }
    } catch {
      return {
        ok: true,
        data: { exists: false, path: filePath }
      }
    }
  }
}

/**
 * 创建目录工具
 */
export class CreateDirectoryTool implements ITool {
  readonly name = 'create_directory'
  readonly description = '创建目录'
  
  readonly inputSchema: ToolInputSchema = {
    type: 'object',
    properties: {
      path: {
        name: 'path',
        type: 'string',
        description: '目录路径',
        required: true
      },
      recursive: {
        name: 'recursive',
        type: 'boolean',
        description: '是否递归创建',
        default: true
      }
    },
    required: ['path']
  }

  async execute(input: Record<string, any>): Promise<ToolResult> {
    const { path: dirPath, recursive = true } = input

    try {
      logger.debug('[CreateDirectoryTool] Creating directory', { path: dirPath })
      
      await mkdir(dirPath, { recursive })
      
      return {
        ok: true,
        data: { created: true, path: dirPath }
      }
    } catch (error: any) {
      logger.error('[CreateDirectoryTool] Create failed', error)
      
      return {
        ok: false,
        error: `创建目录失败：${error.message}`
      }
    }
  }
}
