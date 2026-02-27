// server/createCameraRegistry.js
const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function run() {
  const snaps = await db.collectionGroup("cameras").get();

  console.log("Found cameras:", snaps.size);

  for (const doc of snaps.docs) {
    const cameraId = doc.id;
    const clientId = doc.ref.parent.parent.id;

    await db.doc(`cameraRegistry/${cameraId}`).set({
      cameraId,
      clientId,
      cameraPath: doc.ref.path,
      updatedAt: Date.now(),
    });

    console.log("✅ Registered:", cameraId, "→", clientId);
  }

  console.log("🎉 Camera registry created");
}

run();
