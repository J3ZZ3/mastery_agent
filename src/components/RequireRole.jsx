import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { Spinner } from "../components/ui.jsx";

const loginPathFor = (role) =>
  role === "teacher" ? "/portal/teacher/login" : "/portal/student";

const homePathFor = (role) =>
  role === "teacher" ? "/portal/teacher" : "/portal/student/home";

export default function RequireRole({ role, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner />
        <span className="sr-only">Checking your session…</span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to={loginPathFor(role)} replace state={{ from: location.pathname }} />;
  }

  if (user.role !== role) {
    return <Navigate to={homePathFor(user.role)} replace />;
  }

  return children;
}
