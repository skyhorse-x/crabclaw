import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { readdir, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import open from "open"

// 尝试导入 robotjs，如果失败则使用降级方案
let robot
try {
  robot = require("robotjs")
} catch (error) {
  console.warn("警告: robotjs 模块加载失败，部分功能将不可用")
  // 创建一个空的 robot 对象，避免后续代码出错
  robot = {
    getScreenSize: () => ({ width: 1920, height: 1080 }),
    getMousePos: () => ({ x: 0, y: 0 }),
    moveMouseSmooth: () => {},
    mouseClick: () => {},
    typeString: () => {},
    keyTap: () => {},
    scrollMouse: () => {}
  }
}

let screenshot
try {
  screenshot = require("screenshot-desktop")
} catch (error) {
  console.warn("警告: screenshot-desktop 模块加载失败，截图功能将不可用")
  screenshot = {
    default: async () => {
      throw new Error("screenshot-desktop 模块未加载")
    }
  }
}

const execFileAsync = promisify(execFile)

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

async function readPayload() {
  const chunks = []
  for await (const chunk of process.stdin) {
    chunks.push(chunk)
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim()
  return raw ? JSON.parse(raw) : {}
}

async function writeClipboard(text) {
  const value = String(text || "")
  if (process.platform === "darwin") {
    await execFileAsync("pbcopy", [], { input: value })
    return
  }
  if (process.platform === "win32") {
    await execFileAsync("powershell", ["-NoProfile", "-Command", "Set-Clipboard"], { input: value })
    return
  }
  const tmpFile = path.join(os.tmpdir(), `desktop-agent-clipboard-${Date.now()}.txt`)
  await writeFile(tmpFile, value, "utf8")
  await execFileAsync("sh", ["-lc", `cat ${JSON.stringify(tmpFile)} | xclip -selection clipboard`])
}

async function findAppPath(appName) {
  const searchDirs = ["/Applications", path.join(os.homedir(), "/Applications"), "/System/Applications"]
  for (const dir of searchDirs) {
    try {
      const files = await readdir(dir)
      const match = files.find(f => {
        const name = f.replace(/\.app$/i, "")
        return name.toLowerCase() === appName.toLowerCase()
      })
      if (match) return path.join(dir, match)
    } catch { }
  }
  return null
}

async function openApp(appName) {
  const target = String(appName || "").trim()
  if (!target) return { ok: false, error: "missing app name" }

  if (process.platform === "darwin") {
    try {
      await execFileAsync("open", ["-a", target])
    } catch (e) {
      const appPath = await findAppPath(target)
      if (appPath) {
        await execFileAsync("open", [appPath])
      } else {
        throw e
      }
    }
  } else if (process.platform === "win32") {
    await execFileAsync("cmd", ["/c", "start", "", target])
  } else {
    await execFileAsync("sh", ["-lc", `${JSON.stringify(target)} >/dev/null 2>&1 &`])
  }

  return { ok: true, target }
}

async function executeAction(action) {
  const screen = robot.getScreenSize()
  const x = Number.isFinite(action?.x) ? clamp(Math.round(action.x), 0, screen.width - 1) : null
  const y = Number.isFinite(action?.y) ? clamp(Math.round(action.y), 0, screen.height - 1) : null

  switch (action?.type) {
    case "openApp":
      return openApp(action.app)
    case "openUrl":
      const url = String(action.url || "").trim()
      await open(url)
      
      // 控制浏览器窗口位置
      if (Number.isFinite(action.x) && Number.isFinite(action.y)) {
        const x = Math.round(action.x)
        const y = Math.round(action.y)
        
        if (process.platform === "darwin") {
          // macOS: 使用 AppleScript 控制窗口位置
          const appleScript = `
            tell application "System Events"
              repeat with process in processes
                if name of process is "Safari" or name of process is "Google Chrome" or name of process is "Firefox" then
                  tell process
                    set frontmost to true
                    delay 0.5
                    set position of front window to {${x}, ${y}}
                  end tell
                  exit repeat
                end if
              end repeat
            end tell
          `
          await execFileAsync("osascript", ["-e", appleScript])
        } else if (process.platform === "win32") {
          // Windows: 使用 PowerShell 控制窗口位置
          const powershellScript = `
            Add-Type -TypeDefinition @"
              using System;
              using System.Runtime.InteropServices;
              public class WindowHelper {
                [DllImport("user32.dll")]
                public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
                [DllImport("user32.dll")]
                public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
                public const uint SWP_NOSIZE = 0x0001;
                public const uint SWP_NOZORDER = 0x0004;
              }
            "@
            $browsers = @("chrome", "firefox", "safari", "edge")
            foreach ($browser in $browsers) {
              $hWnd = [WindowHelper]::FindWindow($null, "*$browser*")
              if ($hWnd -ne [IntPtr]::Zero) {
                [WindowHelper]::SetWindowPos($hWnd, [IntPtr]::Zero, ${x}, ${y}, 0, 0, [WindowHelper]::SWP_NOSIZE -bor [WindowHelper]::SWP_NOZORDER)
                break
              }
            }
          `
          await execFileAsync("powershell", ["-NoProfile", "-Command", powershellScript])
        } else {
          // Linux: 使用 wmctrl 控制窗口位置
          try {
            await execFileAsync("wmctrl", ["-r", "*", "-e", `0,${x},${y},0,0`])
          } catch (error) {
            // 如果 wmctrl 不可用，尝试使用 xdotool
            try {
              await execFileAsync("xdotool", ["search", "--onlyvisible", "--name", "", "windowmove", "%1", x, y])
            } catch (e) {
              // 忽略错误，继续执行
            }
          }
        }
      }
      
      return { ok: true, url, x: action.x, y: action.y }
    case "move":
      robot.moveMouseSmooth(x, y)
      return { ok: true, x, y }
    case "click":
      robot.moveMouseSmooth(x, y)
      robot.mouseClick("left", false)
      return { ok: true, x, y }
    case "doubleClick":
      robot.moveMouseSmooth(x, y)
      robot.mouseClick("left", true)
      return { ok: true, x, y }
    case "rightClick":
      robot.moveMouseSmooth(x, y)
      robot.mouseClick("right", false)
      return { ok: true, x, y }
    case "type":
      robot.typeString(String(action.text || ""))
      return { ok: true }
    case "paste":
      await writeClipboard(String(action.text || ""))
      if (process.platform === "darwin") {
        robot.keyTap("v", ["command"])
      } else {
        robot.keyTap("v", ["control"])
      }
      return { ok: true }
    case "key":
      robot.keyTap(String(action.key || "").toLowerCase())
      return { ok: true }
    case "hotkey": {
      const keys = Array.isArray(action.keys) ? action.keys.map((key) => String(key || "").toLowerCase()).filter(Boolean) : []
      const main = keys.pop()
      if (!main) {
        return { ok: false, error: "missing hotkey main key" }
      }
      robot.keyTap(main, keys)
      return { ok: true }
    }
    case "wait":
      await sleep(Math.max(0, Number(action.ms) || 500))
      return { ok: true }
    case "scroll":
      robot.scrollMouse(Number(action.dx) || 0, Number(action.dy) || -240)
      return { ok: true }
    case "note":
      return { ok: true, note: String(action.note || action.label || "") }
    default:
      return { ok: false, error: `unsupported action type: ${String(action?.type || "")}` }
  }
}

async function getSystemState() {
  const mouse = robot.getMousePos()
  const screen = robot.getScreenSize()
  return {
    ok: true,
    mouse,
    screen,
    timestamp: new Date().toISOString()
  }
}

async function captureScreenshot() {
  try {
    const output = path.join(os.tmpdir(), `desktop-agent-shot-${Date.now()}.jpg`)
    await screenshot.default({ filename: output, format: "jpg" })
    return {
      ok: true,
      path: output
    }
  } catch (error) {
    return {
      ok: false,
      error: `截图失败: ${error.message}`
    }
  }
}

async function executeWorkflow(payload) {
  const steps = Array.isArray(payload?.steps) ? payload.steps : []
  const delayMs = Math.max(0, Number(payload?.delayMs) || 180)
  const results = []

  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index]
    const startedAt = new Date().toISOString()
    try {
      const result = await executeAction(step)
      results.push({
        index,
        step,
        startedAt,
        finishedAt: new Date().toISOString(),
        ...result
      })
      if (!result.ok) {
        return { ok: false, results }
      }
    } catch (error) {
      results.push({
        index,
        step,
        startedAt,
        finishedAt: new Date().toISOString(),
        ok: false,
        error: String(error?.message || error)
      })
      return { ok: false, results }
    }

    if (index < steps.length - 1 && delayMs > 0) {
      await sleep(delayMs)
    }
  }

  return { ok: true, results }
}

async function main() {
  const command = process.argv[2] || ""
  const payload = await readPayload()
  let result

  if (command === "system-state") {
    result = await getSystemState()
  } else if (command === "screenshot") {
    result = await captureScreenshot()
  } else if (command === "action") {
    result = await executeAction(payload?.action || payload)
  } else if (command === "workflow") {
    result = await executeWorkflow(payload)
  } else {
    result = { ok: false, error: `unknown command: ${command}` }
  }

  process.stdout.write(JSON.stringify(result))
}

main().catch((error) => {
  process.stderr.write(String(error?.stack || error?.message || error))
  process.exit(1)
})
