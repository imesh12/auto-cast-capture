import React, { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";

function startOfDay(dateStr) {
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return d;
}
function endOfDay(dateStr) {
  const d = new Date(dateStr);
  d.setHours(23, 59, 59, 999);
  return d;
}
function dateKeyFromTs(ts) {
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function yen(n) {
  return Number(n || 0).toLocaleString("ja-JP");
}

export default function ReportPage() {
  const { clientId } = useAuth();

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [cameraId, setCameraId] = useState("ALL");

  const [cameras, setCameras] = useState([]);
  const [rows, setRows] = useState([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      if (!clientId) return;
      try {
        const snap = await getDocs(collection(db, "clients", clientId, "cameras"));
        const list = snap.docs.map((d) => ({
          id: d.id,
          name: d.data()?.cameraName || d.data()?.name || d.id,
        }));
        list.sort((a, b) => a.name.localeCompare(b.name, "ja"));
        setCameras(list);
      } catch (e) {
        console.error(e);
        setError("Failed to load cameras.");
      }
    })();
  }, [clientId]);

  async function createReport() {
    setError("");
    setRows([]);

    if (!clientId) return setError("Missing clientId.");
    if (!startDate || !endDate) return setError("Please select start date and end date.");

    const sd = startOfDay(startDate);
    const ed = endOfDay(endDate);
    if (sd > ed) return setError("Start date must be before end date.");

    setLoading(true);
    try {
      const ref = collection(db, "clients", clientId, "captures");

      let qy;
      if (cameraId === "ALL") {
        qy = query(
          ref,
          where("createdAt", ">=", sd),
          where("createdAt", "<=", ed),
          orderBy("createdAt", "asc")
        );
      } else {
        qy = query(
          ref,
          where("cameraId", "==", cameraId),
          where("createdAt", ">=", sd),
          where("createdAt", "<=", ed),
          orderBy("createdAt", "asc")
        );
      }

      const snap = await getDocs(qy);
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      const map = new Map();

      for (const c of docs) {
        const day = dateKeyFromTs(c.createdAt);

        const bucket = c.captureBucket || "image";
        const isPaid = c.paymentPhase === "paid";
        const amountPaid = isPaid ? Number(c.amountPaid || 0) : 0;

        if (!map.has(day)) {
          map.set(day, {
            date: day,
            captureTotal: 0,
            paidTotal: 0,
            imageCount: 0,
            video3sCount: 0,
            video15sCount: 0,
            earnTotal: 0,
          });
        }

        const r = map.get(day);
        r.captureTotal += 1;
        if (isPaid) r.paidTotal += 1;

        if (bucket === "image") r.imageCount += 1;
        else if (bucket === "video_3s") r.video3sCount += 1;
        else if (bucket === "video_15s") r.video15sCount += 1;

        r.earnTotal += amountPaid;
      }

      const result = Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
      setRows(result);
    } catch (e) {
      console.error(e);
      setError("Failed to create report. Firestore may require an index (cameraId + createdAt).");
    } finally {
      setLoading(false);
    }
  }

  const totals = useMemo(() => {
    const t = { captureTotal: 0, paidTotal: 0, imageCount: 0, video3sCount: 0, video15sCount: 0, earnTotal: 0 };
    for (const r of rows) {
      t.captureTotal += r.captureTotal;
      t.paidTotal += r.paidTotal;
      t.imageCount += r.imageCount;
      t.video3sCount += r.video3sCount;
      t.video15sCount += r.video15sCount;
      t.earnTotal += r.earnTotal;
    }
    return t;
  }, [rows]);

  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: "0 auto" }}>
      <h2 style={{ marginBottom: 12 }}>Report</h2>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 12, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
        <div>
          <div style={{ fontSize: 12, color: "#64748b" }}>Start date</div>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }} />
        </div>

        <div>
          <div style={{ fontSize: 12, color: "#64748b" }}>End date</div>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }} />
        </div>

        <div>
          <div style={{ fontSize: 12, color: "#64748b" }}>Camera</div>
          <select value={cameraId} onChange={(e) => setCameraId(e.target.value)} style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}>
            <option value="ALL">All cameras</option>
            {cameras.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <button onClick={createReport} disabled={loading} style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #3b82f6", background: loading ? "#93c5fd" : "#3b82f6", color: "#fff", fontWeight: 800 }}>
          {loading ? "Creating..." : "Create report"}
        </button>
      </div>

      {error && <div style={{ marginTop: 12, padding: 10, borderRadius: 10, background: "#fee2e2", color: "#b91c1c" }}>{error}</div>}

      {rows.length > 0 && (
        <>
          <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Stat label="Capture total" value={totals.captureTotal} />
            <Stat label="Paid total" value={totals.paidTotal} />
            <Stat label="Image count" value={totals.imageCount} />
            <Stat label="3sec count" value={totals.video3sCount} />
            <Stat label="15sec count" value={totals.video15sCount} />
            <Stat label="Earn total (JPY)" value={`¥${yen(totals.earnTotal)}`} />
          </div>

          <div style={{ marginTop: 14, overflowX: "auto", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  <Th>Date</Th><Th>Capture</Th><Th>Paid</Th><Th>Image</Th><Th>3sec</Th><Th>15sec</Th><Th>Earn</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.date} style={{ borderTop: "1px solid #e5e7eb" }}>
                    <Td>{r.date}</Td>
                    <Td>{r.captureTotal}</Td>
                    <Td>{r.paidTotal}</Td>
                    <Td>{r.imageCount}</Td>
                    <Td>{r.video3sCount}</Td>
                    <Td>{r.video15sCount}</Td>
                    <Td>¥{yen(r.earnTotal)}</Td>
                  </tr>
                ))}
                <tr style={{ borderTop: "2px solid #cbd5e1", background: "#f1f5f9", fontWeight: 900 }}>
                  <Td>Total</Td>
                  <Td>{totals.captureTotal}</Td>
                  <Td>{totals.paidTotal}</Td>
                  <Td>{totals.imageCount}</Td>
                  <Td>{totals.video3sCount}</Td>
                  <Td>{totals.video15sCount}</Td>
                  <Td>¥{yen(totals.earnTotal)}</Td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{ minWidth: 170, padding: 12, border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff" }}>
      <div style={{ fontSize: 12, color: "#64748b" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 900 }}>{value}</div>
    </div>
  );
}
function Th({ children }) { return <th style={{ textAlign: "left", padding: 12, fontSize: 12, color: "#475569", whiteSpace: "nowrap" }}>{children}</th>; }
function Td({ children }) { return <td style={{ padding: 12, whiteSpace: "nowrap" }}>{children}</td>; }
