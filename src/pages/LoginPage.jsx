// src/pages/LoginPage.jsx
import React, { useState } from "react";
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import { auth, db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Dialog } from "@headlessui/react";

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { clientId } = useParams(); // 🔐 tenant from URL

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // reset modal
  const [resetOpen, setResetOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  /* ===========================================================
     PASSWORD RESET (TENANT SAFE)
  =========================================================== */
  async function handleResetSubmit() {
    if (!email) {
      setError(t("enterEmail"));
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email, {
        url: `${window.location.origin}/${clientId}/login`,
      });

      setResetOpen(false);
      setToastMessage(t("resetSent"));
      setTimeout(() => setToastMessage(""), 3500);
    } catch (err) {
      setError(err.message);
    }
  }

  /* ===========================================================
     LOGIN (TENANT ENFORCED)
  =========================================================== */
  async function handleLogin(e) {
    e.preventDefault();
    if (!email || !password) return;

    setError("");
    setLoading(true);

    try {
      // 1) Firebase auth
      const userCred = await signInWithEmailAndPassword(auth, email, password);
      const user = userCred.user;

      // 2) Refresh token
      const token = await user.getIdToken(true);
      localStorage.setItem("idToken", token);

      // 3) Load Firestore user profile
      const snap = await getDoc(doc(db, "users", user.uid));
      if (!snap.exists()) throw new Error("Your account was not found.");

      const data = snap.data();
      if (!data.clientId) throw new Error("Invalid client session.");

      // 4) HARD tenant check
      if (clientId && data.clientId !== clientId) {
        throw new Error("Access denied for this tenant.");
      }

      // 5) Store clientId locally
      localStorage.setItem("clientId", data.clientId);

      // 6) 🔐 REDIRECT TO TENANT DASHBOARD (CRITICAL)
      navigate(`/${data.clientId}/dashboard`, { replace: true });

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  /* ===========================================================
     UI (UNCHANGED)
  =========================================================== */
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4 relative">
      <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-sm">

        <h1 className="text-2xl font-bold text-center text-gray-800 mb-6">
          {t("title")}
        </h1>

        {error && (
          <div className="bg-red-50 border border-red-300 text-red-700 p-3 rounded mb-4 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin}>
          <div>
            <label className="text-gray-700 font-medium text-sm">
              {t("email")}
            </label>
            <input
              autoFocus
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="border rounded w-full p-2 mt-1 mb-4 focus:ring-blue-500 focus:border-blue-500"
              placeholder={t("placeholderEmail")}
              required
            />
          </div>

          <div>
            <label className="text-gray-700 font-medium text-sm">
              {t("password")}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="border rounded w-full p-2 mt-1 mb-6 focus:ring-blue-500 focus:border-blue-500"
              placeholder={t("placeholderPassword")}
              required
            />
          </div>

          <button
            disabled={loading}
            className={`w-full py-2 rounded font-semibold text-white transition
              ${loading ? "bg-blue-400" : "bg-blue-600 hover:bg-blue-700"}`}
          >
            {loading ? t("signingIn") : t("login")}
          </button>

          <button
            type="button"
            onClick={() => setResetOpen(true)}
            className="mt-3 w-full text-blue-600 text-sm hover:underline"
          >
            {t("forgot")}
          </button>
        </form>

        <p className="text-xs text-gray-400 text-center mt-6">
          © {t("year", { year: new Date().getFullYear() })}
        </p>
      </div>

      {/* RESET MODAL */}
      <Dialog open={resetOpen} onClose={() => setResetOpen(false)} className="relative z-50">
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="bg-white rounded-lg p-6 max-w-sm w-full shadow-xl">
            <Dialog.Title className="text-lg font-bold mb-2">
              {t("forgot")}
            </Dialog.Title>

            <p className="text-sm mb-4">{t("enterEmail")}</p>

            <input
              type="email"
              className="border rounded w-full p-2 mb-4"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("placeholderEmail")}
            />

            <div className="flex justify-end gap-2">
              <button
                className="px-4 py-2 rounded bg-gray-100"
                onClick={() => setResetOpen(false)}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 rounded bg-blue-600 text-white"
                onClick={handleResetSubmit}
              >
                Send
              </button>
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>

      {/* TOAST */}
      {toastMessage && (
        <div className="absolute top-4 right-4 bg-green-600 text-white py-2 px-4 rounded shadow-lg animate-fadeIn">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
