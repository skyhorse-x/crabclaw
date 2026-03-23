import { createApp } from "vue"
import ElementPlus from "element-plus"
import "element-plus/dist/index.css"
import App from "./App.vue"
import "./styles.css"
import { errorHandler } from './utils/error-handler'

const app = createApp(App)

// 使用 Element Plus
app.use(ElementPlus)

// 全局错误处理示例（可选）
// app.config.errorHandler = (err, instance, info) => {
//   errorHandler.handleError(err)
// }

// 挂载应用
app.mount("#app")
