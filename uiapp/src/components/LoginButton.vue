<script setup>
import { useRouter } from "vue-router"
import api from "../api/api"

const router = useRouter()

async function logout() {
  try {
    await api.logout()
  } catch (error) {
    console.warn("logout error:", error)
  }

  api.clearSession()
  await router.replace("/login")
}
</script>

<template>
  <button class="logout-btn" @click="logout">
    Logout
  </button>
</template>

<style scoped>
.logout-btn {
  background: var(--error);
  color: #fff;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.logout-btn:hover {
  background: #ef4444;
}
</style>