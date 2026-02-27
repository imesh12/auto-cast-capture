// src/components/AddCameraModal.jsx
import React, { useState, useEffect } from "react";

function AddCameraModal({ onClose, onSubmit, editing }) {

  const [form, setForm] = useState({
    name: "",
    ip: "",
    port: "",
    username: "",
    password: "",
    lat: "",
    lng: "",
    locationName: "",
    serial: "",
    status: "Active",          // client control
    paymentStatus: "inactive",   // 🔥 default
  });

  useEffect(() => {
    if (editing) {
      setForm({
        name: editing.name || "",
        ip: editing.ip || "",
        port: editing.port || "",
        username: editing.username || "",
        password: editing.password || "",
        lat: editing.lat || "",
        lng: editing.lng || "",
        locationName: editing.locationName || editing.location || "",
        serial: editing.serial || "",
        status: editing.status || "Active",
        paymentStatus: editing.paymentStatus || "inactive",
      });
    }
  }, [editing]);

  const inputClass =
    "w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm outline-none focus:ring-2 focus:ring-blue-400";

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    onSubmit(form);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-lg shadow-2xl">

        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <i className="bx bxs-camera" />
          {editing ? "Edit Camera" : "Add Camera"}
        </h2>

        <form className="space-y-3" onSubmit={handleSubmit}>

          {/* Camera name */}
          <div>
            <label className="block text-xs mb-1 text-slate-500">Camera Name</label>
            <input className={inputClass}
              value={form.name}
              onChange={e => handleChange("name", e.target.value)} />
          </div>

          {/* IP + Port */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs mb-1 text-slate-500">IP</label>
              <input className={inputClass}
                value={form.ip}
                onChange={e => handleChange("ip", e.target.value)} />
            </div>
            <div>
              <label className="block text-xs mb-1 text-slate-500">Port</label>
              <input className={inputClass}
                value={form.port}
                onChange={e => handleChange("port", e.target.value)} />
            </div>
          </div>

          {/* Username & Password */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs mb-1 text-slate-500">User</label>
              <input className={inputClass}
                value={form.username}
                onChange={e => handleChange("username", e.target.value)} />
            </div>
            <div>
              <label className="block text-xs mb-1 text-slate-500">Password</label>
              <input className={inputClass}
                type="password"
                value={form.password}
                onChange={e => handleChange("password", e.target.value)} />
            </div>
          </div>

          {/* Coordinates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs mb-1 text-slate-500">Latitude</label>
              <input className={inputClass}
                value={form.lat}
                onChange={e => handleChange("lat", e.target.value)} />
            </div>
            <div>
              <label className="block text-xs mb-1 text-slate-500">Longitude</label>
              <input className={inputClass}
                value={form.lng}
                onChange={e => handleChange("lng", e.target.value)} />
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="block text-xs mb-1 text-slate-500">Location Name</label>
            <input className={inputClass}
              value={form.locationName}
              onChange={e => handleChange("locationName", e.target.value)} />
          </div>

          {/* Serial + Status (client control only) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs mb-1 text-slate-500">Serial</label>
              <input className={inputClass}
                value={form.serial}
                onChange={e => handleChange("serial", e.target.value)} />
            </div>

            <div>
              <label className="block text-xs mb-1 text-slate-500">Status (Client Control)</label>
              <select className={inputClass}
                value={form.status}
                onChange={(e) => handleChange("status", e.target.value)}
              >
                <option>Active</option>
                <option>Warning</option>
                <option>Offline</option>
              </select>
            </div>
          </div>

          {/* Payment Status (hidden from client) */}
          {editing && (
            <div>
              <label className="block text-xs mb-1 text-slate-500">Payment Status</label>
              <input className={inputClass} value={form.paymentStatus} disabled />
            </div>
          )}

          {/* Buttons */}
          <div className="flex justify-end gap-2 pt-3">
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-200">
              Cancel
            </button>
            <button className="px-4 py-2 rounded-xl bg-blue-500 text-white">
              {editing ? "Save" : "Add"}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}

export default AddCameraModal;
