<template>
  <div class="login-page">
    <div class="login-page-body">
    <!-- LEFT SIDE -->
    <div class="left-panel">
      <h1 class="logo">
        <span class="blue">TimeLapse</span> <span class="dark">Pro</span>
      </h1>
      <p class="subtitle">
        ネットワークカメラによる高精度タイムラプス自動撮影システム
      </p>
    </div>

    <!-- RIGHT SIDE -->
    <div class="right-panel">
      <div class="login-box">
        <h2 class="title">ログイン</h2>
        <p class="desc">アカウント情報を入力して管理画面へ進みます</p>

        <div class="form-group">
          <label>ユーザー名</label>
          <input v-model="username" class="input" placeholder="admin" />
        </div>

        <div class="form-group">
          <label>パスワード</label>
          <input v-model="password" class="input" type="password" placeholder="********" />
        </div>

        <button class="btn" :disabled="loading" @click="handleLogin">
          {{ loading ? "ログイン中..." : "ログイン" }}
        </button>

        <div v-if="error" class="error">{{ error }}</div>
      </div>
    </div>
    </div>
    <Footer />
  </div>
</template>

<script setup>
import { ref } from "vue"
import api from "../api/api"
import Footer from "../components/Footer.vue"

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

    window.location.href = "/#/manage-event"
  } catch (e) {
    error.value = e.message || "Login failed"
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: var(--bg);

}

.login-page-body {
  flex: 1;
  display: flex;
  min-height: 0;
}

/* LEFT PANEL */
.left-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding-left: 80px;
}

.logo {
  font-size: 80px;
  font-weight: 700;
  letter-spacing: -0.5px;
}

.logo .blue {
  color: var(--primary);
}

.logo .dark {
  color: var(--text-heading);
}

.subtitle {
  margin-top: 20px;
  color: var(--text-muted);
  line-height: 1.6;
  font-size: 20px;
}

/* RIGHT PANEL */
.right-panel {
  width: 600px;
  background: var(--surface-alt);
  display: flex;
  align-items: center;
  justify-content: center;
}

/* LOGIN BOX */
.login-box {
  width: 100%;
  max-width: 320px;
}

/* TITLE */
.title {
  font-size: 24px;
  font-weight: 600;
  color: var(--text-heading);
}

.desc {
  font-size: 13px;
  color: var(--text-muted);
  margin-top: 6px;
  margin-bottom: 20px;
}

/* FORM */
.form-group {
  margin-bottom: 14px;
}

.form-group label {
  font-size: 12px;
  color: var(--text-body);
  display: block;
  margin-bottom: 6px;
}

/* INPUT */
.input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  font-size: 14px;
}

.input:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-soft);
}
.input::placeholder {
  color: var(--text-placeholder);
   opacity: 1; 
}

/* BUTTON */
.btn {
  width: 100%;
  margin-top: 12px;
  padding: 10px;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--primary);
  color: white;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  box-shadow: var(--shadow-sm);
  transition: 0.2s;
}

.btn:hover {
  background: var(--primary-hover);
}

.btn:disabled {
  opacity: 0.7;
  cursor: default;
}

/* ERROR */
.error {
  margin-top: 10px;
  color: var(--error);
  font-size: 13px;
}
</style>
