<template>
  <header class="navbar">
    <div class="nav-left">
      <span class="logo">
        <span class="logo-primary">TimeLapse</span>
        <span class="logo-text">Pro</span>
      </span>
    </div>

    <nav class="nav-center">
      <router-link to="/library" class="nav-link" active-class="active">
        ライブラリー
      </router-link>
      <router-link to="/cameras" class="nav-link" active-class="active">
        カメラ管理
      </router-link>
      <router-link to="/manage-event" class="nav-link" active-class="active">
        タイムラプス管理
      </router-link>
      <router-link to="/timelapse" class="nav-link" active-class="active">
       タイムラプス登録
      </router-link>
    </nav>

    <div class="nav-right">
      <LoginButton />
    </div>
  </header>
</template>

<script setup>
import LoginButton from "./LoginButton.vue"
</script>

<style scoped>
.navbar {
  height: 56px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
}

.logo {
  font-size: 16px;
  font-weight: 600;
}

.logo-primary {
  color: var(--primary);
}

.logo-text {
  color: var(--text-heading);
  margin-left: 4px;
}

.nav-center {
  display: flex;
  gap: 28px;
}

.nav-link {
  font-size: 14px;
  color: var(--text-body);
  text-decoration: none;
  position: relative;
  padding-bottom: 6px;
}

.nav-link:hover {
  color: var(--primary);
  text-decoration: none;
}

.nav-link.active {
  color: var(--primary);
  font-weight: 500;
}

.nav-link.active::after {
  content: "";
  position: absolute;
  left: 0;
  bottom: 0;
  width: 100%;
  height: 2px;
  background: var(--primary);
  border-radius: 2px;
}

.nav-right {
  font-size: 14px;
  color: var(--text-muted);
}

.icon {
  cursor: pointer;
}
</style>
