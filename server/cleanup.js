// server/cleanup.js
const admin = require("firebase-admin");

async function deleteCaptureFile(storagePath) {
  if (!storagePath) return;
  await admin.storage().bucket().file(storagePath).delete().catch(() => {});
}

async function deleteCaptureFilesFromSessionData(data) {
  if (!data) return;

  // NEW paths
  await deleteCaptureFile(data.previewPath);
  await deleteCaptureFile(data.originalPath);

  // Legacy fallback (if any old docs still use it)
  await deleteCaptureFile(data.storagePath);
}

async function cleanupExpiredCaptures() {
  const now = Date.now();
  const db = admin.firestore();

  const snap = await db
    .collection("captureSessions")
    .where("deleteAfter", "<", now)
    .get();

  for (const doc of snap.docs) {
    const data = doc.data() || {};

    // ✅ delete preview + original + legacy
    await deleteCaptureFilesFromSessionData(data);

    // ✅ remove session doc
    await doc.ref.delete().catch(() => {});
  }
}

module.exports = {
  deleteCaptureFile,
  cleanupExpiredCaptures,
};