// server/firebaseAdmin.js
const admin = require("firebase-admin");
const path = require("path");

/* ======================================================
   FIREBASE INIT (✅ SAFE SINGLETON)
   - avoids: Firebase app named "[DEFAULT]" already exists
====================================================== */
if (!admin.apps.length) {
  const serviceAccount = require(path.join(__dirname, "serviceAccountKey.json"));

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET, // e.g. "xxx.appspot.com"
  });

  console.log("✅ Firebase Admin initialized");
} else {
  console.log("✅ Firebase Admin already initialized (reusing existing app)");
}

const db = admin.firestore();
const bucket = admin.storage().bucket();
console.log("✅ Storage bucket:", bucket.name);

/* ======================================================
   CAMERA LOOKUP (COLLECTION GROUP SAFE)
====================================================== */
async function getCameraConfig(cameraId) {
  const snap = await db
    .collectionGroup("cameras")
    .where("cameraId", "==", cameraId)
    .limit(1)
    .get();

  if (snap.empty) {
    throw new Error(`Camera not found: ${cameraId}`);
  }

  return {
    cameraRef: snap.docs[0].ref,
    camera: snap.docs[0].data(),
    clientId: snap.docs[0].ref.parent.parent.id,
  };
}

module.exports = {
  admin,
  db,
  bucket,
  getCameraConfig,
};
