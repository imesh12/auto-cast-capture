import { initializeApp } from "firebase/app";
import { getFirestore, setDoc, doc } from "firebase/firestore";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCwoCcI0qoMI72UKbVbAMSHp8UxHLuM960",
  authDomain: "towncapture-25aa5.firebaseapp.com",
  projectId: "towncapture-25aa5",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

async function createUser(email, password, clientId) {
  const user = await createUserWithEmailAndPassword(auth, email, password);
  await setDoc(doc(db, "users", user.user.uid), { clientId });
  console.log("Created:", email, "→", clientId);
}

(async () => {
  await createUser("client1@test.com", "cw12345", "client_001");
  await createUser("client2@test.com", "cw1245", "client_002");
  console.log("DONE ✔");
})();
