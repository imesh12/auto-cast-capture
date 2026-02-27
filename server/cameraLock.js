// server/cameraLock.js
// In-memory authoritative camera lock manager

const LOCK_TTL_MS = 2 * 60 * 1000; // 2 minutes max lock lifetime
const locks = new Map();

/*
locks structure:
cameraId => {
  sessionId,
  lockedAt
}
*/

module.exports = {
  lock(cameraId, sessionId) {
    if (locks.has(cameraId)) return false;

    locks.set(cameraId, {
      sessionId,
      lockedAt: Date.now(),
    });

    return true;
  },

  unlock(cameraId) {
    locks.delete(cameraId);
  },

  isLocked(cameraId) {
    return locks.has(cameraId);
  },

  isLockedBy(cameraId, sessionId) {
    const lock = locks.get(cameraId);
    if (!lock) return false;
    return lock.sessionId === sessionId;
  },

  get(cameraId) {
    return locks.get(cameraId) || null;
  },

  // ✅ REQUIRED by server.js
  cleanup() {
    const now = Date.now();

    for (const [cameraId, lock] of locks.entries()) {
      if (now - lock.lockedAt > LOCK_TTL_MS) {
        console.warn("🧹 Stale camera lock released:", cameraId);
        locks.delete(cameraId);
      }
    }
  },
};
