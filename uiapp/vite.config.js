// uiapp/vite.config.js
import { defineConfig, loadEnv } from "vite"
import vue from "@vitejs/plugin-vue"

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, "../", "")
  const apiTarget =
    env.VITE_API_BASE_URL ||
    `http://127.0.0.1:${env.PORT || 8080}`

  return {
  plugins: [vue()],
  envDir: "../",
  base: "./",
  server: {
    host: "0.0.0.0",
    port: 5175,
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true
      },
      "/timelapse-file": {
        target: apiTarget,
        changeOrigin: true
      },
      "/exports": {
        target: apiTarget,
        changeOrigin: true
      }
    }
  }
  }
})
