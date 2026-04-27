<template>
  <div class="app-shell">
    <nav class="nav">
      <router-link to="/cameras">Camera</router-link>
      <router-link to="/manual-event">Event</router-link>
    </nav>
    <router-view />
  </div>
</template>

<style>
html, body {
  margin:0;
  padding:0;
  width:100%;
  height:100%;
  background:#202020;
}

#app {
  min-height:100vh;
  background:#202020;
}

.app-shell {
  min-height:100vh;
}

.nav{
  background:#222;
  padding:10px;
  display:flex;
  gap:10px;
}

.nav a{
  color:white;
  text-decoration:none;
  padding:6px 10px;
  background:#444;
  border-radius:4px;
}

.nav a.router-link-active{
  background:#0080ff;
}
</style>