// uiapp/vite.config.js
import { defineConfig } from "vite"
import vue from "@vitejs/plugin-vue"

export default defineConfig({
  plugins: [vue()],
  base: "./",
  server: {
    host: "0.0.0.0",
    port: 5175,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8080",
        changeOrigin: true
      },
      "/timelapse-file": {
        target: "http://127.0.0.1:8080",
        changeOrigin: true
      },
      "/exports": {
        target: "http://127.0.0.1:8080",
        changeOrigin: true
      }
    }
  }
})