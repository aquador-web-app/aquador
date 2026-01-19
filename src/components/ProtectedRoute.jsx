import { Navigate, useLocation } from "react-router-dom"
import { useAuth } from "../context/AuthContext"

export default function ProtectedRoute({ roles, children }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
  return (
    <div className="min-h-screen flex items-center justify-center text-gray-500">
      Chargement…
    </div>
  );
}


  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname }}
      />
    )
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/" replace />
  }

  return children
}
