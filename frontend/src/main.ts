import { createApp } from "vue"
import ElementPlus from "element-plus"
import "element-plus/dist/index.css"
import App from "./App.vue"
import router from "./router"
import i18n from "./i18n"
import "./styles.css"
import { startBackend } from "./services/backendService"

function waitForNeutralino(): Promise<void> {
  return new Promise((resolve) => {
    if ((window as any).Neutralino) {
      ;(window as any).Neutralino.init()
      resolve()
      return
    }
    window.addEventListener('load', () => {
      if ((window as any).Neutralino) {
        ;(window as any).Neutralino.init()
      }
      resolve()
    })
  })
}

const app = createApp(App)

app.use(ElementPlus)
app.use(router)
app.use(i18n)

app.mount("#app")

;(async () => {
  await waitForNeutralino()
  console.log('[App] Starting backend...')
  await startBackend()
})()
