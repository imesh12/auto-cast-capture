import { Navigate, useParams, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ClientGuard({ children }) {
  const { user, clientId: authClientId } = useAuth();
  const { clientId: routeClientId } = useParams();
  const location = useLocation();

  // Not logged in → go to tenant login
  if (!user) {
    return (
      <Navigate
        to={`/${routeClientId}/login`}
        replace
        state={{ from: location }}
      />
    );
  }

  // Logged in but tenant mismatch → hard block
  if (routeClientId !== authClientId) {
    return (
      <Navigate
        to={`/${authClientId}/dashboard`}
        replace
      />
    );
  }

  return children;
}
