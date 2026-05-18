import axios from "axios"
import { appendFileSync, existsSync, readFileSync } from "fs"
import * as fs from "fs/promises"
import * as os from "os"
import * as path from "path"
import { fileURLToPath } from 'node:url'
import open from "open"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import screenshot from "screenshot-desktop"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PROJECT_ROOT = path.resolve(__dirname, '..')

let robot: any = {
  getMousePos: () => ({ x: 0, y: 0 }),
  moveMouse: () => {},
  mouseClick: () => {},
  typeString: () => {},
  keyTap: () => {},
  scrollMouse: () => {},
}

interface McpServerConfig {
  command: string
  args: string[]
}

interface Action extends Record<string, unknown> {
  type: string
  x?: number
  y?: number
  text?: string
  app?: string
  url?: string
  query?: string
  mode?: string
  server?: string
  tool?: string
  arguments?: Record<string, unknown>
  key?: string
  keys?: string[]
  duration?: number
  direction?: string
  amount?: number
  target?: string
  confidence?: number
  risk?: string
}

interface Plan {
  observation: string
  reason: string
  done: boolean
  currentTask: string
  remainingTasks: string[]
  confidence: number
  risk: string
  actions: Action[]
  checklist?: ChecklistItem[]
  taskProgress?: TaskProgressItem[]
  summary?: string
}

interface ChecklistItem {
  item: string
  passed: boolean
  evidence?: string
}

interface TaskProgressItem {
  id: string
  label: string
  status: "pending" | "in_progress" | "done"
}

interface AgentState {
  phase: string
  observation: string
  lastObservation: string
  stagnantSteps: number
  planSignatures: string[]
  pendingChecklist: ChecklistItem[]
  taskProgress: TaskProgressItem[]
  currentTask: string
  remainingTasks: string[]
  memoryHints: MemoryHint[]
}

interface MemoryHint {
  key: string
  entity: string
  entityType: string
  observations: string[]
}

interface BrowserState {
  url?: string
}

function loadLocalEnvFile() {
  const envPath = path.resolve(PROJECT_ROOT, ".env")
  if (!existsSync(envPath)) return
  const content = readFileSync(envPath, "utf8")
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue
    const idx = line.indexOf("=")
    if (idx <= 0) continue
    const key = line.slice(0, idx).trim()
    const val = line.slice(idx + 1).trim()
    if (!process.env[key] && val) process.env[key] = val
  }
}

loadLocalEnvFile()

const ARK_API_KEY = process.env.ARK_API_KEY || ""
const ARK_API_URL = process.env.ARK_API_URL || "https://ark.cn-beijing.volces.com/api/v3/responses"
const ARK_MODEL = process.env.ARK_MODEL || "doubao-seed-2-0-lite-260215"
const PREOPEN_APP = process.env.PREOPEN_APP || ""
const DEFAULT_MAX_STEPS = Number(process.env.MAX_STEPS || 12)
const LOOP_DELAY_MS = Number(process.env.LOOP_DELAY_MS || 700)
const ACTION_DELAY_MS = Number(process.env.ACTION_DELAY_MS || 180)
const PREOPEN_WAIT_MS = Number(process.env.PREOPEN_WAIT_MS || 1500)
const MIN_CLICK_CONFIDENCE = Number(process.env.MIN_CLICK_CONFIDENCE || 0.78)
const MAX_AI_RETRIES = Number(process.env.MAX_AI_RETRIES || 2)
const CLICK_STABLE_DELTA = Number(process.env.CLICK_STABLE_DELTA || 20)
const STRICT_CLICK_CONFIRM = process.env.STRICT_CLICK_CONFIRM === "true"
const CAPTURE_APP_ONLY = process.env.CAPTURE_APP_ONLY !== "false"
const ENABLE_IMAGE_INPUT = process.env.ARK_ENABLE_IMAGE !== "false"
const MAX_STAGNANT_STEPS = Number(process.env.MAX_STAGNANT_STEPS || 3)
const MAX_REPEAT_ACTION_SIGNATURES = Number(process.env.MAX_REPEAT_ACTION_SIGNATURES || 3)
const LOG_FILE = process.env.AGENT_LOG_FILE || path.resolve(PROJECT_ROOT, "agent-debug.log")

const SUPPORTED_ACTIONS = new Set([
  "openApp",
  "openBrowser",
  "searchWeb",
  "mcp",
  "move",
  "click",
  "doubleClick",
  "rightClick",
  "type",
  "paste",
  "key",
  "hotkey",
  "wait",
  "scroll",
  "noop"
])

const NORMALIZED_ARK_API_KEY = String(ARK_API_KEY || "").replace(/^Bearer\s+/i, "").trim()

const MCP_SERVER_CONFIG: Record<string, McpServerConfig> = {
  filesystem: {
    command: process.execPath,
    args: [path.resolve(PROJECT_ROOT, "node_modules/@modelcontextprotocol/server-filesystem/dist/index.js"), PROJECT_ROOT]
  },
  memory: {
    command: process.execPath,
    args: [path.resolve(PROJECT_ROOT, "node_modules/@modelcontextprotocol/server-memory/dist/index.js")]
  },
  puppeteer: {
    command: process.execPath,
    args: [path.resolve(PROJECT_ROOT, "node_modules/@modelcontextprotocol/server-puppeteer/dist/index.js")]
  },
  fetch: {
    command: process.execPath,
    args: [path.resolve(PROJECT_ROOT, "node_modules/mcp-fetch-server/dist/index.js")]
  },
  shell: {
    command: process.execPath,
    args: [path.resolve(PROJECT_ROOT, "node_modules/@mako10k/mcp-shell-server/dist/index.js")]
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function logProgress(stage: string, message: string): void {
  const ts = new Date().toISOString()
  console.log(`[${ts}] [${stage}] ${message}`)
  try {
    appendFileSync(LOG_FILE, `${JSON.stringify({ ts, stage, message })}\n`, "utf8")
  } catch (_error) {
    // Ignore log file write errors to avoid blocking runtime.
  }
}


function maskApiKey(key: string): string {
  const k = String(key || "").trim()
  if (!k) return ""
  if (k.length <= 10) return "***"
  return `${k.slice(0, 6)}...${k.slice(-4)}`
}

function compactForLog(value: unknown, depth = 0, visited = new WeakSet<object>()): unknown {
  if (depth > 6) return "[DepthLimit]"
  if (value && typeof value === "object") {
    if (visited.has(value as object)) return "[Circular]"
    visited.add(value as object)
  }
  if (typeof value === "string") {
    if (value.startsWith("data:image/") && value.includes("base64,")) {
      const idx = value.indexOf("base64,")
      const b64 = idx >= 0 ? value.slice(idx + 7) : ""
      return `[image_base64 length=${b64.length}]`
    }
    return value.length > 2000 ? `${value.slice(0, 2000)}...[truncated ${value.length - 2000}]` : value
  }
  if (Array.isArray(value)) {
    return value.map((v) => compactForLog(v, depth + 1, visited))
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      out[k] = compactForLog(v, depth + 1, visited)
    }
    return out
  }
  return value
}

function parseArgs() {
  const args = process.argv.slice(2)
  const flags = new Map<string, string>()
  const chunks: string[] = []

  for (const arg of args) {
    if (arg.startsWith("--")) {
      const [k, v] = arg.slice(2).split("=")
      flags.set(k, v ?? "true")
    } else {
      chunks.push(arg)
    }
  }

  return {
    goal: chunks.join(" ").trim(),
    dryRun: flags.get("dry-run") === "true",
    maxSteps: Number(flags.get("max-steps") || DEFAULT_MAX_STEPS),
    captureAppOnly: flags.get("capture-app-only") ? flags.get("capture-app-only") !== "false" : CAPTURE_APP_ONLY,
    intervalMinutes: Number(flags.get("interval-minutes") || 0),
    maxRuns: Number(flags.get("max-runs") || 0)
  }
}

function sanitizeJson(raw: string): string {
  if (typeof raw !== "string") return ""
  const start = raw.indexOf("{")
  const end = raw.lastIndexOf("}")
  if (start < 0 || end < 0 || end <= start) return ""
  return raw.slice(start, end + 1)
}

function normalizeModelContent(content: unknown): string {
  if (typeof content === "string") return content
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") return item
        if (item && typeof item.text === "string") return item.text
        return ""
      })
      .join("\n")
      .trim()
  }
  return String(content || "")
}

function extractJsonCodeBlock(text: string): string {
  if (typeof text !== "string") return ""
  const m = text.match(/```json\s*([\s\S]*?)\s*```/i) || text.match(/```\s*([\s\S]*?)\s*```/i)
  return m?.[1]?.trim() || ""
}

function extractFirstBalancedJson(text: string): string {
  if (typeof text !== "string") return ""
  let start = -1
  let depth = 0
  let inString = false
  let escaped = false

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]

    if (escaped) {
      escaped = false
      continue
    }
    if (ch === "\\") {
      escaped = true
      continue
    }
    if (ch === "\"") {
      inString = !inString
      continue
    }
    if (inString) continue

    if (ch === "{") {
      if (start === -1) start = i
      depth += 1
    } else if (ch === "}") {
      if (start !== -1) depth -= 1
      if (start !== -1 && depth === 0) {
        return text.slice(start, i + 1)
      }
    }
  }

  return ""
}

function tryRepairJsonText(text: string): string {
  if (typeof text !== "string" || !text.trim()) return ""
  let fixed = text
    .replace(/[\u201c\u201d]/g, "\"")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/,\s*([}\]])/g, "$1")

  fixed = fixed.replace(/:\s*([^"{\[\]\d\-][^,}\n]*?)"\s*([,}])/g, (_m, val, tail) => {
    const v = String(val || "").trim().replace(/^"+|"+$/g, "")
    return `: "${v}"${tail}`
  })

  fixed = fixed.replace(/:\s*([^"{\[\]\d\-][^,}\n]*?)\s*([,}])/g, (_m, val, tail) => {
    const raw = String(val || "").trim()
    if (!raw) return _m
    const lower = raw.toLowerCase()
    if (lower === "true" || lower === "false" || lower === "null") return `: ${lower}${tail}`
    return `: "${raw.replace(/^"+|"+$/g, "")}"${tail}`
  })

  return fixed
}

function parsePlanFromModelContent(rawContent: unknown): Plan | null {
  const text = normalizeModelContent(rawContent).trim()
  const repaired = tryRepairJsonText(text)
  const repairedCodeBlock = tryRepairJsonText(extractJsonCodeBlock(text))
  const repairedBalanced = tryRepairJsonText(extractFirstBalancedJson(text))
  const candidates = [
    text,
    extractJsonCodeBlock(text),
    sanitizeJson(text),
    extractFirstBalancedJson(text),
    repaired,
    repairedCodeBlock,
    repairedBalanced
  ].filter(Boolean)

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      if (Array.isArray(parsed)) {
        return {
          observation: "",
          reason: "model returned actions array",
          done: false,
          currentTask: "",
          remainingTasks: [],
          confidence: 0,
          risk: "unknown",
          actions: parsed
        }
      }
      if (parsed && typeof parsed === "object") {
        return parsed as Plan
      }
    } catch (_error) {
      // Try next candidate.
    }
  }

  return null
}

function validateAction(action: unknown): boolean {
  if (!action || typeof action !== "object") return false
  const act = action as Record<string, unknown>
  if (!SUPPORTED_ACTIONS.has(String(act.type))) return false

  if (isClickLikeAction(act) || act.type === "move") {
    if (!hasXY(act)) return false
  }
  if (act.type === "paste" || act.type === "type") {
    if (typeof act.text !== "string" || !act.text.trim()) return false
  }
  if (act.type === "openApp") {
    if (typeof act.app !== "string" || !act.app.trim()) return false
  }
  if (act.type === "openBrowser") {
    const hasUrl = typeof act.url === "string" && act.url.trim()
    const hasQuery = typeof act.query === "string" && act.query.trim()
    if (!hasUrl && !hasQuery) return false
    if (act.mode != null && !["system", "automation"].includes(String(act.mode))) return false
  }
  if (act.type === "searchWeb") {
    if (typeof act.query !== "string" || !act.query.trim()) return false
  }
  if (act.type === "mcp") {
    if (typeof act.server !== "string" || !act.server.trim()) return false
    if (typeof act.tool !== "string" || !act.tool.trim()) return false
    if (act.arguments != null && typeof act.arguments !== "object") return false
  }
  return true
}

function normalizeKey(key: string): string {
  const raw = String(key || "").toLowerCase().trim()
  const alias: Record<string, string> = {
    return: "enter",
    enter: "enter",
    esc: "escape",
    cmd: "command",
    command: "command",
    ctrl: "control",
    control: "control",
    option: "alt",
    win: "command",
    del: "delete",
    backspace: "backspace",
    spacebar: "space",
    pgup: "pageup",
    pgdn: "pagedown"
  }
  return alias[raw] || raw
}

function hasXY(action: Record<string, unknown>): boolean {
  return Number.isFinite(action?.x) && Number.isFinite(action?.y)
}

function extractAppNameFromGoal(goal: string): string {
  const text = String(goal || "")
  const patterns = [
    /(?:打开 | 启动 | 运行)\s*([A-Za-z0-9_\-\u4e00-\u9fa5]+)/,
    /(?:open|launch|run)\s+([A-Za-z0-9_.\-]+)/i
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]) return match[1]
  }
  return ""
}

function isClickLikeAction(action: Record<string, unknown>): boolean {
  return ["click", "doubleClick", "rightClick"].includes(String(action?.type))
}

function parseConfidence(action: Record<string, unknown>): number {
  const v = Number(action?.confidence)
  if (!Number.isFinite(v)) return 1
  return v
}

function checklistAllPassed(checklist: unknown): boolean {
  if (!Array.isArray(checklist) || checklist.length === 0) return false
  return checklist.every((item) => item && (item as Record<string, unknown>).passed === true)
}

function normalizeChecklist(checklist: unknown): ChecklistItem[] {
  if (!Array.isArray(checklist)) return []
  return checklist
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const it = item as Record<string, unknown>
      return {
        item: String(it.item || "").trim(),
        passed: it.passed === true,
        evidence: String(it.evidence || "").trim()
      }
    })
    .filter((item) => item.item)
}



function normalizeTaskProgress(taskProgress: unknown, fallbackChecklist: ChecklistItem[] = []): TaskProgressItem[] {
  if (Array.isArray(taskProgress) && taskProgress.length > 0) {
    return taskProgress
      .filter((item) => item && typeof item === "object")
      .map((item, index) => {
        const it = item as Record<string, unknown>
        return {
          id: trimText(String(it.id || `task_${index + 1}`), 80),
          label: trimText(String(it.label || it.item || ""), 160),
          status: ["pending", "in_progress", "done"].includes(String(it.status)) ? it.status as "pending" | "in_progress" | "done" : "pending"
        }
      })
      .filter((item) => item.label)
      .slice(0, 12)
  }
  const checklist = normalizeChecklist(fallbackChecklist)
  return checklist.map((item, index) => ({
    id: `check_${index + 1}`,
    label: item.item,
    status: item.passed ? "done" : index === 0 ? "in_progress" : "pending"
  }))
}

function trimText(text: string, max = 240): string {
  const value = String(text || "").replace(/\s+/g, " ").trim()
  if (value.length <= max) return value
  return `${value.slice(0, max)}...`
}

function classifyGoal(goal: string): string[] {
  const text = String(goal || "").toLowerCase()
  const tags: string[] = []
  if (/(浏览器 | 网页 | 网站|url|http|https|chrome|safari|edge)/.test(text)) tags.push("browser")
  if (/(文件 | 目录 | 文件夹 | 保存 | 导出 | 下载 | 上传|read|write|file|folder)/.test(text)) tags.push("filesystem")
  if (/(终端 | 命令|shell|bash|zsh|node|python|npm|pnpm|curl|git)/.test(text)) tags.push("shell")
  if (/(接口|api|请求|fetch|post|get|webhook)/.test(text)) tags.push("http")
  if (/(桌面 | 窗口 | 应用 | 按钮 | 点击 | 输入 | 滚动 | 弹窗)/.test(text)) tags.push("desktop")
  return tags.length > 0 ? tags : ["desktop"]
}

function extractHostname(value: string): string {
  const raw = String(value || "").trim()
  if (!raw) return ""
  try {
    const normalized = /^(https?:)?\/\//i.test(raw) ? raw : `https://${raw}`
    return new URL(normalized).hostname || ""
  } catch (_error) {
    return ""
  }
}

function buildMemoryKeys(goal: string, browserState: BrowserState): string[] {
  const keys = new Set<string>()
  const hostname = extractHostname(browserState?.url || "")
  const app = extractAppNameFromGoal(goal)
  if (hostname) keys.add(hostname)
  if (app) keys.add(app)
  for (const tag of classifyGoal(goal)) keys.add(`goal:${tag}`)
  return Array.from(keys).filter(Boolean)
}

function parseMemoryGraph(result: unknown): { entities: unknown[]; relations: unknown[] } {
  if (result && typeof result === "object" && (result as Record<string, unknown>).structuredContent && typeof (result as Record<string, unknown>).structuredContent === "object") {
    return (result as Record<string, unknown>).structuredContent as { entities: unknown[]; relations: unknown[] }
  }
  const text = normalizeMcpToolText(result)
  if (!text) return { entities: [], relations: [] }
  try {
    return JSON.parse(text)
  } catch (_error) {
    return { entities: [], relations: [] }
  }
}

function summarizeMemoryHints(graph: { entities?: unknown[] }, key: string): MemoryHint[] {
  const entities = Array.isArray(graph?.entities) ? graph.entities : []
  const hints: MemoryHint[] = []
  for (const entity of entities.slice(0, 4)) {
    const ent = entity as Record<string, unknown>
    const observations = Array.isArray(ent?.observations) ? ent.observations.slice(0, 4).map((item) => trimText(String(item || ""), 180)) : []
    if (observations.length === 0) continue
    hints.push({
      key,
      entity: trimText(String(ent?.name || ""), 120),
      entityType: trimText(String(ent?.entityType || ""), 80),
      observations
    })
  }
  return hints
}

async function retrieveMemoryHints(goal: string, browserState: BrowserState, mcpManager: McpManager | null): Promise<MemoryHint[]> {
  if (!mcpManager) return []
  const keys = buildMemoryKeys(goal, browserState).slice(0, 4)
  if (keys.length === 0) return []
  const allHints: MemoryHint[] = []
  for (const key of keys) {
    try {
      const result = await mcpManager.callTool("memory", "search_nodes", { query: key })
      const graph = parseMemoryGraph(result)
      allHints.push(...summarizeMemoryHints(graph, key))
    } catch (error) {
      logProgress("MEMORY", `读取记忆失败 key=${key} error=${String(error instanceof Error ? error.message : error)}`)
    }
  }
  return allHints.slice(0, 8)
}

async function ensureMemoryEntity(entityName: string, entityType: string, mcpManager: McpManager | null): Promise<void> {
  if (!mcpManager || !entityName) return
  try {
    await mcpManager.callTool("memory", "create_entities", {
      entities: [
        {
          name: entityName,
          entityType,
          observations: []
        }
      ]
    })
  } catch (_error) {
    // create_entities 对已存在实体会忽略，这里保持静默
  }
}

async function storeMemoryObservation({ goal, browserState, status, summary, actionResults = [], mcpManager }: { goal: string; browserState: BrowserState; status: string; summary: string; actionResults: unknown[]; mcpManager: McpManager | null }): Promise<void> {
  if (!mcpManager) return
  const hostname = extractHostname(browserState?.url || "")
  const appName = extractAppNameFromGoal(goal)
  const entityName = trimText(hostname || appName || `goal:${classifyGoal(goal)[0] || "general"}`, 120)
  const entityType = hostname ? "site" : appName ? "application" : "goal-context"
  const actionSummary = Array.isArray(actionResults)
    ? actionResults
        .filter((item) => item && typeof item === "object")
        .slice(-3)
        .map((item) => {
          const it = item as Record<string, unknown>
          return `${String(it.actionType || "")}:${it.success ? "ok" : "fail"}:${trimText(String(it.target || ""), 40)}`
        })
        .join(" | ")
    : ""
  const observation = trimText(
    `${status === "success" ? "success_path" : "failure_pattern"} | goal=${goal} | url=${browserState?.url || ""} | summary=${summary || ""} | actions=${actionSummary}`,
    500
  )
  try {
    await ensureMemoryEntity(entityName, entityType, mcpManager)
    await mcpManager.callTool("memory", "add_observations", {
      observations: [
        {
          entityName,
          contents: [observation]
        }
      ]
    })
    logProgress("MEMORY", `已写入记忆 entity=${entityName} status=${status}`)
  } catch (error) {
    logProgress("MEMORY", `写入记忆失败 entity=${entityName} error=${String(error instanceof Error ? error.message : error)}`)
  }
}

function summarizeAction(action: Record<string, unknown>): string {
  if (!action || typeof action !== "object") return "unknown"
  if (isClickLikeAction(action) || action.type === "move") {
    return `${action.type}:${String(action.target || "target")}@${Math.round(Number(action.x || 0))},${Math.round(Number(action.y || 0))}`
  }
  if (action.type === "openApp") return `openApp:${String(action.app || "")}`
  if (action.type === "openBrowser") return `openBrowser:${String(action.mode || "system")}:${String(action.url || action.query || "")}`
  if (action.type === "searchWeb") return `searchWeb:${String(action.query || "")}`
  if (action.type === "mcp") return `mcp:${String(action.server || "")}.${String(action.tool || "")}`
  if (action.type === "type" || action.type === "paste") return `${action.type}:${trimText(String(action.text || ""), 40)}`
  if (action.type === "key") return `key:${String(action.key || "")}`
  if (action.type === "hotkey") return `hotkey:${Array.isArray(action.keys) ? action.keys.join("+") : ""}`
  return String(action.type || "")
}

function summarizeActions(actions: unknown[], max = 4): string[] {
  return (Array.isArray(actions) ? actions : []).slice(0, max).map((action) => summarizeAction(action as Record<string, unknown>))
}

function countTrailingRepeats(items: string[]): number {
  if (!Array.isArray(items) || items.length === 0) return 0
  const last = items[items.length - 1]
  let count = 0
  for (let i = items.length - 1; i >= 0; i -= 1) {
    if (items[i] !== last) break
    count += 1
  }
  return count
}

function deriveAgentPhase({ verification, pendingChecklist, onlyWaiting, stagnantSteps, repeatedActionCount, planSignatures }: { verification: Partial<Plan>; pendingChecklist: ChecklistItem[]; onlyWaiting: boolean; stagnantSteps: number; repeatedActionCount: number; planSignatures: string[] }): string {
  if (verification?.done) return "DONE"
  if (pendingChecklist.length > 0 && onlyWaiting) return "VERIFYING"
  if (stagnantSteps >= MAX_STAGNANT_STEPS || repeatedActionCount >= MAX_REPEAT_ACTION_SIGNATURES) return "RECOVERY"
  if (pendingChecklist.length > 0) return "INTERACTING"
  if (planSignatures.some((item) => /^openApp:/.test(item) || /^openBrowser:/.test(item))) return "NAVIGATING"
  if (planSignatures.some((item) => /^mcp:/.test(item))) return "INTERACTING"
  if (planSignatures.length > 0) return "INTERACTING"
  return "OBSERVING"
}

function updateAgentState(agentState: AgentState, plan: Plan | null, verification: Partial<Plan>, stepMeta: { memoryHints?: MemoryHint[] } = {}): AgentState {
  const planObservation = trimText(plan?.observation || "")
  const verificationSummary = trimText(verification?.summary || "")
  const observation = verificationSummary || planObservation
  const sameObservation = observation && observation === agentState.lastObservation
  const stagnantSteps = sameObservation ? agentState.stagnantSteps + 1 : 0
  const planSignatures = summarizeActions(plan?.actions || [])
  const repeatedActionCount = countTrailingRepeats(agentState.planSignatures)
  const pendingChecklist = normalizeChecklist(verification?.checklist || []).filter((item) => !item.passed)
  const onlyWaiting = pendingChecklist.length > 0 && planSignatures.length === 0
  const phase = deriveAgentPhase({
    verification,
    pendingChecklist,
    onlyWaiting,
    stagnantSteps,
    repeatedActionCount,
    planSignatures
  })
  const taskProgress = normalizeTaskProgress(verification?.taskProgress, pendingChecklist)
  const currentTask = taskProgress.find((item) => item.status === "in_progress")?.label || ""
  const remainingTasks = taskProgress.filter((item) => item.status === "pending").map((item) => item.label)
  const memoryHints = Array.isArray(stepMeta.memoryHints) ? stepMeta.memoryHints : []

  return {
    ...agentState,
    phase,
    observation,
    lastObservation: observation,
    stagnantSteps,
    planSignatures: [...agentState.planSignatures, ...planSignatures].slice(-MAX_REPEAT_ACTION_SIGNATURES),
    pendingChecklist,
    taskProgress,
    currentTask,
    remainingTasks,
    memoryHints
  }
}

function normalizeMcpToolText(result: unknown): string {
  if (!result) return ""
  if (typeof result === "string") return result
  const res = result as Record<string, unknown>
  if (res.content && typeof res.content === "string") return res.content
  if (res.text && typeof res.text === "string") return res.text
  if (res.toolResult && typeof res.toolResult === "string") return res.toolResult
  if (res.toolResult && typeof res.toolResult === "object") {
    const toolResult = res.toolResult as Record<string, unknown>
    if (toolResult.content && typeof toolResult.content === "string") return toolResult.content
  }
  return ""
}

class McpManager {
  private clients: Map<string, Client>

  constructor() {
    this.clients = new Map()
  }

  async connect(serverName: string, config: McpServerConfig): Promise<void> {
    if (this.clients.has(serverName)) return
    try {
      const transport = new StdioClientTransport({
        command: config.command,
        args: config.args
      })
      const client = new Client({
        name: `agent-${serverName}`,
        version: "1.0.0"
      })
      await client.connect(transport)

      // 防止子进程退出后写入 stdin 产生 EPIPE 未处理错误
      const childProcess = (transport as any)._process
      if (childProcess) {
        const onStdinError = (err: any) => {
          if (err?.code === 'EPIPE') return
        }
        childProcess.stdin?.on('error', onStdinError)
        childProcess.on('exit', () => {
          childProcess.stdin?.removeListener('error', onStdinError)
          this.clients.delete(serverName)
        })
      }

      this.clients.set(serverName, client)
      logProgress("MCP", `已连接服务器：${serverName}`)
    } catch (error) {
      logProgress("MCP", `连接服务器失败：${serverName} error=${String(error instanceof Error ? error.message : error)}`)
      throw error
    }
  }

  async callTool(serverName: string, toolName: string, args: Record<string, unknown> = {}): Promise<unknown> {
    const client = this.clients.get(serverName)
    if (!client) throw new Error(`MCP 服务器未连接：${serverName}`)
    try {
      const result = await client.callTool({
        name: toolName,
        arguments: args
      })
      return result
    } catch (error) {
      logProgress("MCP", `调用工具失败：${serverName}.${toolName} error=${String(error instanceof Error ? error.message : error)}`)
      throw error
    }
  }

  async disconnectAll(): Promise<void> {
    for (const [serverName, client] of this.clients) {
      try {
        await client.close()
        logProgress("MCP", `已断开服务器：${serverName}`)
      } catch (error) {
        logProgress("MCP", `断开服务器失败：${serverName} error=${String(error instanceof Error ? error.message : error)}`)
      }
    }
    this.clients.clear()
  }
}

class ArkApiClient {
  private baseURL: string
  private apiKey: string

  constructor() {
    this.baseURL = ARK_API_URL
    this.apiKey = NORMALIZED_ARK_API_KEY
  }

  async callModel(messages: Array<{ role: string; content: unknown }>, options: { maxTokens?: number; temperature?: number; topP?: number; systemPrompt?: string } = {}): Promise<unknown> {
    if (!this.apiKey) {
      throw new Error("ARK_API_KEY 未配置")
    }

    const payload = {
      model: ARK_MODEL,
      messages: messages.map((msg) => ({
        role: msg.role,
        content: msg.content
      })),
      max_tokens: options.maxTokens || 4096,
      temperature: options.temperature || 0.1,
      top_p: options.topP || 0.9,
      stream: false
    }

    if (options.systemPrompt) {
      payload.messages.unshift({
        role: "system",
        content: options.systemPrompt
      })
    }

    try {
      const response = await axios.post(this.baseURL, payload, {
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        timeout: 60000
      })

      return response.data
    } catch (error) {
      logProgress("ARK_API", `API 调用失败：${String(error instanceof Error ? error.message : error)}`)
      throw error
    }
  }
}

async function captureScreen(): Promise<string | null> {
  try {
    const imageBuffer = await screenshot()
    return `data:image/png;base64,${imageBuffer.toString("base64")}`
  } catch (error) {
    logProgress("CAPTURE", `屏幕截图失败：${String(error instanceof Error ? error.message : error)}`)
    return null
  }
}

async function getMousePosition(): Promise<{ x: number; y: number }> {
  try {
    const pos = robot.getMousePos()
    return { x: pos.x, y: pos.y }
  } catch (error) {
    logProgress("MOUSE", `获取鼠标位置失败：${String(error instanceof Error ? error.message : error)}`)
    return { x: 0, y: 0 }
  }
}

async function executeAction(action: Action, mcpManager: McpManager): Promise<unknown> {
  if (!validateAction(action)) {
    throw new Error(`无效的动作：${JSON.stringify(action)}`)
  }

  const confidence = parseConfidence(action as Record<string, unknown>)
  if (confidence < MIN_CLICK_CONFIDENCE && isClickLikeAction(action as Record<string, unknown>)) {
    throw new Error(`点击置信度过低：${confidence} < ${MIN_CLICK_CONFIDENCE}`)
  }

  logProgress("ACTION", `执行动作：${summarizeAction(action as Record<string, unknown>)} confidence=${confidence}`)

  switch (action.type) {
    case "openApp":
      return await openApp(action.app!)
    case "openBrowser":
      return await openBrowser(action)
    case "searchWeb":
      return await searchWeb(action.query!)
    case "mcp":
      return await mcpManager.callTool(action.server!, action.tool!, action.arguments || {})
    case "move":
      return await moveMouse(action.x!, action.y!)
    case "click":
      return await clickMouse(action.x!, action.y!, "left")
    case "doubleClick":
      return await doubleClickMouse(action.x!, action.y!)
    case "rightClick":
      return await clickMouse(action.x!, action.y!, "right")
    case "type":
      return await typeText(action.text!)
    case "paste":
      return await pasteText(action.text!)
    case "key":
      return await pressKey(action.key!)
    case "hotkey":
      return await pressHotkey(action.keys!)
    case "wait":
      return await sleep(action.duration || 1000)
    case "scroll":
      return await scrollMouse(action.direction, action.amount)
    case "noop":
      return { success: true, message: "无操作" }
    default:
      throw new Error(`未知的动作类型：${action.type}`)
  }
}

async function findAppPath(appName: string): Promise<string | null> {
  const searchDirs = ["/Applications", path.join(os.homedir(), "/Applications"), "/System/Applications"]
  for (const dir of searchDirs) {
    try {
      const files = await fs.readdir(dir)
      const match = files.find(f => {
        const name = f.replace(/\.app$/i, "")
        return name.toLowerCase() === appName.toLowerCase()
      })
      if (match) return path.join(dir, match)
    } catch { }
  }
  return null
}

async function openApp(appName: string): Promise<{ success: boolean; message: string }> {
  try {
    await open(appName, { wait: false })
    await sleep(PREOPEN_WAIT_MS)
    return { success: true, message: `已打开应用：${appName}` }
  } catch (error) {
    const appPath = await findAppPath(appName)
    if (appPath) {
      try {
        await open(appPath, { wait: false })
        await sleep(PREOPEN_WAIT_MS)
        return { success: true, message: `已打开应用：${appPath}` }
      } catch (e) {
        return { success: false, message: `打开应用失败：${String(e instanceof Error ? e.message : e)}` }
      }
    }
    return { success: false, message: `打开应用失败：${String(error instanceof Error ? error.message : error)}` }
  }
}

async function openBrowser(action: Action): Promise<{ success: boolean; message: string }> {
  try {
    let targetUrl = action.url
    if (!targetUrl && action.query) {
      targetUrl = `https://www.google.com/search?q=${encodeURIComponent(action.query)}`
    }
    if (!targetUrl) {
      targetUrl = "https://www.google.com"
    }
    await open(targetUrl, { wait: false })
    await sleep(PREOPEN_WAIT_MS)
    return { success: true, message: `已打开浏览器：${targetUrl}` }
  } catch (error) {
    return { success: false, message: `打开浏览器失败：${String(error instanceof Error ? error.message : error)}` }
  }
}

async function searchWeb(query: string): Promise<{ success: boolean; message: string }> {
  return await openBrowser({ type: "openBrowser", query })
}

async function moveMouse(x: number, y: number): Promise<{ success: boolean; message: string }> {
  try {
    robot.moveMouse(x, y)
    await sleep(ACTION_DELAY_MS)
    return { success: true, message: `鼠标已移动到：${x},${y}` }
  } catch (error) {
    return { success: false, message: `移动鼠标失败：${String(error instanceof Error ? error.message : error)}` }
  }
}

async function clickMouse(x: number, y: number, button: "left" | "right" = "left"): Promise<{ success: boolean; message: string }> {
  try {
    if (STRICT_CLICK_CONFIRM) {
      const currentPos = robot.getMousePos()
      const deltaX = Math.abs(currentPos.x - x)
      const deltaY = Math.abs(currentPos.y - y)
      if (deltaX > CLICK_STABLE_DELTA || deltaY > CLICK_STABLE_DELTA) {
        return { success: false, message: `鼠标位置不稳定：delta=${deltaX},${deltaY} > ${CLICK_STABLE_DELTA}` }
      }
    }

    robot.moveMouse(x, y)
    await sleep(ACTION_DELAY_MS)
    robot.mouseClick(button)
    await sleep(ACTION_DELAY_MS)
    return { success: true, message: `已${button === "right" ? "右键" : "左键"}点击：${x},${y}` }
  } catch (error) {
    return { success: false, message: `点击失败：${String(error instanceof Error ? error.message : error)}` }
  }
}

async function doubleClickMouse(x: number, y: number): Promise<{ success: boolean; message: string }> {
  try {
    robot.moveMouse(x, y)
    await sleep(ACTION_DELAY_MS)
    robot.mouseClick("left", true)
    await sleep(ACTION_DELAY_MS)
    return { success: true, message: `已双击：${x},${y}` }
  } catch (error) {
    return { success: false, message: `双击失败：${String(error instanceof Error ? error.message : error)}` }
  }
}

async function typeText(text: string): Promise<{ success: boolean; message: string }> {
  try {
    robot.typeString(text)
    await sleep(ACTION_DELAY_MS)
    return { success: true, message: `已输入文本：${text}` }
  } catch (error) {
    return { success: false, message: `输入文本失败：${String(error instanceof Error ? error.message : error)}` }
  }
}

async function pasteText(text: string): Promise<{ success: boolean; message: string }> {
  try {
    robot.keyTap("a", ["control"])
    await sleep(100)
    robot.typeString(text)
    await sleep(ACTION_DELAY_MS)
    return { success: true, message: `已粘贴文本：${text}` }
  } catch (error) {
    return { success: false, message: `粘贴文本失败：${String(error instanceof Error ? error.message : error)}` }
  }
}

async function pressKey(key: string): Promise<{ success: boolean; message: string }> {
  try {
    const normalized = normalizeKey(key)
    robot.keyTap(normalized)
    await sleep(ACTION_DELAY_MS)
    return { success: true, message: `已按下按键：${key}` }
  } catch (error) {
    return { success: false, message: `按键失败：${String(error instanceof Error ? error.message : error)}` }
  }
}

async function pressHotkey(keys: string[]): Promise<{ success: boolean; message: string }> {
  try {
    const normalized = Array.isArray(keys) ? keys.map(normalizeKey) : [normalizeKey(keys)]
    const mainKey = normalized.pop()
    robot.keyTap(mainKey!, normalized)
    await sleep(ACTION_DELAY_MS)
    return { success: true, message: `已按下快捷键：${normalized.join("+")}+${mainKey}` }
  } catch (error) {
    return { success: false, message: `快捷键失败：${String(error instanceof Error ? error.message : error)}` }
  }
}

async function scrollMouse(direction = "down", amount = 3): Promise<{ success: boolean; message: string }> {
  try {
    const scrollAmount = direction === "up" ? -amount : amount
    robot.scrollMouse(0, scrollAmount)
    await sleep(ACTION_DELAY_MS)
    return { success: true, message: `已滚动鼠标：${direction} ${amount}次` }
  } catch (error) {
    return { success: false, message: `滚动失败：${String(error instanceof Error ? error.message : error)}` }
  }
}

async function main(): Promise<void> {
  const args = parseArgs()
  if (!args.goal) {
    console.error("请提供目标描述，例如：node agent.js '打开浏览器并搜索天气'")
    process.exit(1)
  }

  logProgress("START", `开始执行目标：${args.goal}`)
  logProgress("CONFIG", `API 密钥：${maskApiKey(ARK_API_KEY)}`)
  logProgress("CONFIG", `模型：${ARK_MODEL}`)
  logProgress("CONFIG", `最大步数：${args.maxSteps}`)

  const mcpManager = new McpManager()
  const arkClient = new ArkApiClient()
  let agentState: AgentState = {
    phase: "OBSERVING",
    observation: "",
    lastObservation: "",
    stagnantSteps: 0,
    planSignatures: [],
    pendingChecklist: [],
    taskProgress: [],
    currentTask: "",
    remainingTasks: [],
    memoryHints: []
  }

  try {
    // 连接 MCP 服务器
    for (const [serverName, config] of Object.entries(MCP_SERVER_CONFIG)) {
      try {
        await mcpManager.connect(serverName, config)
      } catch (error) {
        logProgress("MCP", `跳过服务器 ${serverName}: ${String(error instanceof Error ? error.message : error)}`)
      }
    }

    // 预打开应用
    if (PREOPEN_APP) {
      logProgress("PREOPEN", `预打开应用：${PREOPEN_APP}`)
      await openApp(PREOPEN_APP)
    }

    let step = 0
    let actionResults: unknown[] = []

    while (step < args.maxSteps && agentState.phase !== "DONE") {
      step += 1
      logProgress("STEP", `第 ${step} 步 (阶段：${agentState.phase})`)

      // 捕获屏幕
      const screenshot = await captureScreen()
      const mousePos = await getMousePosition()

      // 获取记忆提示
      const memoryHints = await retrieveMemoryHints(args.goal, {}, mcpManager)

      // 构建消息
      const messages = [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `目标：${args.goal}\n` +
                `当前阶段：${agentState.phase}\n` +
                `观察：${agentState.observation || "无"}\n` +
                `待办清单：${agentState.pendingChecklist.map(item => item.item).join(", ") || "无"}\n` +
                `当前任务：${agentState.currentTask || "无"}\n` +
                `剩余任务：${agentState.remainingTasks.join(", ") || "无"}\n` +
                `鼠标位置：${mousePos.x},${mousePos.y}\n` +
                (memoryHints.length > 0 ? `记忆提示：${JSON.stringify(memoryHints, null, 2)}\n` : "") +
                `请分析当前状态并决定下一步行动。`
            }
          ]
        }
      ]

      if (screenshot && ENABLE_IMAGE_INPUT) {
        (messages[0].content as any[]).push({
          type: "image_url",
          image_url: {
            url: screenshot
          }
        })
      }

      // 调用模型
      let plan: Plan | null = null
      for (let retry = 0; retry < MAX_AI_RETRIES; retry++) {
        try {
          const response = await arkClient.callModel(messages, {
            systemPrompt: `你是一个桌面自动化助手。请分析当前屏幕状态和目标，制定合理的行动计划。

行动类型包括:
- openApp: 打开应用
- openBrowser: 打开浏览器
- searchWeb: 搜索网页
- mcp: 调用 MCP 工具
- move: 移动鼠标
- click: 点击
- doubleClick: 双击
- rightClick: 右键点击
- type: 输入文本
- paste: 粘贴文本
- key: 按键
- hotkey: 快捷键
- wait: 等待
- scroll: 滚动
- noop: 无操作

请返回 JSON 格式的响应，包含观察、推理、完成状态、任务进度和行动列表。`
          })

          const resp = response as Record<string, unknown>
          const choices = resp.choices as unknown[]
          if (choices && choices.length > 0) {
            const choice = choices[0] as Record<string, unknown>
            const message = choice.message as Record<string, unknown>
            plan = parsePlanFromModelContent(message?.content)
          }
          if (plan) break
        } catch (error) {
          logProgress("AI", `模型调用失败 (重试 ${retry + 1}/${MAX_AI_RETRIES}): ${String(error instanceof Error ? error.message : error)}`)
          if (retry === MAX_AI_RETRIES - 1) throw error
          await sleep(1000)
        }
      }

      if (!plan) {
        logProgress("AI", "无法解析模型响应")
        break
      }

      logProgress("PLAN", `计划：${JSON.stringify(compactForLog(plan))}`)

      // 执行行动
      const stepActions = Array.isArray(plan.actions) ? plan.actions : []
      const stepResults: unknown[] = []

      for (const action of stepActions) {
        if (args.dryRun) {
          logProgress("DRY_RUN", `模拟执行：${summarizeAction(action as Record<string, unknown>)}`)
          stepResults.push({ success: true, actionType: action.type, target: summarizeAction(action as Record<string, unknown>) })
          continue
        }

        try {
          const result = await executeAction(action, mcpManager)
          stepResults.push({ ...(result as Record<string, unknown>), actionType: action.type, target: summarizeAction(action as Record<string, unknown>) })
          await sleep(ACTION_DELAY_MS)
        } catch (error) {
          logProgress("ACTION", `执行失败：${String(error instanceof Error ? error.message : error)}`)
          stepResults.push({ success: false, actionType: action.type, target: summarizeAction(action as Record<string, unknown>), message: String(error instanceof Error ? error.message : error) })
        }
      }

      actionResults.push(...stepResults)

      // 更新代理状态
      agentState = updateAgentState(agentState, plan, plan, { memoryHints })

      // 检查完成条件
      if (plan.done || checklistAllPassed(plan.checklist)) {
        logProgress("DONE", "目标已完成")
        await storeMemoryObservation({
          goal: args.goal,
          browserState: {},
          status: "success",
          summary: plan.observation,
          actionResults,
          mcpManager
        })
        break
      }

      await sleep(LOOP_DELAY_MS)
    }

    if (agentState.phase !== "DONE") {
      logProgress("STOP", `已达到最大步数限制：${args.maxSteps}`)
      await storeMemoryObservation({
        goal: args.goal,
        browserState: {},
        status: "partial",
        summary: agentState.observation,
        actionResults,
        mcpManager
      })
    }

  } catch (error) {
    logProgress("ERROR", `执行失败：${String(error instanceof Error ? error.message : error)}`)
  } finally {
    await mcpManager.disconnectAll()
    logProgress("END", "代理执行结束")
  }
}

const isDirectExecution = (() => {
  try {
    const mod = import.meta.url.replace('file:///', '').replace(/\\/g, '/')
    const arg = process.argv[1]?.replace(/\\/g, '/') ?? ''
    if (!arg) return false
    return mod.endsWith(arg)
  } catch {
    return false
  }
})()
if (isDirectExecution) {
  main().catch((error) => {
    console.error("代理执行出错:", error)
    process.exit(1)
  })
}

export { main, sanitizeJson, tryRepairJsonText }
