/**
 * 函数工具
 */

/**
 * 防抖函数
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  
  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
    
    timeoutId = setTimeout(() => {
      fn(...args)
      timeoutId = null
    }, delay)
  }
}

/**
 * 限流函数
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args)
      inThrottle = true
      setTimeout(() => {
        inThrottle = false
      }, limit)
    }
  }
}

/**
 * 柯里化函数
 */
export function curry<T extends any[], R>(fn: (...args: T) => R): (...args: any[]) => any {
  return function curried(this: any, ...args: any[]): any {
    if (args.length >= fn.length) {
      return fn.apply(this, args as unknown as T)
    }
    
    return function (this: any, ...moreArgs: any[]) {
      return curried.apply(this, [...args, ...moreArgs] as any)
    }
  }
}

/**
 * 组合函数
 */
export function compose<R = any>(
  ...fns: Array<(arg: any) => any>
): (arg: any) => R {
  return function composed(arg: any): R {
    return fns.reduceRight((result, fn) => fn(result), arg)
  }
}

/**
 * 管道函数
 */
export function pipe<R = any>(
  ...fns: Array<(arg: any) => any>
): (arg: any) => R {
  return function piped(arg: any): R {
    return fns.reduce((result, fn) => fn(result), arg)
  }
}
