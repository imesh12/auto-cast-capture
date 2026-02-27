import React, { useEffect, useMemo, useRef, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { QRCodeCanvas } from "qrcode.react";

/**
 * ⚠️ 注意
 * スマホでQRを読むなら localhost は使えません。
 * PCのLAN IP or 本番ドメインを入れてください。
 */
function getPublicBaseUrl() {
  return "http://192.168.1.183:4450"; // capture(Express)側
}

// ✅ Move icon OUTSIDE component (stable component identity)
function DownloadIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3v10m0 0 4-4m-4 4-4-4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 17v3h16v-3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function QRCodesPage() {
  const { clientId } = useAuth();

  const [cameras, setCameras] = useState([]);
  const [filter, setFilter] = useState("active"); // active | all
  const [error, setError] = useState("");

  // ✅ Keep refs to each QR container (cameraId -> element)
  const qrContainerRefs = useRef(new Map());

  useEffect(() => {
    setError("");
    if (!clientId) return;

    const ref = collection(db, "clients", clientId, "cameras");
    return onSnapshot(
      ref,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setCameras(list);
      },
      (e) => {
        console.error("QR page error:", e);
        setError("カメラ一覧の取得に失敗しました");
      }
    );
  }, [clientId]);

  const baseUrl = getPublicBaseUrl();

  const visible = useMemo(() => {
    if (filter === "all") return cameras;
    return cameras.filter((c) => c.paymentStatus === "active");
  }, [cameras, filter]);

  // ✅ Safe download: find canvas inside the stored container ref
  const downloadQrPng = (cameraId, cameraName = "camera") => {
    try {
      const container = qrContainerRefs.current.get(cameraId);
      const canvas = container?.querySelector("canvas");

      if (!canvas) throw new Error("QR canvas not found");

      const pngUrl = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = pngUrl;

      const safeName = String(cameraName).replace(/[\\/:*?"<>|]/g, "_");
      a.download = `TownCapture_QR_${safeName}_${cameraId}.png`;

      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      console.error(e);
      alert("QRコードのダウンロードに失敗しました");
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">QRコード管理</h3>
          <div className="text-xs text-slate-500 mt-1 break-all">
            ベースURL：{baseUrl}
          </div>
          <div className="text-xs text-slate-500 mt-1 break-all">
            クライアントID：{clientId || "-"}
          </div>
        </div>

        <select
          className="text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 py-2"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="active">有効なカメラのみ</option>
          <option value="all">すべてのカメラ</option>
        </select>
      </div>

      {error && (
        <div className="mt-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm border border-red-200">
          {error}
        </div>
      )}

      {!clientId && (
        <div className="mt-4 text-sm text-red-600">
          クライアントIDが取得できません。再ログインしてください。
        </div>
      )}

      {clientId && visible.length === 0 && !error && (
        <div className="mt-6 text-sm text-slate-500">
          表示するカメラがありません。
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        {visible.map((cam) => {
          const isActive = cam.paymentStatus === "active";

          const captureUrl = `${baseUrl}/capture/?cameraId=${encodeURIComponent(
            cam.id
          )}`;

          return (
            <div
              key={cam.id}
              className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">{cam.name || "カメラ"}</div>
                  <div className="text-xs text-slate-500 break-all">
                    カメラID：{cam.id}
                  </div>
                </div>

                <span
                  className={`px-2 py-1 rounded-full text-xs ${
                    isActive
                      ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200"
                      : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200"
                  }`}
                >
                  {isActive ? "有効" : "無効"}
                </span>
              </div>

              <div className="mt-3 relative">
                <div className="flex items-center justify-center bg-slate-50 dark:bg-slate-800 rounded-2xl p-4">
                  <div
                    className={`bg-white p-3 rounded-xl ${
                      isActive ? "" : "blur-sm"
                    }`}
                    // ✅ store container ref for this cam.id
                    ref={(el) => {
                      if (el) qrContainerRefs.current.set(cam.id, el);
                      else qrContainerRefs.current.delete(cam.id);
                    }}
                  >
                    <QRCodeCanvas value={captureUrl} size={230} level="M" />
                  </div>
                </div>

                {!isActive && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="px-3 py-2 rounded-xl text-sm font-semibold bg-white/90 dark:bg-slate-950/80 border">
                      お支払いが無効です
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-3 text-xs text-slate-600 dark:text-slate-300 break-all">
                {captureUrl}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className={`px-3 py-2 rounded-xl text-sm ${
                    isActive
                      ? "bg-blue-600 text-white"
                      : "bg-slate-200 text-slate-400 cursor-not-allowed"
                  }`}
                  disabled={!isActive}
                  onClick={() => navigator.clipboard.writeText(captureUrl)}
                >
                  URLをコピー
                </button>

                <a
                  className={`px-3 py-2 rounded-xl text-sm ${
                    isActive
                      ? "bg-slate-200 dark:bg-slate-800"
                      : "bg-slate-200 text-slate-400 pointer-events-none"
                  }`}
                  href={isActive ? captureUrl : undefined}
                  target="_blank"
                  rel="noreferrer"
                >
                  開く
                </a>

                {isActive && (
                  <button
                    type="button"
                    className="px-3 py-2 rounded-xl text-sm bg-emerald-600 text-white flex items-center gap-2"
                    onClick={() => downloadQrPng(cam.id, cam.name)}
                  >
                    <DownloadIcon />
                    QRをダウンロード
                  </button>
                )}
              </div>

              <div className="mt-2 text-xs text-slate-500">
                ※ スマホで読み取る場合は localhost は使えません
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}