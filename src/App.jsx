import { Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./components/AppShell.jsx";
import PortalShell from "./components/PortalShell.jsx";
import RequireRole from "./components/RequireRole.jsx";
import Overview from "./pages/Overview.jsx";
import LearnerWorkspace from "./pages/LearnerWorkspace.jsx";
import AgentActivity from "./pages/AgentActivity.jsx";
import TeacherDashboard from "./pages/TeacherDashboard.jsx";
import TeacherLearnerDetail from "./pages/TeacherLearnerDetail.jsx";
import NotFound from "./pages/NotFound.jsx";
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
import ClassroomStudentProgress from "./pages/portal/ClassroomStudentProgress.jsx";
import StudentHome from "./pages/portal/StudentHome.jsx";
import StudentLearning from "./pages/portal/StudentLearning.jsx";

export default function App() {
  return (
    <Routes>
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

      <Route element={<AppShell />}>
        <Route index element={<Overview />} />
        <Route path="learner" element={<LearnerWorkspace />} />
        <Route path="activity" element={<AgentActivity />} />
        <Route path="teacher" element={<TeacherDashboard />} />
        <Route path="teacher/learners/:learnerId" element={<TeacherLearnerDetail />} />
        <Route path="home" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
