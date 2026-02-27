export default function TestButton({ clientId, cameraId, frameIds, logoSelections, onPreview }) {
  async function test() {
    const res = await fetch(`${API_BASE}/frames/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, cameraId, frameIds, logoSelections }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Test failed");

    onPreview(`${API_BASE}${data.previewUrl}?t=${Date.now()}`);
  }

  return (
    <button onClick={test} className="px-3 py-2 rounded bg-blue-600">
      Test
    </button>
  );
}
