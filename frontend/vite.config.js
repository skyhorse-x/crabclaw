import { defineConfig } from "vite"
import vue from "@vitejs/plugin-vue"
import path from "node:path"

export default defineConfig({
  root: path.resolve(__dirname),
  plugins: [vue()],
  base: "./",
  server: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:17872",
        changeOrigin: true,
        secure: false
      }
    }
  },
  build: {
    outDir: path.resolve(__dirname, "../resources"),
    emptyOutDir: false
  }
})
