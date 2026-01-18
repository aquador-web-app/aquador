import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function AuthGate({ children, redirectTo = "/login" }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Chargement…
      </div>
    );
  }

  if (!user) {
    return <Navigate to={redirectTo} replace />;
  }

  return children;
}
