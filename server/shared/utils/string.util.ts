/**
 * 字符串工具函数
 */

/**
 * 标准化文本输入
 */
export function normalizeText(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim()
  }
  if (value === null || value === undefined) {
    return ''
  }
  return String(value)
}

/**
 * 生成 slug 格式的技能 ID
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * 截断文本
 */
export function truncate(text: string, maxLength: number, suffix: string = '...'): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - suffix.length) + suffix
}

/**
 * 检查字符串是否以某前缀开头
 */
export function startsWith(str: string, prefix: string): boolean {
  return str.startsWith(prefix)
}

/**
 * 检查字符串是否以某后缀结尾
 */
export function endsWith(str: string, suffix: string): boolean {
  return str.endsWith(suffix)
}

/**
 * 驼峰命名转短横线命名
 */
export function camelToKebab(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
}

/**
 * 短横线命名转驼峰命名
 */
export function kebabToCamel(str: string): string {
  return str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
}
