declare module 'screenshot-desktop' {
  interface ScreenshotOptions {
    screen?: number | 'all' | 'main'
    format?: 'png' | 'jpg'
  }

  function screenshot(options?: ScreenshotOptions): Promise<Buffer>

  namespace screenshot {
    function listDisplays(): Promise<Array<{ id: number; name: string }>>
  }

  export = screenshot
}

declare module 'bun:sqlite' {
  class Database {
    constructor(path?: string | { open?: boolean; readwrite?: boolean; filename?: string }, options?: { open?: boolean; readwrite?: boolean })
    query<T = unknown>(sql: string): Query<T>
    exec(sql: string): void
    close(): void
    transaction<T>(fn: (...args: unknown[]) => T): (...args: unknown[]) => T
  }

  class Query<T> {
    all(...params: unknown[]): T[]
    get(...params: unknown[]): T | undefined
    run(...params: unknown[]): RunResult
  }

  interface RunResult {
    changes: number
    lastInsertRowid: number | bigint
  }

  export { Database, RunResult }
}
