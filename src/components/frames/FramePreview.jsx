// src/components/frames/FramePreview.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { storage } from "../../firebase";
import { ref, getDownloadURL } from "firebase/storage";

/* ===============================
   URL CACHE (GLOBAL)
================================ */
const urlCache = {};

/* ===============================
   POSITION STYLES
================================ */
const posStyle = (position) => {
  const m = 14;
  switch (position) {
    case "top-left":
      return { top: m, left: m };
    case "top-center":
      return { top: m, left: "50%", transform: "translateX(-50%)" };
    case "top-right":
      return { top: m, right: m };
    case "center":
      return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
    case "bottom-left":
      return { bottom: m, left: m };
    case "bottom-center":
      return { bottom: m, left: "50%", transform: "translateX(-50%)" };
    case "bottom-right":
      return { bottom: m, right: m };
    default:
      return { top: m, right: m };
  }
};

async function getUrl(path) {
  if (!path) return "";
  if (urlCache[path]) return urlCache[path];
  const url = await getDownloadURL(ref(storage, path));
  urlCache[path] = url;
  return url;
}

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

/* ===============================
   COMPONENT
================================ */
export default function FramePreview({
  selectedFrameId,     // saved frame doc id
  selectedLogos,       // saved logos [{logoId, position}]
  itemsMap,            // { [id]: {storagePath...} }

  // NEW: local pending preview files
  pendingFrameFile,    // File | null
  pendingLogos,        // [{ file: File, position }]
}) {
  const [frameUrl, setFrameUrl] = useState("");
  const [logoUrls, setLogoUrls] = useState({});
  const [err, setErr] = useState("");

  // local object urls (must revoke)
  const localFrameUrlRef = useRef("");
  const localLogoUrlsRef = useRef([]);

  const lastFrameKey = useRef("");
  const lastLogoKey = useRef("");

  const savedLogos = useMemo(() => asArray(selectedLogos), [selectedLogos]);
  const localLogos = useMemo(() => asArray(pendingLogos), [pendingLogos]);

  const savedLogoIds = useMemo(
    () => savedLogos.map((l) => l.logoId).filter(Boolean).sort(),
    [savedLogos]
  );

  /* ===============================
     FRAME: prefer local file > remote saved
  ================================ */
  useEffect(() => {
    let alive = true;
    setErr("");

    // cleanup old local frame URL
    if (localFrameUrlRef.current) {
      URL.revokeObjectURL(localFrameUrlRef.current);
      localFrameUrlRef.current = "";
    }

    // ✅ local preview first
    if (pendingFrameFile) {
      try {
        const u = URL.createObjectURL(pendingFrameFile);
        localFrameUrlRef.current = u;
        setFrameUrl(u);
      } catch {
        setErr("Failed to preview local frame");
        setFrameUrl("");
      }
      return () => {
        alive = false;
      };
    }

    // no local, no saved
    if (!selectedFrameId) {
      lastFrameKey.current = "";
      setFrameUrl("");
      return () => {
        alive = false;
      };
    }

    // prevent reload same
    const key = `remote:${selectedFrameId}`;
    if (lastFrameKey.current === key) return () => { alive = false; };
    lastFrameKey.current = key;

    async function load() {
      const meta = itemsMap?.[selectedFrameId];
      if (!meta?.storagePath) {
        setFrameUrl("");
        return;
      }

      try {
        const u = await getUrl(meta.storagePath);
        if (alive) setFrameUrl(u);
      } catch {
        if (alive) {
          setErr("Failed to load frame");
          setFrameUrl("");
        }
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [pendingFrameFile, selectedFrameId, itemsMap]);

  /* ===============================
     LOGOS: merge remote saved + local pending
  ================================ */
  useEffect(() => {
    let alive = true;
    setErr("");

    // cleanup old local logo urls
    if (localLogoUrlsRef.current.length) {
      for (const u of localLogoUrlsRef.current) URL.revokeObjectURL(u);
      localLogoUrlsRef.current = [];
    }

    const remoteKey = savedLogoIds.join("|");
    const localKey = localLogos
      .map((x) => `${x?.position || ""}:${x?.file?.name || ""}:${x?.file?.size || 0}`)
      .join("|");

    const key = `${remoteKey}::${localKey}`;
    if (lastLogoKey.current === key) return () => { alive = false; };
    lastLogoKey.current = key;

    async function load() {
      const next = {};

      // remote saved logos
      for (const id of savedLogoIds) {
        const meta = itemsMap?.[id];
        if (!meta?.storagePath) continue;
        try {
          next[id] = await getUrl(meta.storagePath);
        } catch {
          if (alive) setErr("Failed to load logo");
        }
      }

      // local pending logos (keys: local-0, local-1...)
      localLogos.forEach((pl, idx) => {
        if (!pl?.file) return;
        try {
          const u = URL.createObjectURL(pl.file);
          localLogoUrlsRef.current.push(u);
          next[`local-${idx}`] = u;
        } catch {
          if (alive) setErr("Failed to preview local logo");
        }
      });

      if (alive) setLogoUrls(next);
    }

    load();
    return () => {
      alive = false;
    };
  }, [savedLogoIds, localLogos, itemsMap]);

  /* ===============================
     RENDER
  ================================ */
  return (
    <div className="h-full">
      <div className="text-sm font-semibold mb-2">プレビュー</div>

      <div className="rounded-xl border border-slate-300 bg-slate-100 p-3">
        <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-black">
          <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm">
            (プレビュー のみ)
          </div>

          {frameUrl && (
            <img
              src={frameUrl}
              alt="frame"
              className="absolute inset-0 w-full h-full object-fill pointer-events-none"
            />
          )}

          {/* saved logos */}
          {savedLogos.map((l) => {
            const u = logoUrls[l.logoId];
            if (!u) return null;
            return (
              <img
                key={`saved-${l.logoId}`}
                src={u}
                alt="logo"
                className="absolute w-20 h-20 object-contain pointer-events-none"
                style={posStyle(l.position)}
              />
            );
          })}

          {/* pending logos */}
          {localLogos.map((pl, idx) => {
            const u = logoUrls[`local-${idx}`];
            if (!u) return null;
            return (
              <img
                key={`local-${idx}`}
                src={u}
                alt="logo"
                className="absolute w-20 h-20 object-contain pointer-events-none"
                style={posStyle(pl.position)}
              />
            );
          })}
        </div>

        {err && <div className="mt-2 text-xs text-red-500">{err}</div>}

        <div className="mt-2 text-xs text-slate-500">.png利用してください。</div>
      </div>
    </div>
  );
}
