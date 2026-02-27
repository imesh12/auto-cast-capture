// server/stripe/stripeHelpers.js
const admin = require("../firebaseAdmin");

function toTs(sec) {
  if (sec === null || sec === undefined) return null;
  const n = typeof sec === "string" ? Number(sec) : sec;
  if (!Number.isFinite(n) || n <= 0) return null;
  return admin.firestore.Timestamp.fromMillis(n * 1000);
}

function daysRemainingFromSec(sec) {
  if (sec === null || sec === undefined) return null;
  const n = typeof sec === "string" ? Number(sec) : sec;
  if (!Number.isFinite(n) || n <= 0) return null;

  const diff = n * 1000 - Date.now();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

// Create signed download url (optional, for B2C paid flow)
async function createSignedDownloadUrl({ storagePath, sessionId, isPhoto }) {
  const bucket = admin.storage().bucket();
  const filename = isPhoto ? `TownCapture_${sessionId}.jpg` : `TownCapture_${sessionId}.mp4`;

  const [url] = await bucket.file(storagePath).getSignedUrl({
    action: "read",
    expires: Date.now() + 60 * 60 * 1000, // 1 hour
    responseDisposition: `attachment; filename="${filename}"`,
  });

  return url;
}

// Idempotency: store processed events
async function markEventProcessed(eventId) {
  const db = admin.firestore();
  const ref = db.collection("stripeEvents").doc(eventId);

  // Create doc if not exists (atomic by create)
  try {
    await ref.create({
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return true; // newly processed
  } catch (e) {
    // Firestore ALREADY_EXISTS
    if (String(e?.code) === "6" || /already exists/i.test(String(e?.message))) {
      return false; // already processed
    }
    throw e;
  }
}

module.exports = {
  toTs,
  daysRemainingFromSec,
  createSignedDownloadUrl,
  markEventProcessed,
};
