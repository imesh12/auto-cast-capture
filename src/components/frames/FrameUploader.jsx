// src/components/frames/FrameUploader.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { db, storage } from "../../firebase";
import {
  collection,
  addDoc,
  getDocs,
  doc,
  getDoc,
  serverTimestamp,
  query,
  orderBy,
  limit,
} from "firebase/firestore";
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";

/* =========================================================
   HELPERS
========================================================= */

function safeUUID() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return (
    Date.now().toString(16) +
    "-" +
    Math.random().toString(16).slice(2) +
    "-" +
    Math.random().toString(16).slice(2)
  );
}

function sanitizeFilename(name) {
  if (!name) return "file.png";
  return name
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^\w.\-]+/g, "")
    .slice(0, 80);
}

function bytesToMB(bytes) {
  return Math.round((bytes / (1024 * 1024)) * 10) / 10;
}

function isPngFile(file) {
  if (!file) return false;
  const mimeOk = file.type === "image/png";
  const extOk = (file.name || "").toLowerCase().endsWith(".png");
  return mimeOk || extOk;
}

/* =========================================================
   COMPONENT
========================================================= */
export default function FrameUploader() {
  const clientId = localStorage.getItem("clientId");

  const [type, setType] = useState("frame"); // "frame" | "logo"
  const [file, setFile] = useState(null);

  const [isPaid, setIsPaid] = useState(false);
  const [price, setPrice] = useState("");

  const [limits, setLimits] = useState({ maxFrames: 5, maxLogos: 1 });
  const [usage, setUsage] = useState({ frames: 0, logos: 0 });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showLimitPopup, setShowLimitPopup] = useState(false);

  const [latest, setLatest] = useState(null);

  const fileInputRef = useRef(null);

  const uploadBlocked = useMemo(() => {
    if (type === "frame") return usage.frames >= limits.maxFrames;
    return usage.logos >= limits.maxLogos;
  }, [type, usage, limits]);

  const limitMessage = useMemo(() => {
    if (type === "frame") return `Frame limit reached (${limits.maxFrames})`;
    return `Logo limit reached (${limits.maxLogos})`;
  }, [type, limits]);

  const refreshUsageAndLimits = useCallback(async () => {
    if (!clientId) return;

    // limits
    const clientSnap = await getDoc(doc(db, "clients", clientId));
    const l = clientSnap.exists() ? clientSnap.data()?.limits : null;

    setLimits({
      maxFrames: l?.maxFrames ?? 5,
      maxLogos: l?.maxLogos ?? 1,
    });

    // usage
    const snap = await getDocs(collection(db, "clients", clientId, "frames"));
    let frames = 0;
    let logos = 0;

    snap.forEach((d) => {
      const t = d.data()?.type;
      if (t === "frame") frames += 1;
      if (t === "logo") logos += 1;
    });

    setUsage({ frames, logos });
  }, [clientId]);

  const loadLatest = useCallback(async () => {
    if (!clientId) return;

    const qRef = query(
      collection(db, "clients", clientId, "frames"),
      orderBy("createdAt", "desc"),
      limit(1)
    );

    const snap = await getDocs(qRef);
    const d0 = snap.docs[0];

    if (!d0) {
      setLatest(null);
      return;
    }
    setLatest({ id: d0.id, ...d0.data() });
  }, [clientId]);

  useEffect(() => {
    refreshUsageAndLimits();
  }, [refreshUsageAndLimits]);

  useEffect(() => {
    loadLatest();
  }, [loadLatest, usage.frames, usage.logos]);

  function resetFileInput() {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function validateBeforeUpload() {
    if (!clientId) return "Missing clientId (localStorage). Please login again.";
    if (uploadBlocked) return limitMessage;
    if (!file) return "Please select a PNG image.";
    if (!isPngFile(file)) return "Only PNG files are allowed.";

    // size limit
    const maxMB = type === "logo" ? 2 : 5;
    if (file.size > maxMB * 1024 * 1024) {
      return `File is too large. Max ${maxMB}MB (your file: ${bytesToMB(
        file.size
      )}MB).`;
    }

    if (isPaid) {
      const p = Number(price);
      if (!price || Number.isNaN(p) || p <= 0) return "Please enter a valid price.";
      if (p > 100000) return "Price too high (max 100,000).";
    }

    return "";
  }

  async function handleUpload() {
    setError("");

    const msg = validateBeforeUpload();
    if (msg) {
      if (msg === limitMessage) setShowLimitPopup(true);
      else alert(msg);
      return;
    }

    setBusy(true);

    const id = safeUUID();
    const cleanOriginal = sanitizeFilename(file.name);
    const storagePath = `frames/${clientId}/${type}/${id}.png`;
    const storageRef = ref(storage, storagePath);

    try {
      await uploadBytes(storageRef, file, {
        contentType: "image/png",
        customMetadata: {
          clientId: String(clientId),
          type: String(type),
          originalName: cleanOriginal,
        },
      });

      const url = await getDownloadURL(storageRef);

      await addDoc(collection(db, "clients", clientId, "frames"), {
        type,
        fileName: cleanOriginal,
        storagePath,
        downloadUrl: url,
        isPaid,
        price: isPaid ? Number(price) : 0,
        createdAt: serverTimestamp(),
      });

      resetFileInput();
      setIsPaid(false);
      setPrice("");

      await refreshUsageAndLimits();
      await loadLatest();
    } catch (err) {
      // cleanup orphan file if Firestore write fails
      try {
        await deleteObject(storageRef);
      } catch (_) {}

      setError(err?.message || "Upload failed");
      alert("Upload failed: " + (err?.message || "Unknown error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 p-4 rounded-xl border border-slate-300 dark:border-slate-700">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">フレーム / ロゴ アップロード</div>
        <div className="text-xs text-slate-500">
          利用: {usage.frames}/{limits.maxFrames} フレーム · {usage.logos}/{limits.maxLogos} ロゴ
        </div>
      </div>

      {error && (
        <div className="text-xs p-2 rounded bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-200">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-2">
        <label className="text-xs text-slate-500">種類</label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="w-full p-2 rounded bg-slate-100 dark:bg-slate-800"
          disabled={busy}
        >
          <option value="frame">フレーム</option>
          <option value="logo">ロゴ</option>
        </select>
      </div>

      <div className="grid grid-cols-1 gap-2">
        <label className="text-xs text-slate-500">PNG ファイル</label>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png"
          disabled={busy}
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
        {file && (
          <div className="text-xs text-slate-500">
            選択: <span className="font-medium">{file.name}</span> · {bytesToMB(file.size)}MB
          </div>
        )}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={isPaid}
          disabled={busy}
          onChange={(e) => setIsPaid(e.target.checked)}
        />
        有料コンテンツ
      </label>

      {isPaid && (
        <input
          type="number"
          placeholder="価格 (円)"
          value={price}
          disabled={busy}
          onChange={(e) => setPrice(e.target.value)}
          className="w-full p-2 rounded bg-slate-100 dark:bg-slate-800"
        />
      )}

      <button
        onClick={handleUpload}
        className={`w-full py-2 rounded text-white transition ${
          uploadBlocked || busy
            ? "bg-gray-400 cursor-not-allowed"
            : "bg-blue-600 hover:bg-blue-700"
        }`}
        disabled={uploadBlocked || busy}
      >
        {busy ? "アップロード中..." : "アップロード"}
      </button>

      {/* Latest preview */}
      {latest?.downloadUrl && (
        <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
          <div className="text-xs text-slate-500 mb-2">最新アップロード</div>
          <div className="flex items-center gap-3">
            <img
              src={latest.downloadUrl}
              alt="latest"
              className="w-16 h-16 rounded object-contain bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            />
            <div className="text-xs">
              <div className="font-medium">{latest.fileName}</div>
              <div className="text-slate-500">
                {latest.type} · {latest.isPaid ? `¥${latest.price}` : "FREE"}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* LIMIT POPUP */}
      {showLimitPopup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl w-80">
            <div className="font-semibold text-sm mb-2">制限に達しました。</div>
            <div className="text-xs text-slate-600 dark:text-slate-300 mb-4">
              {limitMessage}. Please upgrade your plan to add more.
            </div>
            <button
              onClick={() => setShowLimitPopup(false)}
              className="w-full py-2 bg-blue-600 text-white rounded"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
