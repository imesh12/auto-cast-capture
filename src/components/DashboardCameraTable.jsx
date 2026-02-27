import React, { useState } from "react";
import StatusPill from "./StatusPill";
import ViewCameraModal from "./ViewCameraModal";

export default function DashboardCameraTable({ cameras }) {
  const [selectedCamera, setSelectedCamera] = useState(null);

  return (
    <>
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Recent Cameras</h3>
        </div>

        {/* Only 5 rows visible, scroll others */}
        <div className="max-h-[300px] overflow-y-auto">
          <table className="min-w-full text-sm">
            <thead className="text-slate-500 dark:text-slate-400 border-b">
              <tr>
                <th className="text-left py-2">Camera</th>
                <th className="text-left py-2">Location</th>
                <th className="text-left py-2 hidden md:table-cell">Today</th>
                <th className="text-left py-2">Status</th>
              </tr>
            </thead>

            <tbody>
              {cameras.map((cam) => (
                <tr
                  key={cam.id}
                  className="border-b hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer"
                  onClick={() => setSelectedCamera(cam)}
                >
                  <td className="py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-slate-300 dark:bg-slate-700 flex items-center justify-center">
                        <i className="bx bxs-camera"></i>
                      </div>
                      <div>
                        <div className="font-medium">{cam.name}</div>
                        <div className="text-xs text-slate-500">ID: {cam.id}</div>
                      </div>
                    </div>
                  </td>

                  <td className="py-3">{cam.locationName}</td>

                  <td className="py-3 hidden md:table-cell">{cam.todayCaptures}</td>

                  <td className="py-3">
                    <StatusPill status={cam.status} />
                  </td>
                </tr>
              ))}

              {cameras.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center py-6 text-slate-500">
                    No cameras available.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedCamera && (
        <ViewCameraModal
          camera={selectedCamera}
          onClose={() => setSelectedCamera(null)}
        />
      )}
    </>
  );
}
