import React from "react";

function StatusPill({ status }) {
  let color =
    "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-100";
  if (status === "Active")
    color = "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300";
  if (status === "Warning")
    color = "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300";
  if (status === "Offline")
    color = "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300";

  return (
    <span
      className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${color}`}
    >
      {status}
    </span>
  );
}

export default StatusPill;
