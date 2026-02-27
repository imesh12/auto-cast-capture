import React from "react";

function CameraDetailsModal({ camera, onClose }) {
  if (!camera) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-900 rounded-xl p-6 w-full max-w-md shadow-xl">
        
        <h2 className="text-lg font-semibold mb-4">Camera Details</h2>

        <div className="space-y-3 text-sm">
          <Detail label="Camera Name" value={camera.name} />
          <Detail label="Camera ID" value={camera.id} />
          <Detail label="IP" value={camera.ip || "-"} />
          <Detail label="Port" value={camera.port || "-"} />
          <Detail label="Username" value={camera.username || "-"} />
          <Detail label="Latitude" value={camera.lat || "-"} />
          <Detail label="Longitude" value={camera.lng || "-"} />
          <Detail label="Location Name" value={camera.locationName || camera.location || "-"} />
          <Detail label="Serial Number" value={camera.serial || "-"} />
          <Detail label="Status" value={camera.status} />
          <Detail label="Last Capture" value={camera.lastCaptureAt} />
        </div>

        <div className="flex justify-between mt-5">
          <button
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            Live View
          </button>

          <button
            className="px-4 py-2 bg-slate-300 rounded-lg hover:bg-slate-400"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div>
      <div className="text-xs text-slate-400">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

export default CameraDetailsModal;
