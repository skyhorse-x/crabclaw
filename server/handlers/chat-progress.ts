/**
 * 构建工具执行进度提示信息（灵活可配置）
 */
export function buildToolProgressMessage(server: string, tool: string, input: Record<string, unknown>): string {
  const toolConfig: Record<string, { verb: string; field: string; suffix?: (v: string) => string }> = {
    'shell_execute': { verb: '执行命令', field: 'command', suffix: (v) => v.slice(0, 40) },
    'read_file': { verb: '读取文件', field: 'path', suffix: (v) => v.split('/').pop() || v },
    'write_file': { verb: '写入文件', field: 'path', suffix: (v) => v.split('/').pop() || v },
    'create_directory': { verb: '创建目录', field: 'path', suffix: (v) => v.split('/').pop() || v },
    'navigate_page': { verb: '访问网页', field: 'url', suffix: (v) => v.slice(0, 50) },
    'list_pages': { verb: '获取页面列表', field: '' },
    'take_snapshot': { verb: '截取页面快照', field: '' },
    'system_info': { verb: '获取系统信息', field: '' },
    'fetch_readable': { verb: '获取网络资源', field: 'url', suffix: (v) => v.slice(0, 40) },
    'search_nodes': { verb: '查询知识库', field: 'query', suffix: (v) => v.slice(0, 30) },
    'create_entities': { verb: '写入知识库', field: '' },
    'add_observations': { verb: '添加观察记录', field: '' },
    'http_request': { verb: '发送 HTTP 请求', field: 'url', suffix: (v) => v.slice(0, 40) },
  }

  const config = toolConfig[tool]
  if (!config) {
    return `调用 ${server}/${tool}...`
  }

  const target = config.field ? String(input[config.field] || '') : ''
  const displayTarget = target && config.suffix ? config.suffix(target) : target

  return displayTarget ? `正在${config.verb}：${displayTarget}...` : `正在${config.verb}...`
}
