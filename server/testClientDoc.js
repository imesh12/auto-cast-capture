require("dotenv").config({ path: require("path").join(__dirname, ".env") });
const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

(async () => {
  const db = admin.firestore();
  const clientId = "QsAQWBnydXVDgZw3bpgqQWMeP9g1";

  console.log("project_id:", serviceAccount.project_id);

  const doc = await db.collection("clients").doc(clientId).get();
  console.log("client exists?", doc.exists);

  process.exit(0);
})();
