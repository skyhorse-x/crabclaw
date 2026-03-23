/**
 * 异步工具函数
 */

import { sleep } from './common.util'

/**
 * 重试函数
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number
    delayMs?: number
    backoff?: number
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    delayMs = 1000,
    backoff = 2
  } = options

  let lastError: Error
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error as Error
      
      if (attempt === maxRetries) {
        break
      }
      
      const waitTime = delayMs * Math.pow(backoff, attempt)
      await sleep(waitTime)
    }
  }
  
  throw lastError!
}

/**
 * 带超时的 Promise
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutError?: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => 
      setTimeout(() => reject(new Error(timeoutError || 'Promise timed out')), timeoutMs)
    )
  ])
}

/**
 * 批量执行（限制并发数）
 */
export async function runBatch<T>(
  tasks: Array<() => Promise<T>>,
  batchSize: number = 5
): Promise<T[]> {
  const results: T[] = []
  
  for (let i = 0; i < tasks.length; i += batchSize) {
    const batch = tasks.slice(i, i + batchSize)
    const batchResults = await Promise.all(batch.map(task => task()))
    results.push(...batchResults)
  }
  
  return results
}

/**
 * 顺序执行 Promise
 */
export async function runSequential<T>(
  tasks: Array<() => Promise<T>>
): Promise<T[]> {
  const results: T[] = []
  
  for (const task of tasks) {
    const result = await task()
    results.push(result)
  }
  
  return results
}
