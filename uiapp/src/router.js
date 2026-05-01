import { createRouter, createWebHashHistory } from "vue-router"

import CameraSettingsView from "./views/CameraSettingsView.vue"
import ManualEventView from "./views/ManualEventView.vue"
import TimelapseExportView from "./views/TimelapseExportView.vue"
import TimelapseView from "./views/TimelapseView.vue"
import LoginView from "./views/LoginView.vue"

function hasToken() {
  return !!localStorage.getItem("auth_token")
}

const routes = [
  { path: "/login", component: LoginView, meta: { guestOnly: true } },
  { path: "/", redirect: "/manage-event" },
  { path: "/cameras", component: CameraSettingsView, meta: { requiresAuth: true } },//カメラ管理
  { path: "/camera", redirect: "/cameras" },
  { path: "/manage-event", component: ManualEventView, meta: { requiresAuth: true } }, //タイムラプス管理
  { path: "/library", component: TimelapseExportView, meta: { requiresAuth: true } }, //ライブラリー
  { path: "/timelapse", component: TimelapseView, meta: { requiresAuth: true } }, //タイムラプス登録
  { path: "/:pathMatch(.*)*", redirect: "/manage-event" }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

router.beforeEach((to) => {
  const loggedIn = hasToken()

  if (to.meta?.requiresAuth && !loggedIn) {
    return "/login"
  }

  if (to.meta?.guestOnly && loggedIn) {
    return "/manage-event"
  }

  return true
})

export default router
