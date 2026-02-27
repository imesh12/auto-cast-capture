import { Navigate, useLocation } from "react-router-dom";

export default function RedirectToReset() {
  const location = useLocation();
  const search = location.search; // keeps ?oobCode=xxx&mode=xxx

  // forward params to /reset-password route
  return <Navigate to={`/reset-password${search}`} replace />;
}
