const admin = require("firebase-admin");
const path = require("path");

// Load the SAME service account as server.js
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

async function forceFix() {
  const db = admin.firestore();
  const snaps = await db.collectionGroup("cameras").get();

  console.log("Found cameras:", snaps.size);

  for (const doc of snaps.docs) {
    const id = doc.id;
    const data = doc.data();

    if (data.cameraId !== id) {
      await doc.ref.set({ cameraId: id }, { merge: true });
      console.log("✅ Fixed camera:", id);
    } else {
      console.log("✔ OK camera:", id);
    }
  }

  console.log("🎉 All cameras verified");
  process.exit(0);
}

forceFix().catch(err => {
  console.error("❌ Failed:", err);
  process.exit(1);
});
