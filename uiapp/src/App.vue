<template>
  <div class="app-shell">
    <nav class="nav">
      <!-- <router-link to="/cameras">Camera</router-link> -->
      <!-- <router-link to="/manual-event">Event</router-link> -->
    </nav>
    <router-view />
  </div>
</template>

<style>
@import "./styles/theme.css";

html, body {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  background: var(--bg);
  color: var(--text-body);
}

#app {
  min-height: 100vh;
  background: var(--bg);
}

.app-shell {
  min-height: 100vh;
  background: var(--bg);
  color: var(--text-body);
}
</style>
