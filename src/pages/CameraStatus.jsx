// src/pages/CameraStatus.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import CancelSubscriptionDialog from "../components/CancelSubscriptionDialog";

import { db } from "../firebase";
import { collection, onSnapshot } from "firebase/firestore";
import { useAuth } from "../context/AuthContext";

/**
 * PRODUCTION NOTES
 * - Reads cameras + invoices in realtime (tenant-safe path).
 * - Robust status mapping:
 *    - uiCancelState: "processing" (client-side hint only)
 *    - status: "Active" | "Canceling" | "Inactive" (server/webhook truth)
 * - Date fallback:
 *    - Shows cam.nextBillingDate
 *    - else cam.cancelEffectiveDate
 *    - else latest invoice.periodEnd
 *    - else latest invoice.createdAt
 *    - else "-"
 * - Invoice sort is now done in frontend to avoid Firestore orderBy issues
 *   when some invoice docs have missing/null createdAt.
 */

export default function CameraStatus() {
  const { clientId } = useAuth();
  const { t } = useTranslation();

  const [cameras, setCameras] = useState([]);
  const [invoiceMap, setInvoiceMap] = useState({}); // { [camId]: invoices[] }
  const [invoiceLoadingMap, setInvoiceLoadingMap] = useState({}); // { [camId]: boolean }

  const [expandedId, setExpandedId] = useState(null);
  const [loadingId, setLoadingId] = useState(null);
  const [success, setSuccess] = useState(false);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelCam, setCancelCam] = useState(null);

  const serverUrl =
    process.env.REACT_APP_API_BASE_URL ||
    "https://town-capture-api-822639495360.asia-northeast1.run.app";

  const idToken = localStorage.getItem("idToken") || "";

  /* ===============================
     1) Stripe success redirect
  =============================== */
  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    if (qs.get("success")) setSuccess(true);
  }, []);

  /* ===============================
     Helpers
  =============================== */
  const authHeaders = () => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${localStorage.getItem("idToken") || ""}`,
  });

  const toDate = (v) => {
    if (!v) return null;
    if (typeof v?.toDate === "function") return v.toDate(); // Firestore Timestamp
    if (typeof v?.seconds === "number") return new Date(v.seconds * 1000); // Timestamp-like
    if (typeof v === "number") return new Date(v); // ms
    if (typeof v === "string") {
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    return null;
  };

  const toMillis = (v) => {
    const d = toDate(v);
    return d ? d.getTime() : 0;
  };

  const formatJP = (v) => {
    const d = toDate(v);
    return d ? d.toLocaleDateString("ja-JP") : "-";
  };

  const sortInvoicesNewestFirst = (list) => {
    return [...list].sort((a, b) => {
      const ta =
        toMillis(a.createdAt) ||
        toMillis(a.paidAt) ||
        toMillis(a.periodEnd) ||
        0;

      const tb =
        toMillis(b.createdAt) ||
        toMillis(b.paidAt) ||
        toMillis(b.periodEnd) ||
        0;

      return tb - ta;
    });
  };

  // UI-only "processing" state
  const isCancellingNow = (cam) => cam?.uiCancelState === "processing";

  // Server truth for scheduled cancel
  const isCancelScheduled = (cam) =>
    cam?.cancelAtPeriodEnd === true || cam?.status === "Canceling";

  const isActive = (cam) => cam?.paymentStatus === "active";

  const getBadge = (cam) => {
    if (isCancellingNow(cam)) {
      return { cls: "bg-yellow-100 text-yellow-800", label: "解約処理中" };
    }
    if (isCancelScheduled(cam)) {
      return { cls: "bg-orange-100 text-orange-800", label: "解約予定" };
    }
    if (isActive(cam)) {
      return { cls: "bg-green-100 text-green-700", label: "有効" };
    }
    return { cls: "bg-red-100 text-red-700", label: "無効" };
  };

  const getDateLabel = (cam) => {
    if (isCancellingNow(cam)) return "解約処理中";
    if (isCancelScheduled(cam)) return "解約予定日";
    return "次回請求日";
  };

  const getDateValue = (cam, invoices) => {
    const latestInv = invoices?.[0] || null;
    const invoiceFallback = latestInv?.periodEnd || latestInv?.createdAt || null;

    if (isCancelScheduled(cam)) {
      return formatJP(
        cam?.cancelEffectiveDate || cam?.nextBillingDate || invoiceFallback
      );
    }

    return formatJP(cam?.nextBillingDate || invoiceFallback);
  };

  /* ===============================
     2) Live camera list (tenant safe)
  =============================== */
  useEffect(() => {
    if (!clientId) return;

    const ref = collection(db, "clients", clientId, "cameras");
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setCameras(list);
      },
      (err) => console.error("Camera onSnapshot error:", err)
    );

    return () => unsub();
  }, [clientId]);

  /* ===============================
     3) Live invoices per camera
     - One onSnapshot per camera
     - Cleans up removed cameras
     - No Firestore orderBy
     - Sort in frontend
  =============================== */
  const invoiceUnsubsRef = useRef({}); // { [camId]: unsubscribeFn }

  useEffect(() => {
    if (!clientId) return;

    const currentCamIds = new Set(cameras.map((c) => c.id));
    const existing = invoiceUnsubsRef.current;

    // cleanup removed cameras
    Object.keys(existing).forEach((camId) => {
      if (!currentCamIds.has(camId)) {
        try {
          existing[camId]?.();
        } catch {}
        delete existing[camId];

        setInvoiceMap((prev) => {
          const next = { ...prev };
          delete next[camId];
          return next;
        });

        setInvoiceLoadingMap((prev) => {
          const next = { ...prev };
          delete next[camId];
          return next;
        });
      }
    });

    // add snapshots for new cameras
    cameras.forEach((cam) => {
      if (existing[cam.id]) return;

      const invRef = collection(db, "clients", clientId, "cameras", cam.id, "invoices");

      setInvoiceLoadingMap((prev) => ({ ...prev, [cam.id]: true }));

      existing[cam.id] = onSnapshot(
        invRef,
        (snapInv) => {
          const invoices = sortInvoicesNewestFirst(
            snapInv.docs.map((d) => ({ id: d.id, ...d.data() }))
          );

          setInvoiceMap((prev) => ({ ...prev, [cam.id]: invoices }));
          setInvoiceLoadingMap((prev) => ({ ...prev, [cam.id]: false }));
        },
        (err) => {
          console.error("Invoice onSnapshot error:", err);
          setInvoiceMap((prev) => ({ ...prev, [cam.id]: [] }));
          setInvoiceLoadingMap((prev) => ({ ...prev, [cam.id]: false }));
        }
      );
    });

    return () => {
      // cleanup handled by unmount effect below
    };
  }, [clientId, cameras]);

  useEffect(() => {
    return () => {
      const existing = invoiceUnsubsRef.current;
      Object.keys(existing).forEach((camId) => {
        try {
          existing[camId]?.();
        } catch {}
      });
      invoiceUnsubsRef.current = {};
    };
  }, []);

  /* ===============================
     Actions
  =============================== */
  const handleActivate = async (cameraId, priceId) => {
    if (!clientId) return;
    setLoadingId(cameraId);

    try {
      const res = await fetch(`${serverUrl}/stripe/create-checkout-session`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ cameraId, priceId, clientId }),
      });

      const text = await res.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }

      if (!res.ok) throw new Error(data?.error || data?.message || text || "Checkout failed");
      if (!data?.url) throw new Error("Checkout URL missing from server response");

      window.location.href = data.url;
    } catch (err) {
      alert(err.message);
    } finally {
      setLoadingId(null);
    }
  };

  const handleDownloadInvoice = async (cameraId, invoiceId) => {
    if (!clientId) return;

    try {
      const res = await fetch(`${serverUrl}/stripe/invoice-pdf-url`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ cameraId, invoiceId, clientId }),
      });

      const text = await res.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }

      if (!res.ok) throw new Error(data?.error || data?.message || text || "Download failed");
      if (!data?.url) throw new Error("Invoice URL missing from server response");

      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      alert(err.message);
    }
  };

  /* ===============================
     UI
  =============================== */
  const cardBg =
    "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl";

  const tableDateHeader = useMemo(() => "次回請求日 / 解約予定日", []);

  return (
    <div className={`${cardBg} p-4 overflow-x-auto`}>
      <div className="flex items-center gap-3 mb-4">
        <h3 className="text-lg font-semibold flex-1">
          {t("payment.cameraStatus") || "カメラ課金ステータス"}
        </h3>

        {success && (
          <button
            onClick={() => (window.location.href = `/${clientId}/dashboard`)}
            className="px-3 py-2 bg-green-600 text-white rounded-xl text-sm"
          >
            {t("payment.goDashboard") || "ダッシュボードへ"}
          </button>
        )}
      </div>

      <table className="min-w-full text-sm">
        <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
          <tr>
            <th className="py-2 text-left">カメラ</th>
            <th className="py-2 text-left">状態</th>
            <th className="py-2 text-left">{tableDateHeader}</th>
            <th className="py-2 text-left">サブスクID</th>
            <th className="py-2 text-left">請求書</th>
            <th className="py-2 text-left">操作</th>
          </tr>
        </thead>

        <tbody>
          {cameras.map((cam) => {
            const invoices = invoiceMap?.[cam.id] || [];
            const invoiceLoading = !!invoiceLoadingMap?.[cam.id];
            const badge = getBadge(cam);
            const canceling = isCancellingNow(cam) || isCancelScheduled(cam);

            return (
              <React.Fragment key={cam.id}>
                <tr className="border-b last:border-b-0 border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60">
                  <td className="py-3">
                    <div className="flex flex-col">
                      <span className="font-medium">{cam.name || "-"}</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        ID: {cam.id}
                      </span>
                    </div>
                  </td>

                  <td className="py-3">
                    <span className={`px-2 py-1 rounded-full text-xs ${badge.cls}`}>
                      {badge.label}
                    </span>
                  </td>

                  <td className="py-3">
                    <div className="leading-tight">
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {getDateLabel(cam)}
                      </div>
                      <div className="font-medium">
                        {invoiceLoading && !cam?.nextBillingDate
                          ? "読込中..."
                          : getDateValue(cam, invoices)}
                      </div>
                    </div>
                  </td>

                  <td className="py-3 text-xs">{cam.subscriptionId || "-"}</td>

                  <td className="py-3 text-xs">
                    {invoiceLoading ? "読込中..." : `${invoices.length} 件`}
                  </td>

                  <td className="py-3">
                    <div className="flex gap-1 text-xs">
                      {!isActive(cam) && (
                        <button
                          onClick={() => handleActivate(cam.id, cam.priceId)}
                          disabled={loadingId === cam.id}
                          className="px-2 py-1 bg-blue-600 text-white rounded-lg disabled:opacity-60"
                        >
                          有効化
                        </button>
                      )}

                      {isActive(cam) && !canceling && (
                        <button
                          onClick={() => {
                            setCancelCam(cam);
                            setCancelOpen(true);
                          }}
                          disabled={loadingId === cam.id}
                          className="px-2 py-1 bg-red-600 text-white rounded-lg disabled:opacity-60"
                        >
                          解約
                        </button>
                      )}

                      <button
                        className="px-2 py-1 bg-slate-200 dark:bg-slate-800 rounded-lg"
                        onClick={() => setExpandedId(expandedId === cam.id ? null : cam.id)}
                      >
                        詳細
                      </button>
                    </div>
                  </td>
                </tr>

                {expandedId === cam.id && (
                  <tr>
                    <td colSpan={6} className="bg-slate-50 dark:bg-slate-800/40 p-3">
                      {invoiceLoading ? (
                        <div className="text-xs text-slate-500">請求書を読込中...</div>
                      ) : invoices.length === 0 ? (
                        <div className="text-xs text-slate-500">請求書はありません</div>
                      ) : (
                        <div className="space-y-2">
                          {invoices.map((inv) => (
                            <div
                              key={inv.id}
                              className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-2 text-xs"
                            >
                              <div className="min-w-0">
                                <div className="font-medium truncate">
                                  請求書ID: {inv.invoiceId || inv.id}
                                </div>
                                <div className="text-slate-500 dark:text-slate-400">
                                  支払日: {formatJP(inv.paidAt || inv.createdAt)} / 金額: ¥
                                  {Number(inv.amountPaid || inv.amountDue || 0).toLocaleString()}
                                  {inv.periodEnd ? ` / 対象: 〜${formatJP(inv.periodEnd)}` : ""}
                                </div>
                              </div>

                              <button
                                onClick={() => handleDownloadInvoice(cam.id, inv.invoiceId || inv.id)}
                                className="ml-3 px-2 py-1 rounded-lg bg-blue-600 text-white"
                              >
                                PDF
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}

          {cameras.length === 0 && (
            <tr>
              <td
                colSpan={6}
                className="py-6 text-center text-slate-500 dark:text-slate-400 text-sm"
              >
                カメラがありません
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <CancelSubscriptionDialog
        open={cancelOpen}
        onClose={() => {
          setCancelOpen(false);
          setCancelCam(null);
        }}
        camera={cancelCam}
        serverUrl={serverUrl}
        idToken={idToken}
        clientId={clientId}
        t={t}
        onCanceled={() => {}}
      />
    </div>
  );
}