import { defineConfig } from "vite"
import vue from "@vitejs/plugin-vue"
import path from "node:path"
import fs from "node:fs"

function getBackendPort() {
  try {
    const portFile = path.resolve(__dirname, "../server/.port")
    if (fs.existsSync(portFile)) {
      return fs.readFileSync(portFile, "utf-8").trim()
    }
  } catch {}
  return process.env.VITE_BACKEND_PORT || "17871"
}

export default defineConfig(({ mode }) => {
  const backendPort = getBackendPort()

  return {
    root: path.resolve(__dirname),
    plugins: [vue()],
    base: "./",
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src")
      }
    },
    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: true,
      proxy: {
        "/api": {
          target: `http://127.0.0.1:${backendPort}`,
          changeOrigin: true,
          secure: false
        },
        "/ws": {
          target: `ws://127.0.0.1:${backendPort}`,
          ws: true
        }
      }
    },
    build: {
      outDir: path.resolve(__dirname, "../resources"),
      emptyOutDir: false
    }
  }
})
