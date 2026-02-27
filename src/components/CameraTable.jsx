// src/components/CameraTable.jsx
import React from "react";
import StatusPill from "./StatusPill";

function CameraTable({
  cameras,
  onOpenAdd,
  onOpenEdit,
  onOpenView,
  onRequestDelete,
  compact = false,
  canEdit = () => true,
}) {
  const cardBg =
    "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl";

  return (
    <div className={`${cardBg} p-4 overflow-x-auto`}>
      {/* HEADER */}
      <div className="flex items-center gap-3 mb-4">
        <h3 className="text-lg font-semibold flex-1">カメラ一覧</h3>

        {!compact && (
          <>
           
          </>
        )}

        <button
          className="px-3 py-2 bg-blue-500 text-white rounded-xl text-sm hover:bg-blue-600"
          onClick={onOpenAdd}
        >
          ＋ カメラ追加
        </button>
      </div>

      {/* TABLE */}
      <table className="min-w-full text-sm">
        <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
          <tr>
            <th className="text-left py-2 pr-3">カメラ名</th>
            <th className="text-left py-2 pr-3">設置場所</th>
            <th className="text-left py-2 pr-3 hidden md:table-cell">
              本日の撮影数
            </th>
            <th className="text-left py-2 pr-3 hidden md:table-cell">
              有料撮影数
            </th>
            <th className="text-left py-2 pr-3">状態</th>
            <th className="text-left py-2 pr-3">操作</th>
          </tr>
        </thead>

        <tbody>
          {cameras.map((cam) => (
            <tr
              key={cam.id}
              className="border-b last:border-b-0 border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60"
            >
              {/* CAMERA */}
              <td className="py-3 pr-3">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onOpenView(cam)}
                    className="w-9 h-9 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                    title="詳細を見る"
                  >
                    <i className="bx bxs-camera text-lg" />
                  </button>

                  <div className="flex flex-col">
                    <span className="font-medium">{cam.name}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      ID：{cam.id}
                    </span>
                  </div>
                </div>
              </td>

              {/* LOCATION */}
              <td className="py-3 pr-3">
                <span className="text-xs sm:text-sm">
                  {cam.locationName || cam.location || "未設定"}
                </span>
              </td>

              {/* TODAY */}
              <td className="py-3 pr-3 hidden md:table-cell font-medium">
                {cam.todayCaptures ?? 0}
              </td>

              {/* PAID */}
              <td className="py-3 pr-3 hidden md:table-cell">
                {cam.paidCaptures ?? 0}
              </td>

              {/* STATUS */}
              <td className="py-3 pr-3">
                <StatusPill status={cam.status} />
              </td>

              {/* ACTIONS */}
              <td className="py-3 pr-3 text-xs">
                <div className="flex gap-1">
                  <button
                    className={`px-2 py-1 rounded-lg ${
                      canEdit(cam)
                        ? "bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600"
                        : "bg-slate-200 dark:bg-slate-700 opacity-40 cursor-not-allowed"
                    }`}
                    disabled={!canEdit(cam)}
                    onClick={() => canEdit(cam) && onOpenEdit(cam)}
                    title={
                      canEdit(cam)
                        ? "編集"
                        : "お支払いが必要です"
                    }
                  >
                    編集
                  </button>

                  <button
                    className={`px-2 py-1 rounded-lg ${
                      canEdit(cam)
                        ? "bg-red-500 text-white hover:bg-red-600"
                        : "bg-red-400 text-white opacity-40 cursor-not-allowed"
                    }`}
                    disabled={!canEdit(cam)}
                    onClick={() => canEdit(cam) && onRequestDelete(cam)}
                    title={
                      canEdit(cam)
                        ? "削除"
                        : "お支払いが必要です"
                    }
                  >
                    削除
                  </button>
                </div>
              </td>
            </tr>
          ))}

          {cameras.length === 0 && (
            <tr>
              <td
                colSpan={6}
                className="py-6 text-center text-slate-500 dark:text-slate-400 text-sm"
              >
                カメラが登録されていません。「＋ カメラ追加」から登録してください。
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default CameraTable;
