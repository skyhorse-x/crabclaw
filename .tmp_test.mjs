const origExit = process.exit
process.exit = function (code) {
  console.error(`[TRACE] process.exit(${code}) called from:`, new Error().stack?.split('\n').slice(2).join('\n'))
  origExit(code)
}

const origStop = process.kill
process.kill = function (pid, signal) {
  console.error(`[TRACE] process.kill(${pid}, ${signal}) called from:`, new Error().stack?.split('\n').slice(2).join('\n'))
  return origStop(pid, signal)
}

import { startServer } from './server/core/server.ts'
await startServer()
console.log('Server started, process should stay alive')