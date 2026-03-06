// src/pages/ResetPasswordPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
import { auth, db } from "../firebase";
import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

/**
 * ✅ Works with BOTH:
 * 1) /resetPassword?oobCode=...
 * 2) #/resetPassword?oobCode=...  (GitHub Pages + HashRouter)
 */
function getParam(name) {
  // normal query string
  const fromSearch = new URLSearchParams(window.location.search).get(name);
  if (fromSearch) return fromSearch;

  // hash query string (after "#/route?...")
  const hash = window.location.hash || "";
  const q = hash.includes("?") ? hash.split("?")[1] : "";
  return new URLSearchParams(q).get(name);
}

export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const nav = useNavigate();

  const oobCode = useMemo(() => getParam("oobCode"), []);

  const [validCode, setValidCode] = useState(false);
  const [checking, setChecking] = useState(true);
  const [emailFromCode, setEmailFromCode] = useState("");

  const [newPass, setNewPass] = useState("");
  const [newPass2, setNewPass2] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  // STEP 1: verify code + get email
  useEffect(() => {
    let alive = true;

    async function checkCode() {
      try {
        setError("");

        if (!oobCode) {
          if (!alive) return;
          setValidCode(false);
          setError(t("invalidLink"));
          return;
        }

        const email = await verifyPasswordResetCode(auth, oobCode);

        if (!alive) return;
        setEmailFromCode(email);
        setValidCode(true);
      } catch (err) {
        if (!alive) return;
        setValidCode(false);
        setError(t("invalidLink"));
      } finally {
        if (!alive) return;
        setChecking(false);
      }
    }

    checkCode();
    return () => {
      alive = false;
    };
  }, [oobCode, t]);

  async function handleSubmit(e) {
    e.preventDefault();

    setError("");

    if (!newPass || newPass.length < 6) {
      setError(t("passwordMin") || "Password must be at least 6 characters.");
      return;
    }
    if (newPass !== newPass2) {
      setError(t("passwordNotMatch"));
      return;
    }
    if (!oobCode) {
      setError(t("invalidLink"));
      return;
    }

    setSubmitting(true);

    try {
      await confirmPasswordReset(auth, oobCode, newPass);
      setToast(t("passwordUpdated"));

      // STEP 2: lookup Firestore user by email => redirect to tenant login
      setTimeout(async () => {
        try {
          const q = query(
            collection(db, "users"),
            where("email", "==", emailFromCode),
            limit(1)
          );
          const snap = await getDocs(q);

          if (!snap.empty) {
            const data = snap.docs[0].data() || {};
            const clientId = data.clientId;

            if (clientId) {
              // ✅ HashRouter: navigate("/xxx/login") becomes /#/xxx/login automatically
              nav(`/${clientId}/login`, { replace: true });
              return;
            }
          }

          nav("/login", { replace: true });
        } catch {
          nav("/login", { replace: true });
        }
      }, 1200);
    } catch (err) {
      setError(err?.message || t("resetFailed") || "Failed to reset password.");
    } finally {
      setSubmitting(false);
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
      <div className="h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white border rounded-xl p-6 shadow">
          <div className="text-red-600 font-semibold">{t("invalidLink")}</div>
          <div className="text-sm text-gray-600 mt-2">
            {error || t("invalidLink")}
          </div>
          <button
            onClick={() => nav("/login", { replace: true })}
            className="mt-4 w-full py-2 rounded font-semibold bg-blue-600 text-white hover:bg-blue-700"
          >
            {t("backToLogin") || "Back to login"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4 relative">
      <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center mb-2">
          {t("resetTitle")}
        </h1>

        {emailFromCode && (
          <div className="text-xs text-gray-500 text-center mb-6 break-all">
            {emailFromCode}
          </div>
        )}

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
            onChange={(e) => setNewPass(e.target.value)}
            className="border rounded w-full p-2 mb-4"
            required
            minLength={6}
            autoComplete="new-password"
          />

          <label className="block text-sm font-medium mb-1">
            {t("confirmPassword")}
          </label>
          <input
            type="password"
            value={newPass2}
            onChange={(e) => setNewPass2(e.target.value)}
            className="border rounded w-full p-2 mb-6"
            required
            minLength={6}
            autoComplete="new-password"
          />

          <button
            disabled={submitting}
            className={`w-full py-2 rounded font-semibold text-white transition
              ${submitting ? "bg-blue-400" : "bg-blue-600 hover:bg-blue-700"}`}
          >
            {submitting ? t("saving") || "Saving..." : t("savePassword")}
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