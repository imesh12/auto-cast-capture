// src/pages/ResetPasswordPage.jsx
import React, { useEffect, useState } from "react";
import {
  confirmPasswordReset,
  verifyPasswordResetCode,
} from "firebase/auth";
import { auth, db } from "../firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const nav = useNavigate();

  const search = new URLSearchParams(window.location.search);
  const oobCode = search.get("oobCode");

  const [validCode, setValidCode] = useState(false);
  const [checking, setChecking] = useState(true);
  const [emailFromCode, setEmailFromCode] = useState("");

  const [newPass, setNewPass] = useState("");
  const [newPass2, setNewPass2] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  // STEP 1: verify code + get email
  useEffect(() => {
    async function checkCode() {
      try {
        const email = await verifyPasswordResetCode(auth, oobCode);
        setEmailFromCode(email);
        setValidCode(true);
      } catch (err) {
        setError(t("invalidLink"));
      }
      setChecking(false);
    }
    checkCode();
  }, [oobCode]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (newPass !== newPass2) {
      setError(t("passwordNotMatch"));
      return;
    }
    try {
      await confirmPasswordReset(auth, oobCode, newPass);
      setToast(t("passwordUpdated"));

      // STEP 2: lookup Firestore user by email
      setTimeout(async () => {
        try {
          const q = query(
            collection(db, "users"),
            where("email", "==", emailFromCode)
          );
          const snap = await getDocs(q);

          if (!snap.empty) {
            const data = snap.docs[0].data();
            const clientId = data.clientId;
            nav(`/${clientId}/login`);
          } else {
            nav("/login");
          }
        } catch {
          nav("/login");
        }
      }, 1500);

    } catch (err) {
      setError(err.message);
    }
  }

  if (checking) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-gray-600">{t("checking")}</div>
      </div>
    );
  }

  if (!validCode) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-red-600">{error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4 relative">
      <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-sm">

        <h1 className="text-2xl font-bold text-center mb-6">
          {t("resetTitle")}
        </h1>

        {error && (
          <div className="bg-red-50 border border-red-300 text-red-700 p-3 rounded mb-4 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <label className="block text-sm font-medium mb-1">
            {t("newPassword")}
          </label>
          <input
            type="password"
            value={newPass}
            onChange={e => setNewPass(e.target.value)}
            className="border rounded w-full p-2 mb-4"
            required
          />

          <label className="block text-sm font-medium mb-1">
            {t("confirmPassword")}
          </label>
          <input
            type="password"
            value={newPass2}
            onChange={e => setNewPass2(e.target.value)}
            className="border rounded w-full p-2 mb-6"
            required
          />

          <button
            className="w-full py-2 rounded font-semibold bg-blue-600 text-white hover:bg-blue-700"
          >
            {t("savePassword")}
          </button>
        </form>
      </div>

      {toast && (
        <div className="absolute top-4 right-4 bg-green-600 text-white py-2 px-4 rounded shadow-lg animate-fadeIn">
          {toast}
        </div>
      )}
    </div>
  );
}
