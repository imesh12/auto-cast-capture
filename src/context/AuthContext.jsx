// src/context/AuthContext.jsx
import { createContext, useContext, useState, useEffect } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [clientId, setClientId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mappingError, setMappingError] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          // refresh token always!
          const token = await firebaseUser.getIdToken(true);
          localStorage.setItem("idToken", token);

          // load clientId
          const snap = await getDoc(doc(db, "users", firebaseUser.uid));
          if (!snap.exists()) {
            setMappingError(
              `Your account is missing a clientId mapping (users/${firebaseUser.uid}).`
            );
            setUser(firebaseUser);
            setClientId(null);
          } else {
            const data = snap.data();
            if (!data.clientId) {
              setMappingError(
                `Document users/${firebaseUser.uid} has no field "clientId".`
              );
              setUser(firebaseUser);
              setClientId(null);
            } else {
              setMappingError(null);
              setUser(firebaseUser);
              setClientId(data.clientId);
              localStorage.setItem("clientId", data.clientId);
            }
          }
        } else {
          setUser(null);
          setClientId(null);
          setMappingError(null);
          localStorage.removeItem("idToken");
          localStorage.removeItem("clientId");
        }
      } catch (err) {
        console.error("AuthContext error:", err);
        setMappingError(`Failed to load mapping: ${err.message}`);
      } finally {
        setLoading(false);
      }
    });

    return unsub;
  }, []);

  const logout = () => {
    localStorage.removeItem("idToken");
    localStorage.removeItem("clientId");
    signOut(auth);
  };

  const value = { user, clientId, logout, mappingError };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="px-4 py-3 rounded-xl bg-white shadow">
          Loading…
        </div>
      </div>
    );
  }

  if (user && mappingError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="max-w-md bg-white rounded-2xl shadow p-6 space-y-4">
          <h1 className="text-lg font-semibold text-red-600">Configuration error</h1>
          <p className="text-sm text-slate-700 whitespace-pre-line">
            {mappingError}
          </p>
          <button
            className="mt-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm"
            onClick={logout}
          >
            Log out
          </button>
        </div>
      </div>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
