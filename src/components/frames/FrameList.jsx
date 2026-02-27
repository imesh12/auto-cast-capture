// src/components/frames/FrameList.jsx
import { useEffect, useState } from "react";
import { db } from "../../firebase";
import {
  collection,
  onSnapshot,
  deleteDoc,
  doc,
  getDocs,
  updateDoc,
} from "firebase/firestore";
import { ref, deleteObject } from "firebase/storage";
import { storage } from "../../firebase";

export default function FrameList({
  selectedFrames,
  selectedLogos,
  onFrameChange,
  onLogoChange,
  onItemsLoaded,
  limits,
}) {
  const clientId = localStorage.getItem("clientId");
  const [items, setItems] = useState([]);

  /* ================================
     REALTIME LOAD (SOURCE OF TRUTH)
  ================================= */
  useEffect(() => {
    if (!clientId) return;

    const colRef = collection(db, "clients", clientId, "frames");

    const unsub = onSnapshot(colRef, (snap) => {
      const data = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        // hide broken / deleted entries
        .filter(
          (i) =>
            i.fileName &&
            i.type &&
            i.storagePath
        );

      setItems(data);

      if (typeof onItemsLoaded === "function") {
        onItemsLoaded(data);
      }
    });

    return () => unsub();
  }, [clientId, onItemsLoaded]);

  /* ================================
     AUTO CLEAN SELECTION
     (NO ESLINT RULES USED)
  ================================= */
  useEffect(() => {
  const validIds = new Set(items.map((i) => i.id));

  // 🔥 FRAME: single-select → only clear if invalid
  if (
    selectedFrames.length > 0 &&
    !validIds.has(selectedFrames[0])
  ) {
    onFrameChange([]);
  }

  // 🔥 LOGOS: multi-select → safe to auto-clean
  onLogoChange(
    selectedLogos.filter((l) => validIds.has(l.logoId))
  );
}, [items]);

  /* ================================
     HELPERS
  ================================= */
  function isChecked(item) {
    if (item.type === "frame") {
      return selectedFrames.includes(item.id);
    }
    return selectedLogos.some((l) => l.logoId === item.id);
  }

  function toggle(item, checked) {
  if (item.type === "frame") {
    if (checked) {
      if (selectedFrames.length >= limits.maxFrames) {
        alert(`You can only select ${limits.maxFrames} frames`);
        return;
      }
      onFrameChange([item.id]); // single-select or adapt if needed
    } else {
      onFrameChange([]);
    }
  } else {
    if (checked) {
      if (selectedLogos.length >= limits.maxLogos) {
        alert(`You can only select ${limits.maxLogos} logo(s)`);
        return;
      }
      onLogoChange([
        ...selectedLogos,
        { logoId: item.id, position: "top-right" },
      ]);
    } else {
      onLogoChange(
        selectedLogos.filter((l) => l.logoId !== item.id)
      );
    }
  }
}


  /* ================================
     DELETE (PRODUCTION SAFE)
  ================================= */
  async function handleDelete(item) {
    if (!window.confirm(`Delete "${item.fileName}" ?`)) return;

    try {
      // 1️⃣ delete firestore doc
      await deleteDoc(
        doc(db, "clients", clientId, "frames", item.id)
      );

      // 2️⃣ delete storage file
      if (item.storagePath) {
        await deleteObject(ref(storage, item.storagePath));
      }

      // 3️⃣ remove references from all cameras
      const camsSnap = await getDocs(
        collection(db, "clients", clientId, "cameras")
      );

      for (const cam of camsSnap.docs) {
        const overlay = cam.data().overlay;
        if (!overlay) continue;

        const newOverlay = {
          frameId:
            overlay.frameId === item.id ? null : overlay.frameId,
          logos: (overlay.logos || []).filter(
            (l) => l.logoId !== item.id
          ),
          updatedAt: new Date(),
        };

        await updateDoc(cam.ref, { overlay: newOverlay });
      }
    } catch (err) {
      alert("Delete failed: " + err.message);
    }
  }

  /* ================================
   UI
================================= */
return (
  <div className="space-y-2">
    <div className="text-sm font-semibold text-slate-700 dark:text-slate-300">
      Frames / Logos (PNG)
    </div>

    {items.length === 0 && (
      <div className="text-xs text-slate-500">
        No frames or logos uploaded
      </div>
    )}

    {items.map((item) => (
      <div
        key={item.id}
        className="flex items-center justify-between gap-3 p-2 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
      >
        {/* LEFT */}
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={isChecked(item)}
            onChange={(e) => toggle(item, e.target.checked)}
          />

          <div className="flex flex-col">
            <span className="text-sm font-medium">
              {item.fileName}
            </span>

            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>({item.type})</span>

              {/* FREE / PAID BADGE */}
              {item.isPaid ? (
                <span className="px-2 py-0.5 rounded bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300">
                  ¥{item.price}
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">
                  FREE
                </span>
              )}
            </div>
          </div>
        </label>

        {/* RIGHT */}
        <button
          onClick={() => handleDelete(item)}
          className="text-xs text-red-500 hover:underline"
        >
          Delete
        </button>
      </div>
    ))}
  </div>
);
}