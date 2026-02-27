//src/components/frames/SaveOverlayButton.jsx
import { db } from "../../firebase";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";

export default function SaveOverlayButton({
  clientId,
  cameraId,
  frameIds,
  logos,
}) {
  async function save() {
    if (!cameraId) {
      alert("Select a camera first");
      return;
    }

    const ref = doc(db, "clients", clientId, "cameras", cameraId);

    await updateDoc(ref, {
      overlay: {
        frameId: frameIds.length ? frameIds[0] : null,
        logos: logos,
        updatedAt: serverTimestamp(),
      },
    });

    alert("Overlay settings saved for this camera");
  }

  return (
    <button
      onClick={save}
      className="w-full py-2 rounded bg-green-600 hover:bg-green-700 text-white"
    >
      カメラに保存
    </button>
  );
}
