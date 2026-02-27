// src/components/DeleteConfirmModal.jsx
import React from "react";

function DeleteConfirmModal({ camera, onCancel, onConfirm }) {
  if (!camera) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 w-full max-w-sm shadow-2xl border border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-9 h-9 rounded-full bg-red-100 text-red-600 flex items-center justify-center">
            <i className="bx bx-trash" />
          </div>
          <h2 className="text-base font-semibold">Delete Camera</h2>
        </div>

        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mb-4">
          Are you sure you want to delete{" "}
          <span className="font-semibold">{camera.name}</span> (
          <span className="font-mono">{camera.id}</span>)? This action cannot be
          undone.
        </p>

        <div className="flex justify-end gap-2">
          <button
            className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 text-xs sm:text-sm hover:bg-slate-300 dark:hover:bg-slate-600"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 rounded-xl bg-red-500 text-white text-xs sm:text-sm hover:bg-red-600"
            onClick={onConfirm}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export default DeleteConfirmModal;
