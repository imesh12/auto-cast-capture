import { Navigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ children }) {
  const { user, clientId: authClientId } = useAuth();
  const { clientId: routeClientId } = useParams();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (routeClientId && routeClientId !== authClientId) {
    return <Navigate to={`/${authClientId}`} replace />;
  }

  return children;
}
