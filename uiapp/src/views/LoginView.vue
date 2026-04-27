<template>
  <div class="login-page">
    <div class="login-card">
      <h2>Login</h2>

      <input v-model="username" class="input" placeholder="Username" />
      <input v-model="password" class="input" type="password" placeholder="Password" />

      <button class="btn" :disabled="loading" @click="handleLogin">
        {{ loading ? "Logging in..." : "Login" }}
      </button>

      <div v-if="error" class="error">{{ error }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue"
import api from "../api/api"

const username = ref("")
const password = ref("")
const loading = ref(false)
const error = ref("")

async function handleLogin() {
  error.value = ""
  loading.value = true

  try {
    const result = await api.login(username.value, password.value)

    if (!result?.ok) {
      throw new Error(result?.error || "Login failed")
    }

    window.location.href = "/#/manual-event"
  } catch (e) {
    error.value = e.message || "Login failed"
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #111827;
}

.login-card {
  width: 340px;
  background: white;
  border-radius: 14px;
  padding: 24px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.2);
}

.input {
  width: 100%;
  margin-top: 12px;
  padding: 10px 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  box-sizing: border-box;
}

.btn {
  width: 100%;
  margin-top: 16px;
  padding: 10px 12px;
  border: none;
  border-radius: 8px;
  background: #2563eb;
  color: white;
  cursor: pointer;
}

.btn:disabled {
  opacity: 0.7;
  cursor: default;
}

.error {
  margin-top: 12px;
  color: #dc2626;
  font-size: 14px;
}
</style>