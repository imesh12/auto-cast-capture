import React, { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

export default function EndPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  // optional: from=download / from=mail etc
  const from = params.get("from") || "";

  useEffect(() => {
    // ✅ When user presses browser back, force to main page (/capture)
    // We push a history state, then on popstate we redirect.
    window.history.pushState({ end: true }, "", window.location.href);

    const onPop = () => {
      navigate("/capture", { replace: true });
    };

    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [navigate]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-[420px] text-center">
        {/* Icon */}
        <div className="mx-auto mb-5 h-24 w-24 rounded-full border-4 border-blue-200 bg-white flex items-center justify-center shadow-sm">
          <div className="h-10 w-10 rounded-full bg-blue-600 flex items-center justify-center text-white text-xl font-black">
            ✓
          </div>
        </div>

        {/* Sparkles */}
        <div className="text-2xl mb-2">✨</div>

        {/* Text */}
        <div className="text-2xl font-black text-slate-900">撮影完了</div>

        <div className="mt-3 text-lg font-extrabold text-blue-600">
          AutoCaster View
        </div>

        <div className="mt-2 text-sm text-slate-600 leading-6">
          ご利用いただき<br />
          <span className="font-bold text-slate-800">ありがとうございました</span>
        </div>

        {from && (
          <div className="mt-4 text-xs font-bold text-slate-400">
            ({from})
          </div>
        )}

        {/* if go home page Button */}
      
      </div>
    </div>
  );
}
