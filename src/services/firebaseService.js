// src/services/firebaseService.js
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  updateDoc,
  getDoc,
  onSnapshot,
  query,
  where,
  increment,
} from "firebase/firestore";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";

/* ---------------------------------------------
   FIREBASE INIT
--------------------------------------------- */
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);

/* ---------------------------------------------
   1. LISTEN FOR CAMERAS (Admin dashboard)
--------------------------------------------- */
export function listenCamerasByClient(clientId, callback) {
  const ref = collection(db, "clients", clientId, "cameras");
  return onSnapshot(ref, (snapshot) => {
    const cams = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    callback(cams);
  });
}

/* ---------------------------------------------
   2. LOAD CAMERA CONFIG (for CapturePage)
--------------------------------------------- */
export async function getCameraConfig(cameraId) {
  const clientId = localStorage.getItem("clientId");
  if (!clientId) throw new Error("Missing clientId in storage");

  const ref = doc(db, "clients", clientId, "cameras", cameraId);
  const snap = await getDoc(ref);

  if (!snap.exists()) throw new Error("Camera not found");

  return { id: snap.id, ...snap.data() };
}

/* ---------------------------------------------
   3. UPLOAD TEMP MEDIA (preview before payment)
--------------------------------------------- */
export async function uploadTempMedia(cameraId, captureId, blob) {
 const uid = localStorage.getItem("uid"); // from Firebase Auth login
const path = `temp/${uid}/${cameraId}/${captureId}.mp4`;

  const fileRef = ref(storage, path);

  await uploadBytes(fileRef, blob);
  const url = await getDownloadURL(fileRef);

  return { path, url };
}

/* ---------------------------------------------
   4. DELETE TEMP MEDIA
--------------------------------------------- */
export async function deleteTempMedia(path) {
  try {
    const fileRef = ref(storage, path);
    await deleteObject(fileRef);
  } catch (e) {
    console.warn("deleteTempMedia skipped:", e.message);
  }
}

/* ---------------------------------------------
   5. INCREMENT CAMERA STATS
   total | paid | canceled
--------------------------------------------- */
export async function incrementCameraStats(cameraId, field) {
  const clientId = localStorage.getItem("clientId");
  const ref = doc(db, "clients", clientId, "cameras", cameraId);

  await updateDoc(ref, {
    [`${field}Captures`]: increment(1),
    lastCaptureAt: Date.now(),
  });
}

/* ---------------------------------------------
   6. LOG CAPTURE
--------------------------------------------- */
export async function logCapture(cameraId, captureId, data) {
  const clientId = localStorage.getItem("clientId");

  const ref = doc(
    db,
    "clients",
    clientId,
    "cameras",
    cameraId,
    "captures",
    captureId
  );

  await setDoc(ref, data, { merge: true });
}

/* ---------------------------------------------
   7. ADD NEW CAMERA (Admin)
--------------------------------------------- */
export async function addCamera(clientId, data) {
  const ref = doc(collection(db, "clients", clientId, "cameras"));
  await setDoc(ref, data);
  return ref.id;
}
