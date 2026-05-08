<template>
  <footer class="footer">
    <!-- LEFT -->
    <div class="footer-left">
      © 2026 TimeLapse Pro. All rights reserved.
    </div>

    <!-- RIGHT -->
    <div class="footer-right">
      <RouterLink to="/terms">利用規約</RouterLink>
    </div>
  </footer>
</template>

<style scoped>
.footer {
  height: 48px;
  background: var(--surface);
  border-top: 1px solid var(--border);

  display: flex;
  align-items: center;
  justify-content: space-between;

  padding: 0 20px;
  font-size: 12px;
  color: var( --text-light-grey);
}

/* LEFT */
.footer-left {
  white-space: nowrap;
}

/* RIGHT */
.footer-right {
  display: flex;
  gap: 20px;
}

.footer-right a {
  color: var( --text-light-grey);
  text-decoration: none;
  transition: 0.2s;
}

.footer-right a:hover {
  color: var(--primary);
}
</style>
