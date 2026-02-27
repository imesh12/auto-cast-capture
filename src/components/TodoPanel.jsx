import React from "react";

function TodoPanel({ isDark }) {
  const cardBg =
    "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl";

  const tasks = [
    { text: "Check Harbor Cam D – offline", status: "not-completed" },
    { text: "Review price config for Shrine Cam C", status: "completed" },
    { text: "Confirm storage capacity for Forest Road Cam A", status: "completed" },
    { text: "Export weekly revenue report", status: "not-completed" },
    { text: "Verify frame overlay alignment on all cameras", status: "completed" },
  ];

  return (
    <div className={`${cardBg} p-4`}>
      <div className="flex items-center gap-3 mb-4">
        <h3 className="text-lg font-semibold flex-1">Operations</h3>
        <button className="text-slate-400 hover:text-blue-500 text-xl">
          <i className="bx bx-plus" />
        </button>
        <button className="text-slate-400 hover:text-blue-500 text-xl">
          <i className="bx bx-filter" />
        </button>
      </div>
      <ul className="space-y-3 text-sm">
        {tasks.map((task, idx) => (
          <li
            key={idx}
            className={`${
              isDark ? "bg-slate-900" : "bg-slate-50"
            } ${
              task.status === "completed"
                ? "border-l-4 border-l-blue-500"
                : "border-l-4 border-l-orange-500"
            } flex items-center justify-between rounded-xl px-3 py-2 text-xs sm:text-sm`}
          >
            <p>{task.text}</p>
            <i className="bx bx-dots-vertical-rounded text-lg text-slate-400" />
          </li>
        ))}
      </ul>
    </div>
  );
}

export default TodoPanel;
