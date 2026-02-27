import React from "react";

function DashboardCards({ stats }) {
  return (
    <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-2">
      <li className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex items-center gap-4">
        <div className="w-16 h-16 rounded-xl flex items-center justify-center bg-blue-100 text-blue-600 text-3xl">
          <i className="bx bxs-calendar-check" />
        </div>
        <div>
          <h3 className="text-xl font-semibold">{stats.totalCameras}</h3>
          <p className="text-slate-500 dark:text-slate-400">Active Cameras</p>
        </div>
      </li>
      <li className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex items-center gap-4">
        <div className="w-16 h-16 rounded-xl flex items-center justify-center bg-yellow-100 text-yellow-600 text-3xl">
          <i className="bx bxs-group" />
        </div>
        <div>
          <h3 className="text-xl font-semibold">{stats.totalCapturesToday}</h3>
          <p className="text-slate-500 dark:text-slate-400">Captures today</p>
        </div>
      </li>
      <li className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex items-center gap-4">
        <div className="w-16 h-16 rounded-xl flex items-center justify-center bg-orange-100 text-orange-600 text-3xl">
          <i className="bx bxs-dollar-circle" />
        </div>
        <div>
          <h3 className="text-xl font-semibold">
            ¥{stats.totalRevenue.toLocaleString()}
          </h3>
          <p className="text-slate-500 dark:text-slate-400">Total Revenue</p>
        </div>
      </li>
    </ul>
  );
}

export default DashboardCards;
