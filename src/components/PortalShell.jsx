import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { BookOpen, GraduationCap, LogOut, Sparkles, Users } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useApp } from "../context/AppContext.jsx";
import { Avatar, Badge, Toast } from "./ui.jsx";
import { cx } from "../lib/cx.js";

function Wordmark() {
  return (
    <Link to="/portal" className="flex items-center gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-mint-500 text-sm font-black text-ink-950 shadow-sm">
        M
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-black tracking-[0.14em] text-ink-950">MASTERY</span>
        <span className="block text-[10px] font-medium leading-4 text-slate-500">Classroom pilot</span>
      </span>
    </Link>
  );
}

export default function PortalShell() {
  const { user, logout } = useAuth();
  const { toast, dismissToast } = useApp();
  const navigate = useNavigate();

  const isTeacher = user?.role === "teacher";
  const name = isTeacher ? user?.teacher?.name : user?.student?.displayName;
  const subtitle = isTeacher ? user?.teacher?.email : user?.class?.name;

  const nav = isTeacher
    ? [{ to: "/portal/teacher", label: "Classes", icon: Users, end: true }]
    : [
        { to: "/portal/student/home", label: "My class", icon: BookOpen, end: true },
        { to: "/portal/student/learn", label: "Learn", icon: Sparkles, end: true },
      ];

  const handleLogout = async () => {
    const target = isTeacher ? "/portal/teacher/login" : "/portal/student";
    await logout();
    navigate(target, { replace: true });
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <a href="#portal-main" className="skip-link">
        Skip to main content
      </a>

      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Wordmark />

          <nav aria-label="Classroom" className="order-3 flex w-full items-center gap-1 sm:order-none sm:w-auto">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cx(
                    "flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition",
                    isActive
                      ? "bg-mint-50 text-mint-800 ring-1 ring-inset ring-mint-200"
                      : "text-slate-600 hover:bg-slate-100 hover:text-ink-950",
                  )
                }
              >
                <item.icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
              </NavLink>
            ))}
            <Link
              to="/"
              className="ml-1 flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-ink-950"
            >
              <GraduationCap className="h-4 w-4" aria-hidden="true" />
              Demo workspace
            </Link>
          </nav>

          <div className="flex items-center gap-3">
            {user ? (
              <>
                <div className="hidden text-right sm:block">
                  <p className="max-w-[14rem] truncate text-sm font-semibold text-ink-950">{name}</p>
                  <p className="max-w-[14rem] truncate text-[11px] text-slate-500">{subtitle}</p>
                </div>
                <Avatar name={name} accent={isTeacher ? "mint" : "sky"} size="sm" />
                <Badge tone={isTeacher ? "mint" : "sky"}>{isTeacher ? "Teacher" : "Student"}</Badge>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-ink-950"
                  aria-label="Sign out"
                  title="Sign out"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                </button>
              </>
            ) : null}
          </div>
        </div>
      </header>

      <main id="portal-main" className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <Outlet />
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-8 text-xs leading-5 text-slate-500 sm:px-6">
        <p>
          Classroom pilot. Student accounts are managed by the teacher; no student email is required.
          Diagnoses remain evidence-supported hypotheses, and the teacher makes the final educational decision.
        </p>
      </footer>

      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  );
}
