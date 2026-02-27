import React, { useEffect, useState } from "react";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase"; // adjust to your firebase export

export default function SettingsPage({ isDark }) {
  const clientId = localStorage.getItem("clientId");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const [freeMode, setFreeMode] = useState(false);
  const [photoPrice, setPhotoPrice] = useState(100);
  const [video3Price, setVideo3Price] = useState(300);
  const [video15Price, setVideo15Price] = useState(500);

  useEffect(() => {
    (async () => {
      try {
        if (!clientId) return;

        const ref = doc(db, "clients", clientId, "settings", "pricing");
        const snap = await getDoc(ref);

        if (snap.exists()) {
          const d = snap.data();
          setFreeMode(!!d.freeMode);
          setPhotoPrice(Number(d.photoPrice ?? 100));
          setVideo3Price(Number(d.video3Price ?? 300));
          setVideo15Price(Number(d.video15Price ?? 500));
        } else {
          // create default once
          await setDoc(ref, {
            freeMode: false,
            photoPrice: 100,
            video3Price: 300,
            video15Price: 500,
            updatedAt: serverTimestamp(),
          });
        }
      } catch (e) {
        setMsg({ type: "error", text: e.message });
      } finally {
        setLoading(false);
      }
    })();
  }, [clientId]);

  async function save() {
    try {
      setSaving(true);
      setMsg(null);

      const ref = doc(db, "clients", clientId, "settings", "pricing");

      await setDoc(
        ref,
        {
          freeMode: !!freeMode,
          photoPrice: Number(photoPrice),
          video3Price: Number(video3Price),
          video15Price: Number(video15Price),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setMsg({ type: "ok", text: "保存しました ✅" });
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    } finally {
      setSaving(false);
    }
  }

  const card = isDark
    ? "bg-slate-900 border-slate-800 text-white"
    : "bg-white border-slate-200 text-slate-900";

  if (loading) {
    return <div className="p-6">読み込み中…</div>;
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl">
      <h1 className="text-2xl font-bold mb-2">設定</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
        写真 / 3秒動画 / 15秒動画の価格を変更できます。無料モードをONにすると、すべて ¥0 になります。
      </p>

      <div className={`border rounded-2xl p-4 sm:p-6 ${card}`}>
        {/* Free mode */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="font-semibold">無料モード</div>
            <div className="text-sm opacity-75">
              ONにすると、すべての価格が0円になります（支払い不要）。
            </div>
          </div>

          <label className="inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={freeMode}
              onChange={(e) => setFreeMode(e.target.checked)}
            />
            <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:bg-blue-600 relative">
              <div className="absolute top-0.5 left-0.5 bg-white w-5 h-5 rounded-full transition-all peer-checked:translate-x-5" />
            </div>
          </label>
        </div>

        <div className="mt-6 grid sm:grid-cols-2 gap-4">
          <PriceField
            label="写真の価格（¥）"
            value={photoPrice}
            setValue={setPhotoPrice}
            disabled={freeMode}
          />
          <PriceField
            label="動画 3秒の価格（¥）"
            value={video3Price}
            setValue={setVideo3Price}
            disabled={freeMode}
          />
          <PriceField
            label="動画 15秒の価格（¥）"
            value={video15Price}
            setValue={setVideo15Price}
            disabled={freeMode}
          />
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? "保存中…" : "保存"}
          </button>

          {msg?.type === "ok" && (
            <span className="text-sm text-green-500">{msg.text}</span>
          )}
          {msg?.type === "error" && (
            <span className="text-sm text-red-500">{msg.text}</span>
          )}
        </div>

        <div className="mt-4 text-xs opacity-70">
          現在の適用価格：{" "}
          <b>
            写真 ¥{freeMode ? 0 : photoPrice}、3秒 ¥{freeMode ? 0 : video3Price}、
            15秒 ¥{freeMode ? 0 : video15Price}
          </b>
        </div>
      </div>
    </div>
  );
}

function PriceField({ label, value, setValue, disabled }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <input
        type="number"
        min="0"
        step="1"
        disabled={disabled}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent"
      />
      {disabled && (
        <div className="text-xs text-slate-500 mt-1">
          無料モードがONのため変更できません
        </div>
      )}
    </div>
  );
}
