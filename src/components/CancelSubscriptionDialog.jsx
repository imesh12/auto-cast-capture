// src/components/CancelSubscriptionDialog.jsx
import React, { useState } from "react";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

export default function CancelSubscriptionDialog({
  open,
  onClose,
  camera,
  serverUrl,
  idToken,
  clientId,
  t,
  onCanceled,
}) {
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const authHeaders = () => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${idToken || ""}`,
  });

  const handleConfirmCancel = async () => {
  if (!camera?.id || !clientId) return;

  setLoading(true);

  const camRef = doc(db, "clients", clientId, "cameras", camera.id);

  try {
    // ✅ Optional: UI-only marker (safe)
    await updateDoc(camRef, {
      uiCancelState: "processing",   // UI hint only
      cancelRequestedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // ✅ Call server to cancel at period end
    const res = await fetch(`${serverUrl}/stripe/cancel-subscription`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        clientId,
        cameraId: camera.id,
        atPeriodEnd: true,
      }),
    });

    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch {}

    if (!res.ok) {
      // rollback ONLY UI marker
      await updateDoc(camRef, {
        uiCancelState: null,
        updatedAt: serverTimestamp(),
      });

      throw new Error(data?.error || data?.message || text || "Cancel failed");
    }

    // ✅ Server accepted. Do NOT force status here.
    // Webhook will set:
    // - cancelAtPeriodEnd=true
    // - status="Canceling"
    // - cancelEffectiveDate / nextBillingDate / daysRemaining
    await updateDoc(camRef, {
      uiCancelState: "requested",
      cancelConfirmedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    onCanceled?.();
    onClose?.();
  } catch (err) {
    alert(err?.message || "Cancel failed");
  } finally {
    setLoading(false);
  }
};


  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md p-5 border border-slate-200 dark:border-slate-800">
        <h3 className="text-lg font-semibold mb-2">
          {t("payment.cancelTitle") || "サブスクリプション解約"}
        </h3>

        <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
          {t("payment.cancelConfirm") || "本当に解約しますか？（次回請求日まで利用可能）"}
        </p>

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-3 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 text-sm"
          >
            {t("common.close") || "閉じる"}
          </button>

          <button
            onClick={handleConfirmCancel}
            disabled={loading}
            className="px-3 py-2 rounded-xl bg-red-600 text-white text-sm disabled:opacity-60"
          >
            {loading ? (t("common.processing") || "処理中…") : (t("payment.cancel") || "解約")}
          </button>
        </div>
      </div>
    </div>
  );
}
