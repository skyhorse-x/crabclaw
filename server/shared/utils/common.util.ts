/**
 * 通用工具函数
 */

/**
 * 创建唯一 ID
 */
export function createId(prefix: string = ''): string {
  const uuid = crypto.randomUUID()
  return prefix ? `${prefix}-${uuid}` : uuid
}

/**
 * 格式化时间
 */
export function formatTime(date: Date = new Date()): string {
  return date.toISOString()
}

/**
 * 获取当前时间戳（毫秒）
 */
export function getNow(): number {
  return Date.now()
}

/**
 * 延迟执行
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 安全地解析 JSON
 */
export function safeJsonParse<T>(str: string, defaultValue: T): T {
  try {
    return JSON.parse(str) as T
  } catch {
    return defaultValue
  }
}

/**
 * 数组去重
 */
export function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr))
}

/**
 * 检查值是否为空
 */
export function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') return Object.keys(value).length === 0
  return false
}

/**
 * 从对象中选取指定字段
 */
export function pick<T extends Record<string, any>, K extends keyof T>(
  obj: T,
  keys: K[]
): Pick<T, K> {
  const result = {} as Pick<T, K>
  for (const key of keys) {
    if (key in obj) {
      result[key] = obj[key]
    }
  }
  return result
}

/**
 * 从对象中省略指定字段
 */
export function omit<T extends Record<string, any>, K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> {
  const result = { ...obj }
  for (const key of keys) {
    delete result[key]
  }
  return result as Omit<T, K>
}

/**
 * 对象深度合并
 */
export function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const result = { ...target } as T
  
  for (const key in source) {
    if (source.hasOwnProperty(key)) {
      const sourceVal = source[key]
      const targetVal = result[key]
      
      if (typeof sourceVal === 'object' && sourceVal !== null && !Array.isArray(sourceVal)) {
        (result as any)[key] = deepMerge(targetVal || {}, sourceVal as any)
      } else {
        (result as any)[key] = sourceVal
      }
    }
  }
  
  return result
}
