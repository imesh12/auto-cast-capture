// src/pages/CapturePage.jsx
import React, { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { db } from "../firebase";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";

const SERVER =
  process.env.REACT_APP_SERVER_URL || "http://192.168.1.166:4450";

export default function CapturePage() {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);

  const [cameraId, setCameraId] = useState(null);
  const [clientId, setClientId] = useState(null);
  const [sessionId, setSessionId] = useState(null);

  const [phase, setPhase] = useState("idle"); // idle | live | capturing | preview
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewType, setPreviewType] = useState("video"); // "photo" | "video"
  const [error, setError] = useState("");

  // overlays
  const [overlays, setOverlays] = useState([]);
  const [selectedFrame, setSelectedFrame] = useState(null);
  const [selectedLogo, setSelectedLogo] = useState(null);

  // capture selection (chosen via popup)
  const [captureType, setCaptureType] = useState("video"); // "photo" | "video"
  const [durationSec, setDurationSec] = useState(3);       // 3 | 15 (video only)

  // popups
  const [showStartModal, setShowStartModal] = useState(false);
  const [showDurationModal, setShowDurationModal] = useState(false);

  /* ===============================
     READ cameraId FROM URL
  ================================ */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setCameraId(params.get("cameraId"));
  }, []);

  /* ===============================
     INIT SESSION (server uses POST)
  ================================ */
  useEffect(() => {
    if (!cameraId) return;

    fetch(`${SERVER}/public/session?cameraId=${encodeURIComponent(cameraId)}`, {
      method: "POST",
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.sessionId) setSessionId(data.sessionId);
        else if (data.error) setError(data.error);
      })
      .catch(() => setError("Session init failed"));
  }, [cameraId]);

  /* ===============================
     LOAD CLIENT ID FROM CAMERA
  ================================ */
  useEffect(() => {
    if (!cameraId) return;

    async function loadClient() {
      const snap = await getDoc(doc(db, "cameras", cameraId));
      if (snap.exists()) setClientId(snap.data().clientId);
    }

    loadClient();
  }, [cameraId]);

  /* ===============================
     LOAD OVERLAYS
  ================================ */
  useEffect(() => {
    if (!clientId) return;

    async function loadOverlays() {
      const snap = await getDocs(collection(db, "clients", clientId, "frames"));
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setOverlays(data);
    }

    loadOverlays();
  }, [clientId]);

  /* ===============================
     CLEANUP HLS
  ================================ */
  const destroyHls = () => {
    if (hlsRef.current) {
      try {
        hlsRef.current.destroy();
      } catch {}
      hlsRef.current = null;
    }
  };

  /* ===============================
     HLS attach
  ================================ */
  const attachHls = (src) => {
    const video = videoRef.current;
    if (!video) return;

    destroyHls();

    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;
    video.controls = false;

    if (Hls.isSupported()) {
      const hls = new Hls({
        lowLatencyMode: true,
        liveSyncDuration: 1,
        liveMaxLatencyDuration: 3,
      });

      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
      });
    } else {
      video.src = src;
      video.play().catch(() => {});
    }
  };

  /* ===============================
     START LIVE STREAM
  ================================ */
  const startLive = async () => {
    setError("");
    setPreviewUrl(null);

    if (!cameraId || !sessionId) {
      setError("Missing cameraId or sessionId (session not ready yet)");
      return;
    }

    try {
      const res = await fetch(
        `${SERVER}/public/start-stream?cameraId=${encodeURIComponent(
          cameraId
        )}&sessionId=${encodeURIComponent(sessionId)}`
      );

      const json = await res.json();
      if (!json.ok) throw new Error(json.error);

      attachHls(`${SERVER}${json.hlsPath}`);
      setPhase("live");
    } catch (e) {
      setError(e.message);
    }
  };

  /* ===============================
     START BUTTON (opens popup)
  ================================ */
  const handleStartClick = () => {
    setError("");
    setShowStartModal(true);
  };

  /* ===============================
     USER SELECT: PHOTO
     -> set mode photo, close modal, start live
  ================================ */
  const choosePhotoAndStart = async () => {
    setCaptureType("photo");
    setDurationSec(0);
    setShowStartModal(false);
    await startLive();
  };

  /* ===============================
     USER SELECT: VIDEO
     -> close start modal, open duration modal
  ================================ */
  const chooseVideo = () => {
    setCaptureType("video");
    setShowStartModal(false);
    setShowDurationModal(true);
  };

  /* ===============================
     USER SELECT VIDEO DURATION
     -> set duration, close modal, start live
  ================================ */
  const chooseDurationAndStart = async (sec) => {
    setDurationSec(sec);
    setShowDurationModal(false);
    await startLive();
  };

  /* ===============================
     CAPTURE
  ================================ */
  const handleCapture = async () => {
    setError("");
    setPhase("capturing");

    try {
      const res = await fetch(`${SERVER}/public/capture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          captureType,
          durationSec: captureType === "video" ? durationSec : 0,
          frameId: selectedFrame?.id || null,
          logoId: selectedLogo?.id || null,
        }),
      });

      const json = await res.json();
      if (!json.ok) throw new Error(json.error);

      setPreviewUrl(json.previewUrl);
      setPreviewType(json.captureType || captureType);
      setPhase("preview");

      destroyHls();
    } catch (e) {
      setError(e.message);
      setPhase("live");
    }
  };

  /* ===============================
     PAY & DOWNLOAD
     (B2C) uses /public/create-payment
  ================================ */
  const handlePayAndDownload = async () => {
    setError("");

    try {
      const res = await fetch(`${SERVER}/public/create-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, email: null }),
      });

      const json = await res.json();
      if (!json.url) throw new Error(json.error || "Payment session failed");
      window.location.href = json.url;
    } catch (e) {
      setError(e.message);
    }
  };

  /* ===============================
     OVERLAY TOGGLE
  ================================ */
  function toggleOverlay(item) {
    if (item.type === "frame") {
      setSelectedFrame(selectedFrame?.id === item.id ? null : item);
    }
    if (item.type === "logo") {
      setSelectedLogo(selectedLogo?.id === item.id ? null : item);
    }
  }

  const captureLabel =
    captureType === "photo"
      ? "Capture Photo"
      : `Capture Video (${durationSec}s)`;

  /* ===============================
     UI
  ================================ */
  return (
    <div className="min-h-screen bg-gray-900 text-white flex justify-center">
      <div className="w-full max-w-3xl p-4 space-y-4">
        <h1 className="text-2xl font-bold">Town Capture</h1>

        {error && (
          <div className="bg-red-700 px-3 py-2 rounded text-sm">{error}</div>
        )}

        {/* PREVIEW OR LIVE VIDEO */}
        <div className="relative bg-black rounded overflow-hidden">
          {phase === "preview" && previewUrl && previewType === "photo" ? (
            <img
              src={previewUrl}
              alt="preview"
              className="w-full h-64 object-contain bg-black"
            />
          ) : (
            <video
              ref={videoRef}
              className="w-full h-64 bg-black"
              playsInline
              controls={phase === "preview" && previewType !== "photo"}
            />
          )}
        </div>

        {/* OVERLAY SELECTOR */}
        {overlays.length > 0 && (
          <div className="bg-gray-800 rounded p-3 space-y-3">
            <div className="text-sm font-semibold">Choose Overlay</div>

            {/* FRAMES */}
            <div>
              <div className="text-xs text-gray-300 mb-1">Frames (max 1)</div>
              <div className="flex gap-2 overflow-x-auto">
                {overlays
                  .filter((o) => o.type === "frame")
                  .map((item) => (
                    <OverlayCard
                      key={item.id}
                      item={item}
                      selected={selectedFrame?.id === item.id}
                      onClick={() => toggleOverlay(item)}
                    />
                  ))}
              </div>
            </div>

            {/* LOGOS */}
            <div>
              <div className="text-xs text-gray-300 mb-1">Logos (max 1)</div>
              <div className="flex gap-2 overflow-x-auto">
                {overlays
                  .filter((o) => o.type === "logo")
                  .map((item) => (
                    <OverlayCard
                      key={item.id}
                      item={item}
                      selected={selectedLogo?.id === item.id}
                      onClick={() => toggleOverlay(item)}
                    />
                  ))}
              </div>
            </div>
          </div>
        )}

        {/* ACTIONS */}
        <div className="flex gap-3">
          {phase === "idle" && (
            <button
              onClick={handleStartClick}
              className="px-4 py-2 bg-green-600 rounded"
              disabled={!sessionId}
              title={!sessionId ? "Waiting for session..." : ""}
            >
              Start
            </button>
          )}

          {phase === "live" && (
            <button
              onClick={handleCapture}
              className="px-4 py-2 bg-yellow-500 rounded"
            >
              {captureLabel}
            </button>
          )}

          {phase === "preview" && (
            <>
              <button
                onClick={handlePayAndDownload}
                className="px-4 py-2 bg-blue-600 rounded"
              >
                Pay & Download
              </button>

              <button
                onClick={() => {
                  setPhase("idle");
                  setPreviewUrl(null);
                }}
                className="px-3 py-2 bg-gray-700 rounded"
              >
                Back
              </button>
            </>
          )}
        </div>

        {/* START MODAL (Photo / Video) */}
        {showStartModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded p-4 w-72 space-y-3">
              <div className="text-sm font-semibold">
                What do you want to capture?
              </div>

              <button
                className="w-full py-2 rounded bg-gray-700 hover:bg-gray-600"
                onClick={choosePhotoAndStart}
              >
                Photo (¥100)
              </button>

              <button
                className="w-full py-2 rounded bg-gray-700 hover:bg-gray-600"
                onClick={chooseVideo}
              >
                Video
              </button>

              <button
                className="w-full py-2 rounded bg-red-600"
                onClick={() => setShowStartModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* DURATION MODAL (3 / 15) */}
        {showDurationModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded p-4 w-72 space-y-3">
              <div className="text-sm font-semibold">Select Video Duration</div>

              <div className="flex gap-2">
                <button
                  className="flex-1 py-2 rounded bg-gray-700 hover:bg-gray-600"
                  onClick={() => chooseDurationAndStart(3)}
                >
                  3 sec (¥300)
                </button>

                <button
                  className="flex-1 py-2 rounded bg-gray-700 hover:bg-gray-600"
                  onClick={() => chooseDurationAndStart(15)}
                >
                  15 sec (¥500)
                </button>
              </div>

              <button
                className="w-full py-2 rounded bg-red-600"
                onClick={() => setShowDurationModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ===============================
   OVERLAY CARD
================================ */
function OverlayCard({ item, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`min-w-[120px] p-2 rounded border transition
        ${
          selected
            ? "border-blue-500 bg-blue-900/40"
            : "border-gray-600 hover:bg-gray-700"
        }
      `}
    >
      <div className="text-xs font-medium truncate">{item.fileName}</div>
      <div className="text-xs mt-1">
        {item.isPaid ? (
          <span className="text-red-400">¥{item.price}</span>
        ) : (
          <span className="text-green-400">FREE</span>
        )}
      </div>
      {selected && (
        <div className="text-[10px] text-blue-300 mt-1">Selected</div>
      )}
    </button>
  );
}
