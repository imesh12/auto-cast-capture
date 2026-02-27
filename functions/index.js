const admin = require("firebase-admin");
admin.initializeApp();
const db = admin.firestore();

// ✅ v2 Firestore trigger
const { onDocumentWritten } = require("firebase-functions/v2/firestore");

// (optional) set region
// const { setGlobalOptions } = require("firebase-functions/v2");
// setGlobalOptions({ region: "asia-northeast1" });

function isValidMsNumber(v) {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

// ✅ No luxon needed: JST dayKey (yyyy-MM-dd)
function jstDayKeyFromMs(ms) {
  const jstMs = ms + 9 * 60 * 60 * 1000;
  const d = new Date(jstMs);

  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

exports.syncCameraCaptureCounts = onDocumentWritten(
  "captureSessions/{sessionId}",
  async (event) => {
    const after = event.data.after.exists ? event.data.after.data() : null;
    const before = event.data.before.exists ? event.data.before.data() : null;

    // deleted -> ignore
    if (!after) return;

    const clientId = after.clientId || before?.clientId;
    const cameraId = after.cameraId || before?.cameraId;
    if (!clientId || !cameraId) return;

    // ✅ adjust this if your camera path differs
    const cameraRef = db.doc(`clients/${clientId}/cameras/${cameraId}`);

    const afterCapturedAt = after.capturedAt;
    const beforeCapturedAt = before?.capturedAt;

    const afterPaid = !!after.paid;
    const beforePaid = !!before?.paid;

    // ✅ Count capture ONCE when capturedAt appears first time
    const becameCaptured =
      !isValidMsNumber(beforeCapturedAt) && isValidMsNumber(afterCapturedAt);

    // ✅ Count paid ONCE when paid becomes true
    const becamePaid = !beforePaid && afterPaid;

    // choose timestamp for "today" bucket
    const msForDay = isValidMsNumber(afterCapturedAt)
      ? afterCapturedAt
      : isValidMsNumber(after.createdAt)
        ? after.createdAt
        : null;

    const updates = {};

    if (becameCaptured) {
      updates.totalCaptures = admin.firestore.FieldValue.increment(1);

      if (msForDay) {
        const dayKey = jstDayKeyFromMs(msForDay);
        updates[`dailyCaptures.${dayKey}`] =
          admin.firestore.FieldValue.increment(1);
      }

      updates.lastCapturedAt = afterCapturedAt;
    }

    if (becamePaid) {
      updates.paidCaptures = admin.firestore.FieldValue.increment(1);
      updates.lastPaidAt =
        after.paidAt || admin.firestore.FieldValue.serverTimestamp();
    }

    if (Object.keys(updates).length === 0) return;

    await cameraRef.set(updates, { merge: true });
  }
);
