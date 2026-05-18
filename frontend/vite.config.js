import { defineConfig } from "vite"
import vue from "@vitejs/plugin-vue"
import path from "node:path"
import fs from "node:fs"

function getBackendPort() {
  try {
    const portFile = path.resolve(__dirname, "../server/.port")
    return parseInt(fs.readFileSync(portFile, "utf-8").trim(), 10) || 17870
  } catch {
    return 17870
  }
}

export default defineConfig(() => {
  const backendPort = getBackendPort()

  return {
    root: path.resolve(__dirname),
    plugins: [vue()],
    base: "./",
    define: {
      __BACKEND_PORT__: backendPort
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src")
      }
    },
    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: false,
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
