import DashboardCards from "../components/DashboardCards";
import DashboardCameraTable from "../components/DashboardCameraTable";
import TodoPanel from "../components/TodoPanel";


export default function DashboardPage({ camera }) {
  return (
    <>
      <DashboardCards cameras={camera} />

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <DashboardCameraTable cameras={camera} />
        </div>
        <TodoPanel />
      </div>
    </>
  );
}
