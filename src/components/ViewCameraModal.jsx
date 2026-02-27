// src/components/ViewCameraModal.jsx
import React from "react";

// helper to format Firestore Timestamp or string
function formatDateTime(value) {
  if (!value) return "-";
  // if it's already a string, just show it
  if (typeof value === "string") return value;
  // Firestore Timestamp has .toDate()
  if (value.toDate) {
    try {
      return value.toDate().toLocaleString();
    } catch {
      return "-";
    }
  }
  // fallback
  return "-";
}

function ViewCameraModal({ camera, onClose }) {
  if (!camera) return null;

  const fieldClass = "text-xs text-slate-500 dark:text-slate-400";
  const valueClass = "text-sm font-medium";

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-xl shadow-2xl border border-slate-200 dark:border-slate-800">
        {/* header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <i className="bx bxs-camera" />
              {camera.name}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              ID: {camera.id} · Status:{" "}
              <span className="font-medium">{camera.status}</span>
            </p>
          </div>
          <button
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            onClick={onClose}
          >
            <i className="bx bx-x text-2xl" />
          </button>
        </div>

        {/* details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 text-sm">
          <div className="space-y-2">
            <div>
              <div className={fieldClass}>Location</div>
              <div className={valueClass}>
                {camera.locationName || camera.location || "-"}
              </div>
            </div>
            <div>
              <div className={fieldClass}>IP / Port</div>
              <div className={valueClass}>
                {camera.ip || "-"}
                {camera.port && (
                  <span className="text-xs"> :{camera.port}</span>
                )}
              </div>
            </div>
            <div>
              <div className={fieldClass}>Credentials</div>
              <div className={valueClass}>
                {camera.username ? camera.username : "-"} /{" "}
                {camera.password ? "••••••" : "-"}
              </div>
            </div>
            <div>
              <div className={fieldClass}>Serial Number</div>
              <div className={valueClass}>{camera.serial || "-"}</div>
            </div>
          </div>

          <div className="space-y-2">
            <div>
              <div className={fieldClass}>Latitude / Longitude</div>
              <div className={valueClass}>
                {camera.lat || "-"}
                {camera.lat && camera.lng && " / "}
                {camera.lng || ""}
              </div>
            </div>
            <div>
              <div className={fieldClass}>Created At</div>
              <div className={valueClass}>
                {formatDateTime(camera.createdAt)}
              </div>
            </div>
            <div>
              <div className={fieldClass}>Last Capture</div>
              <div className={valueClass}>
                {formatDateTime(camera.lastCaptureAt)}
              </div>
            </div>
            <div>
              <div className={fieldClass}>Today Captures / Paid</div>
              <div className={valueClass}>
                {camera.todayCaptures ?? 0} / {camera.paidCaptures ?? 0}
              </div>
            </div>
          </div>
        </div>

        {/* footer buttons */}
        <div className="flex justify-between items-center pt-3">
          <button
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs sm:text-sm hover:bg-slate-200 dark:hover:bg-slate-700"
            onClick={() => {
            const idForProxy = camera.cameraId || camera.id; // fallback
            const url = `/axis-ui/${encodeURIComponent(idForProxy)}/camera/index.html#/video/installation`;
            window.open(url, "_blank", "noopener,noreferrer");
             }}
          >
          <i className="bx bxs-cog" />
          Camera Settings
          </button>

          <div className="flex gap-2">
            <button
              className="px-4 py-2 rounded-xl bg-emerald-500 text-white text-xs sm:text-sm hover:bg-emerald-600 inline-flex items-center gap-2"
              onClick={() => {
                alert("Live view button clicked (demo)");
              }}
            >
              <i className="bx bx-play-circle" />
              Live View
            </button>
            <button
              className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 text-xs sm:text-sm hover:bg-slate-300 dark:hover:bg-slate-600"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ViewCameraModal;
