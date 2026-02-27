// src/pages/SuccessPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

function isLikelyImage(url) {
  if (!url) return false;
  const clean = url.split("?")[0].toLowerCase();
  return (
    clean.endsWith(".jpg") ||
    clean.endsWith(".jpeg") ||
    clean.endsWith(".png") ||
    clean.endsWith(".webp") ||
    clean.endsWith(".gif") ||
    clean.endsWith(".bmp")
  );
}

function isLikelyVideo(url) {
  if (!url) return false;
  const clean = url.split("?")[0].toLowerCase();
  return (
    clean.endsWith(".mp4") ||
    clean.endsWith(".webm") ||
    clean.endsWith(".mov") ||
    clean.endsWith(".m4v") ||
    clean.endsWith(".ogg")
  );
}

function humanBytes(bytes) {
  if (bytes === null || bytes === undefined) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

function guessFilename(url) {
  if (!url) return "—";
  try {
    const clean = url.split("?")[0];
    const last = clean.split("/").pop() || "";
    return decodeURIComponent(last) || "—";
  } catch {
    return "—";
  }
}

export default function SuccessPage() {
  // ✅ hooks MUST be inside component
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const sessionId = params.get("sessionId");

  const API_BASE = useMemo(() => {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") return "http://192.168.1.183:4450";
    return `http://${host}:4450`;
  }, []);

  const [status, setStatus] = useState("checking"); // checking | paid | failed
  const [phase, setPhase] = useState("pending");

  const [previewUrl, setPreviewUrl] = useState(null);
  const [captureSessionId, setCaptureSessionId] = useState(null);

  // ✅ token from stripeRoutes.js (downloadTokens)
  const [downloadToken, setDownloadToken] = useState(null);

  // optional from backend
  const [fileName, setFileName] = useState(null);
  const [sizeBytes, setSizeBytes] = useState(null);
  const [modeLabel, setModeLabel] = useState("写真");
  const [overlayLabel, setOverlayLabel] = useState("無");

  const [error, setError] = useState(null);
  const [downloading, setDownloading] = useState(false);

  const previewUrlNoCache = useMemo(() => {
    if (!previewUrl) return null;
    const join = previewUrl.includes("?") ? "&" : "?";
    return `${previewUrl}${join}t=${Date.now()}`;
  }, [previewUrl]);

  const kind = useMemo(() => {
    if (!previewUrlNoCache) return null;
    if (isLikelyImage(previewUrlNoCache)) return "image";
    if (isLikelyVideo(previewUrlNoCache)) return "video";
    return "unknown";
  }, [previewUrlNoCache]);

  useEffect(() => {
    if (!sessionId) {
      setError("Missing sessionId");
      setStatus("failed");
      return;
    }

    let cancelled = false;
    let timer = null;

    const poll = async () => {
      try {
        const res = await fetch(
          `${API_BASE}/public/payment-status?sessionId=${encodeURIComponent(sessionId)}`,
          { cache: "no-store" }
        );
        const data = await res.json();
        if (cancelled) return;

        if (!res.ok || data?.ok === false) {
          throw new Error(data?.error || `HTTP ${res.status}`);
        }

        setPhase(data.phase || "pending");
        setPreviewUrl(data.previewUrl || null);
        setCaptureSessionId(data.captureSessionId || null);

        // ✅ IMPORTANT: your /public/payment-status MUST return downloadToken
        setDownloadToken(data.downloadToken || null);

        setFileName(data.fileName || null);
        setSizeBytes(typeof data.sizeBytes === "number" ? data.sizeBytes : null);
        setModeLabel(data.modeLabel || (data.captureType === "photo" ? "写真" : "動画") || "写真");
        setOverlayLabel(data.overlayLabel || "無");

        if (data?.paid) {
          setStatus("paid");
          if (timer) clearInterval(timer);
        } else {
          setStatus("checking");
        }
      } catch (e) {
        if (cancelled) return;
        setError(String(e.message || e));
        setStatus("failed");
        if (timer) clearInterval(timer);
      }
    };

    poll();
    timer = setInterval(poll, 2000);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [API_BASE, sessionId]);

  async function handleDownload() {
    setError(null);

    if (status !== "paid") {
      setError("Payment not confirmed yet.");
      return;
    }
    if (!downloadToken) {
      setError("Paid, but missing downloadToken from server.");
      return;
    }

    setDownloading(true);
    try {
      // ✅ Landing page (cookie nonce set here)
      const url = `${API_BASE}/stripe/dl/${encodeURIComponent(downloadToken)}`;
      window.open(url, "_blank", "noopener,noreferrer");

      // optional: move user to end page
      navigate("/end?from=download", { replace: true });
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setDownloading(false);
    }
  }

  const showBusy = status !== "failed" && !previewUrlNoCache;
  const displayFilename = fileName || guessFilename(previewUrlNoCache);
  const displaySize = humanBytes(sizeBytes);

  return (
    <div className="min-h-screen bg-slate-50 px-3 py-5 flex justify-center">
      <div className="w-full max-w-[520px]">
        <h1 className="text-center text-xl font-extrabold text-slate-900 mt-1 mb-4">
          保存
        </h1>

        <div className="flex gap-3 mb-3">
          <div className="flex-1 rounded-full border border-slate-200 bg-white px-3 py-2 text-center text-[13px] font-bold text-slate-700 shadow-sm">
            OVERLAY: {overlayLabel}
          </div>
          <div className="flex-1 rounded-full border border-slate-200 bg-white px-3 py-2 text-center text-[13px] font-bold text-slate-700 shadow-sm">
            選択モード: {modeLabel}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.12)]">
          <div className="relative aspect-video bg-black">
            {showBusy && (
              <div className="absolute inset-0 flex items-center justify-center gap-3 bg-gradient-to-br from-black/60 to-black/30">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                <div className="text-sm font-extrabold text-white/90">
                  決済確認中…（phase: {phase}）
                </div>
              </div>
            )}

            {!showBusy && previewUrlNoCache && kind === "image" && (
              <img
                src={previewUrlNoCache}
                alt="preview"
                className="h-full w-full object-cover"
                onError={() =>
                  setError("プレビュー表示に失敗しました（期限切れ/アクセス制限）。ダウンロードは可能です。")
                }
              />
            )}

            {!showBusy && previewUrlNoCache && (kind === "video" || kind === "unknown") && (
              <video
                src={previewUrlNoCache}
                controls
                playsInline
                className="h-full w-full object-cover"
                onError={() =>
                  setError("動画プレビューに失敗しました（期限切れ/アクセス制限）。ダウンロードは可能です。")
                }
              />
            )}

            <button
              type="button"
              className="absolute right-3 top-3 h-10 w-10 rounded-full bg-white/90 shadow-md grid place-items-center text-slate-900 disabled:opacity-50"
              title="別タブで開く"
              disabled={!previewUrlNoCache}
              onClick={() => {
                if (previewUrlNoCache) window.open(previewUrlNoCache, "_blank", "noopener,noreferrer");
              }}
            >
              🖼️
            </button>
          </div>

          <div className="flex gap-4 border-t border-slate-200 px-4 py-3">
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-extrabold tracking-wider text-slate-400">SIZE</div>
              <div className="mt-1 text-[13px] font-extrabold text-slate-900 truncate" title={String(displaySize)}>
                {displaySize}
              </div>
            </div>

            <div className="flex-1 min-w-0 text-right">
              <div className="text-[11px] font-extrabold tracking-wider text-slate-400">FILENAME</div>
              <div className="mt-1 text-[13px] font-extrabold text-slate-900 truncate" title={displayFilename}>
                {displayFilename}
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm font-bold text-red-700 whitespace-pre-wrap">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={handleDownload}
          disabled={status !== "paid" || downloading || !downloadToken}
          className="mt-4 w-full rounded-xl bg-emerald-500 py-4 text-[16px] font-black text-white shadow-[0_16px_40px_rgba(0,200,83,0.28)] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {downloading ? "準備中…" : "ダウンロード準備"}
        </button>

        <div className="mt-4 text-center text-xs leading-6 text-slate-500">
          上記ボタンでデータのダウンロードが可能です。<br />
          メールでもダウンロードURLをお送りしていますのでそちらからダウンロードすることもできます。
        </div>

        <div className="mt-2 text-center text-xs font-extrabold text-red-500">
          ※ ダウンロードの有効期限は1時間で、最大3回まで可能です。
        </div>
      </div>
    </div>
  );
}
