import { Navigate, Route, Routes } from "react-router-dom";
import PortalShell from "./components/PortalShell.jsx";
import RequireRole from "./components/RequireRole.jsx";
import PortalLanding from "./pages/portal/PortalLanding.jsx";
import PrivacyNotice from "./pages/portal/PrivacyNotice.jsx";
import TeacherLogin from "./pages/portal/TeacherLogin.jsx";
import TeacherSignup from "./pages/portal/TeacherSignup.jsx";
import TeacherForgotPassword from "./pages/portal/TeacherForgotPassword.jsx";
import TeacherResetPassword from "./pages/portal/TeacherResetPassword.jsx";
import TeacherVerifyEmail from "./pages/portal/TeacherVerifyEmail.jsx";
import StudentJoin from "./pages/portal/StudentJoin.jsx";
import TeacherClasses from "./pages/portal/TeacherClasses.jsx";
import TeacherClassDetail from "./pages/portal/TeacherClassDetail.jsx";
import TeacherResources from "./pages/portal/TeacherResources.jsx";
import ClassroomStudentProgress from "./pages/portal/ClassroomStudentProgress.jsx";
import StudentHome from "./pages/portal/StudentHome.jsx";
import StudentLearning from "./pages/portal/StudentLearning.jsx";

function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-soft">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">404</p>
        <h1 className="mt-2 text-2xl font-bold text-ink-950">Page not found</h1>
        <p className="mt-2 text-sm text-slate-600">The page you requested does not exist.</p>
        <a href="/portal" className="mt-5 inline-flex rounded-xl bg-ink-950 px-4 py-2 text-sm font-semibold text-white">Go to class portal</a>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route index element={<Navigate to="/portal" replace />} />
      <Route path="portal" element={<PortalLanding />} />
      <Route path="privacy" element={<PrivacyNotice />} />
      <Route path="portal/teacher/login" element={<TeacherLogin />} />
      <Route path="portal/teacher/signup" element={<TeacherSignup />} />
      <Route path="portal/teacher/forgot-password" element={<TeacherForgotPassword />} />
      <Route path="portal/teacher/reset-password" element={<TeacherResetPassword />} />
      <Route path="portal/teacher/verify-email" element={<TeacherVerifyEmail />} />
      <Route path="portal/student" element={<StudentJoin />} />

      <Route element={<PortalShell />}>
        <Route
          path="portal/teacher"
          element={
            <RequireRole role="teacher">
              <TeacherClasses />
            </RequireRole>
          }
        />
        <Route
          path="portal/teacher/classes/:classId"
          element={
            <RequireRole role="teacher">
              <TeacherClassDetail />
            </RequireRole>
          }
        />
        <Route
          path="portal/teacher/resources"
          element={
            <RequireRole role="teacher">
              <TeacherResources />
            </RequireRole>
          }
        />
        <Route
          path="portal/teacher/classes/:classId/students/:studentId"
          element={
            <RequireRole role="teacher">
              <ClassroomStudentProgress />
            </RequireRole>
          }
        />
        <Route
          path="portal/student/home"
          element={
            <RequireRole role="student">
              <StudentHome />
            </RequireRole>
          }
        />
        <Route
          path="portal/student/learn"
          element={
            <RequireRole role="student">
              <StudentLearning />
            </RequireRole>
          }
        />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
