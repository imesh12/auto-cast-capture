import CameraTable from "../components/CameraTable";

export default function CamerasPage({ cameras, setCameras }) {
  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Manage Cameras</h2>
      <CameraTable cameras={cameras} setCameras={setCameras} allowEdit={true} />
    </div>
  );
}
