// src/pages/FramesPage.jsx
import { useState, useCallback, useEffect } from "react";

import CameraSelector from "../components/frames/CameraSelector";
import FrameList from "../components/frames/FrameList";
import LogoPositionSelector from "../components/frames/LogoPositionSelector";
import SaveOverlayButton from "../components/frames/SaveOverlayButton";
import FrameUploader from "../components/frames/FrameUploader";
import FramePreview from "../components/frames/FramePreview";

import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";

export default function FramesPage() {
  const clientId = localStorage.getItem("clientId");

  /* ================================
     STATE
  ================================= */
  const [cameraId, setCameraId] = useState("");
  const [selectedFrames, setSelectedFrames] = useState([]); // single frame
  const [selectedLogos, setSelectedLogos] = useState([]);   // multiple logos
  const [itemsMap, setItemsMap] = useState({});

  // 🔒 CLIENT LIMITS (DEFAULT)
  const [limits, setLimits] = useState({
    maxFrames: 3,
    maxLogos: 1,
  });

  /* ================================
     LOAD CLIENT LIMITS
  ================================= */
  useEffect(() => {
    if (!clientId) return;

    async function loadLimits() {
      try {
        const snap = await getDoc(doc(db, "clients", clientId));

        if (snap.exists()) {
          const data = snap.data();
          if (data.limits) {
            setLimits({
              maxFrames: data.limits.maxFrames ?? 5,
              maxLogos: data.limits.maxLogos ?? 1,
            });
          }
        }
      } catch (err) {
        console.warn("Failed to load client limits, using defaults", err);
      }
    }

    loadLimits();
  }, [clientId]);

  /* ================================
     LOAD OVERLAY FROM CAMERA
  ================================= */
  function loadOverlay(overlay) {
    setSelectedFrames(overlay?.frameId ? [overlay.frameId] : []);
    setSelectedLogos(overlay?.logos || []);
  }

  /* ================================
     MAP ITEMS (FOR PREVIEW)
  ================================= */
  const handleItemsLoaded = useCallback((items) => {
    const map = {};
    items.forEach((it) => {
      map[it.id] = it;
    });
    setItemsMap(map);
  }, []);

  /* ================================
     RENDER
  ================================= */
  return (
    <div className="p-6 h-full bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
      <div className="flex gap-6 h-full">
        {/* LEFT PANEL */}
        <div className="w-1/2 space-y-5">
          <h1 className="text-xl font-bold">フレームとロゴ追加</h1>

          <CameraSelector
            onSelect={setCameraId}
            onLoadOverlay={loadOverlay}
          />

          {/* UPLOAD */}
          <FrameUploader />

          {/* LIMIT INFO */}
          <div className="text-xs text-slate-500">
            Plan limits: {limits.maxFrames} frame(s), {limits.maxLogos} logo(s)
          </div>

          {/* LIST */}
          <FrameList
            selectedFrames={selectedFrames}
            selectedLogos={selectedLogos}
            onFrameChange={setSelectedFrames}
            onLogoChange={setSelectedLogos}
            onItemsLoaded={handleItemsLoaded}
            limits={limits}
          />

          {/* LOGO POSITION */}
          <LogoPositionSelector
            logos={selectedLogos}
            onChange={setSelectedLogos}
          />

          {/* SAVE */}
          <SaveOverlayButton
            clientId={clientId}
            cameraId={cameraId}
            frameIds={selectedFrames}
            logos={selectedLogos}
          />

          {/* DEBUG INFO */}
          <div className="text-xs text-slate-600 dark:text-slate-300">
            Selected Camera: <b>{cameraId || "None"}</b> / Frame:{" "}
            <b>{selectedFrames[0] || "None"}</b> / Logos:{" "}
            <b>{selectedLogos.length}</b>
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div className="w-1/2">
          <FramePreview
            selectedFrameId={selectedFrames[0] || null}
            selectedLogos={selectedLogos}
            itemsMap={itemsMap}
          />
        </div>
      </div>
    </div>
  );
}
