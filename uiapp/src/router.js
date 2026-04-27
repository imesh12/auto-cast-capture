import { createRouter, createWebHashHistory } from "vue-router"

import CameraSettingsView from "./views/CameraSettingsView.vue"
import ManualEventView from "./views/ManualEventView.vue"
import LoginView from "./views/LoginView.vue"

function hasToken() {
  return !!localStorage.getItem("auth_token")
}

const routes = [
  { path: "/login", component: LoginView, meta: { guestOnly: true } },
  { path: "/", redirect: "/manual-event" },
  { path: "/cameras", component: CameraSettingsView, meta: { requiresAuth: true } },
  { path: "/manual-event", component: ManualEventView, meta: { requiresAuth: true } },
  { path: "/:pathMatch(.*)*", redirect: "/manual-event" }
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
    return "/manual-event"
  }

  return true
})

export default router