// src/components/frames/LogoPositionSelector.jsx
export default function LogoPositionSelector({ logos, onChange }) {
  if (!logos?.length) return null;

  const positions = [
    "top-left",
    "top-center",
    "top-right",
    "center",
    "bottom-left",
    "bottom-center",
    "bottom-right",
  ];

  function update(logoId, position) {
    onChange((prev) =>
      prev.map((l) => (l.logoId === logoId ? { ...l, position } : l))
    );
  }

  return (
    <div className="p-3 rounded bg-slate-100 dark:bg-slate-800 space-y-2">
      <div className="text-sm font-semibold">ロゴ位置</div>

      {logos.map((l) => (
        <div key={l.logoId} className="flex items-center gap-3">
          <div className="text-xs text-slate-600 dark:text-slate-300 w-28 truncate">
            {l.logoId}
          </div>
          <select
            className="flex-1 p-2 rounded bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600"
            value={l.position || "top-right"}
            onChange={(e) => update(l.logoId, e.target.value)}
          >
            {positions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}
