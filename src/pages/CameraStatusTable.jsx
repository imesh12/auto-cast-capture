// src/pages/CameraStatusTable.jsx
import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";

/**
 * Production table for Camera subscription/payment status.
 * - Shows: badge (active / inactive / cancelling / cancel scheduled)
 * - Shows: Next billing OR Cancel effective date (with label)
 * - Shows: invoices count
 * - Actions: Activate / Cancel / Details
 *
 * Expected camera fields (Firestore):
 * - paymentStatus: "active" | "inactive" | "canceled" | ...
 * - status: "cancelling" | "Canceling" | ... (optional UI status)
 * - cancelAtPeriodEnd: boolean
 * - nextBillingDate: Firestore Timestamp or ms number or ISO string
 * - cancelEffectiveDate: Firestore Timestamp (optional)
 * - subscriptionId
 */
export default function CameraStatusTable({
  cameras = [],
  invoiceMap = {}, // { [cameraId]: invoices[] }
  onActivate,
  onCancel,
  onDetails,
  loadingId,
  successMsg,
  dashboardUrl = "/", // you can pass `/${clientId}/dashboard`
}) {
  const { t } = useTranslation();

  const cardBg =
    "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl";

  const toDate = (v) => {
    if (!v) return null;

    // Firestore Timestamp
    if (typeof v?.toDate === "function") return v.toDate();

    // Firestore Timestamp-like (seconds)
    if (typeof v?.seconds === "number") return new Date(v.seconds * 1000);

    // ms number
    if (typeof v === "number") return new Date(v);

    // ISO string
    if (typeof v === "string") {
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? null : d;
    }

    return null;
  };

  const formatJP = (v) => {
    const d = toDate(v);
    return d ? d.toLocaleDateString("ja-JP") : "-";
  };

  const isCancellingNow = (cam) => cam?.status === "cancelling";
  const isCancelScheduled = (cam) =>
    cam?.cancelAtPeriodEnd === true || cam?.status === "Canceling";

  const getBadge = (cam) => {
    if (isCancellingNow(cam)) {
      return {
        cls: "bg-yellow-100 text-yellow-800",
        label: t("payment.cancelling") || "解約処理中",
      };
    }

    if (isCancelScheduled(cam)) {
      return {
        cls: "bg-orange-100 text-orange-800",
        label: t("payment.canceling") || "解約予定",
      };
    }

    if (cam?.paymentStatus === "active") {
      return {
        cls: "bg-green-100 text-green-700",
        label: t("payment.active") || "有効",
      };
    }

    return {
      cls: "bg-red-100 text-red-700",
      label: t("payment.inactive") || "無効",
    };
  };

  const getDateLabel = (cam) => {
    if (isCancellingNow(cam)) return t("payment.cancellingNow") || "解約処理中";
    if (isCancelScheduled(cam)) return t("payment.cancelEffectiveDate") || "解約予定日";
    return t("payment.nextBilling") || "次回請求日";
  };

  const getDateValue = (cam) => {
    if (isCancelScheduled(cam)) {
      return formatJP(cam?.cancelEffectiveDate || cam?.nextBillingDate);
    }
    return formatJP(cam?.nextBillingDate);
  };

  const rows = useMemo(() => {
    return cameras.map((cam) => {
      const invoices = invoiceMap?.[cam.id] || [];
      const badge = getBadge(cam);

      // Decide which primary action should appear
      const showActivate =
        !cam?.paymentStatus ||
        cam.paymentStatus === "inactive" ||
        cam.paymentStatus === "canceled";

      const disableActions = loadingId === cam.id;

      return {
        cam,
        invoicesCount: invoices.length,
        badge,
        showActivate,
        disableActions,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameras, invoiceMap, loadingId, t]);

  return (
    <div className={`${cardBg} p-4 overflow-x-auto`}>
      {/* HEADER */}
      <div className="flex items-center gap-3 mb-4">
        <h3 className="text-lg font-semibold flex-1">
          {t("payment.cameraStatus") || "カメラ課金ステータス"}
        </h3>

        {successMsg && (
          <button
            onClick={() => (window.location.href = dashboardUrl)}
            className="px-3 py-2 bg-green-600 text-white rounded-xl text-sm"
          >
            {t("payment.goDashboard") || "ダッシュボードへ"}
          </button>
        )}
      </div>

      <table className="min-w-full text-sm">
        <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
          <tr>
            <th className="text-left py-2 pr-3">{t("payment.camera") || "カメラ"}</th>
            <th className="text-left py-2 pr-3">{t("payment.status") || "状態"}</th>
            <th className="text-left py-2 pr-3">
              {t("payment.billingOrCancelDate") || "次回請求日 / 解約予定日"}
            </th>
            <th className="text-left py-2 pr-3">{t("payment.subId") || "サブスクID"}</th>
            <th className="text-left py-2 pr-3">{t("payment.invoices") || "請求書"}</th>
            <th className="text-left py-2 pr-3">{t("common.actions") || "操作"}</th>
          </tr>
        </thead>

        <tbody>
          {rows.map(({ cam, invoicesCount, badge, showActivate, disableActions }) => (
            <tr
              key={cam.id}
              className="border-b last:border-b-0 border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60"
            >
              {/* Camera */}
              <td className="py-3 pr-3">
                <div className="flex flex-col">
                  <span className="font-medium">{cam.name || "-"}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    ID: {cam.id}
                  </span>
                </div>
              </td>

              {/* Status */}
              <td className="py-3 pr-3">
                <span className={`px-2 py-1 rounded-full text-xs ${badge.cls}`}>
                  {badge.label}
                </span>
              </td>

              {/* Next billing / cancel date */}
              <td className="py-3 pr-3">
                <div className="leading-tight">
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {getDateLabel(cam)}
                  </div>
                  <div className="font-medium">{getDateValue(cam)}</div>
                </div>
              </td>

              {/* Subscription id */}
              <td className="py-3 pr-3 text-xs">{cam.subscriptionId || "-"}</td>

              {/* Invoices */}
              <td className="py-3 pr-3 text-xs">
                <span className="mr-2">
                  {t("payment.invoiceCount") || "件数"}: {invoicesCount}
                </span>
                <button
                  className="px-2 py-1 bg-slate-200 dark:bg-slate-700 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded-lg"
                  onClick={() => onDetails?.(cam)}
                >
                  {t("payment.details") || "詳細"}
                </button>
              </td>

              {/* Actions */}
              <td className="py-3 pr-3 text-xs">
                <div className="flex gap-1">
                  {showActivate ? (
                    <button
                      onClick={() => onActivate?.(cam)}
                      disabled={disableActions}
                      className="px-2 py-1 rounded-lg bg-blue-600 text-white disabled:opacity-60"
                    >
                      {t("payment.activate") || "有効化"}
                    </button>
                  ) : (
                    <button
                      onClick={() => onCancel?.(cam)}
                      disabled={disableActions || isCancelScheduled(cam) || isCancellingNow(cam)}
                      className="px-2 py-1 rounded-lg bg-red-600 text-white disabled:opacity-40"
                      title={
                        isCancellingNow(cam)
                          ? "解約処理中"
                          : isCancelScheduled(cam)
                          ? "解約予定のため操作できません"
                          : ""
                      }
                    >
                      {t("payment.cancel") || "解約"}
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}

          {cameras.length === 0 && (
            <tr>
              <td
                colSpan={6}
                className="py-6 text-center text-slate-500 dark:text-slate-400 text-sm"
              >
                {t("payment.noCameras") || "カメラがありません"}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
