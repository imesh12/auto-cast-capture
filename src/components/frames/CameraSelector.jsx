// src/components/frames/CameraSelector.jsx
import { useEffect, useState } from "react";
import { db } from "../../firebase";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";

export default function CameraSelector({ onSelect, onLoadOverlay }) {
  const clientId = localStorage.getItem("clientId");
  const [cameras, setCameras] = useState([]);

  useEffect(() => {
    async function load() {
      const snap = await getDocs(
        collection(db, "clients", clientId, "cameras")
      );
      setCameras(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }
    load();
  }, [clientId]);

  async function handleChange(e) {
    const cameraId = e.target.value;
    onSelect(cameraId);

    if (!cameraId) return;

    const snap = await getDoc(
      doc(db, "clients", clientId, "cameras", cameraId)
    );

    if (snap.exists() && snap.data().overlay) {
      onLoadOverlay(snap.data().overlay);
    } else {
      onLoadOverlay({ frameId: null, logos: [] });
    }
  }

  return (
    <div>
      <label className="block text-sm mb-1 text-slate-700 dark:text-slate-300">
        カメラ
      </label>
      <select
        onChange={handleChange}
        className="w-full p-2 rounded bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
      >
        <option value="">カメラリスト</option>
        {cameras.map(c => (
          <option key={c.id} value={c.id}>
            {c.name || c.id}
          </option>
        ))}
      </select>
    </div>
  );
}
