import { lazy, Suspense } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AnimatePresence, LayoutGroup } from "framer-motion";

import ProtectedRoute from "@/app/router/ProtectedRoute";

const AppLayout = lazy(() => import("@/shared/layout/AppLayout"));
const Welcome = lazy(() => import("@/features/student/pages/Welcome"));
const LoginPage = lazy(() => import("@/features/auth/pages/LoginPage"));
const ForgotPassword = lazy(() => import("@/features/auth/pages/ForgotPassword"));
const RoleSelectPage = lazy(() => import("@/features/auth/pages/RoleSelectPage"));
const RegisterPage = lazy(() => import("@/features/auth/pages/RegisterPage"));
const MFAPage = lazy(() => import("@/features/auth/pages/MFAPage"));
const GoogleCompletePage = lazy(() => import("@/features/auth/pages/GoogleCompletePage"));
const PrivacyPage = lazy(() => import("@/features/auth/pages/PrivacyPage"));

const LecturerLayout = lazy(() => import("@/features/lecturer/layout/LecturerLayout"));
const LecturerDashboard = lazy(() => import("@/features/lecturer/pages/LecturerDashboard"));
const LecturerClassesPage = lazy(() => import("@/features/lecturer/pages/LecturerClassesPage"));
const LecturerAssignmentsPage = lazy(() => import("@/features/lecturer/pages/LecturerAssignmentsPage"));
const LecturerReportsPage = lazy(() => import("@/features/lecturer/pages/LecturerReportsPage"));
const LecturerMarkingPage = lazy(() => import("@/features/lecturer/pages/LecturerMarkingPage"));
const LecturerMessagesPage = lazy(() => import("@/features/lecturer/pages/LecturerMessagesPage"));
const LecturerStudentsPage = lazy(() => import("@/features/lecturer/pages/LecturerStudentsPage"));
const LecturerSettingsPage = lazy(() => import("@/features/lecturer/pages/LecturerSettingsPage"));
const LecturerHelpPage = lazy(() => import("@/features/lecturer/pages/LecturerHelpPage"));

const StudentLayout = lazy(() => import("@/features/student/layout/StudentLayout"));
const StudentDashboardPage = lazy(() => import("@/features/student/pages/StudentDashboardPage"));
const StudentClassesPage = lazy(() => import("@/features/student/pages/StudentClassesPage"));
const StudentAssignmentsPage = lazy(() => import("@/features/student/pages/StudentAssignmentsPage"));
const StudentReportsPage = lazy(() => import("@/features/student/pages/StudentReportsPage"));
const StudentMessagesPage = lazy(() => import("@/features/student/pages/StudentMessagesPage"));
const StudentHelpPage = lazy(() => import("@/features/student/pages/StudentHelpPage"));
const StudentSettingsPage = lazy(() => import("@/features/student/pages/StudentSettingsPage"));

const AdminDashboard = lazy(() => import("@/features/admin/pages/AdminDashboard"));
const AdminLayout = lazy(() => import("@/features/admin/layout/AdminLayout"));
const AdminUsers = lazy(() => import("@/features/admin/pages/AdminUsers"));
const AdminClasses = lazy(() => import("@/features/admin/pages/AdminClasses"));
const AdminReports = lazy(() => import("@/features/admin/pages/AdminReports"));
const AdminCommunications = lazy(() => import("@/features/admin/pages/AdminCommunication"));
const AdminHelp = lazy(() => import("@/features/admin/pages/AdminHelp"));
const AdminSettings = lazy(() => import("@/features/admin/pages/AdminSettings"));

function RouteLoadingFallback() {
  return (
    <div className="grid min-h-screen place-items-center bg-slate-950 text-sm font-semibold tracking-wide text-slate-300" role="status">
      Loading EduGuard…
    </div>
  );
}

export default function AppRoutes() {
  const location = useLocation();

  return (
    <LayoutGroup id="auth-role-flow">
      <AnimatePresence mode="wait" initial={false}>
        <Suspense fallback={<RouteLoadingFallback />}>
          <Routes location={location} key={location.pathname}>
          {/* Global Layout wraps EVERYTHING */}
          <Route path="/" element={<AppLayout />}>
            {/* Public */}
            <Route index element={<Welcome />} />
            <Route path="login" element={<LoginPage />} />
            <Route path="forgot-password" element={<ForgotPassword />} />
            <Route path="login/mfa" element={<MFAPage />} />
            <Route path="register" element={<RoleSelectPage />} />
            <Route path="register/choose" element={<RoleSelectPage />} />
            <Route path="register/:role" element={<RegisterPage />} />
            <Route path="google/complete" element={<GoogleCompletePage />} />
            <Route path="privacy" element={<PrivacyPage />} />

            {/* Student */}
            <Route
              path="student"
              element={
                <ProtectedRoute allow={["student"]}>
                  <StudentLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<StudentDashboardPage />} />
              <Route path="classes" element={<StudentClassesPage />} />
              <Route path="assignments" element={<StudentAssignmentsPage />} />
              <Route path="reports" element={<StudentReportsPage />} />
              <Route path="messages" element={<StudentMessagesPage />} />
              <Route path="help" element={<StudentHelpPage />} />
              <Route path="settings" element={<StudentSettingsPage />} />
            </Route>

            {/* Lecturer */}
<Route
  path="lecturer"
  element={
    <ProtectedRoute allow={["lecturer"]}>
      <LecturerLayout />
    </ProtectedRoute>
  }
>
  <Route index element={<Navigate to="dashboard" replace />} />

  <Route path="dashboard" element={<LecturerDashboard />} />

  <Route path="classes" element={<LecturerClassesPage />} />

  {/*
    Safety redirect:
    If old dashboard buttons or old links use /lecturer/class/:classId,
    redirect them to the real classes page instead of falling into login.
  */}
  <Route
    path="class/:classId"
    element={<Navigate to="/lecturer/classes" replace />}
  />

  <Route path="assignments" element={<LecturerAssignmentsPage />} />
  <Route path="reports" element={<LecturerReportsPage />} />
  <Route path="marking" element={<LecturerMarkingPage />} />
  <Route path="messages" element={<LecturerMessagesPage />} />
  <Route path="students" element={<LecturerStudentsPage />} />
  <Route path="settings" element={<LecturerSettingsPage />} />
  <Route path="help" element={<LecturerHelpPage />} />
</Route>

            {/* Admin */}
            <Route
              path="admin"
              element={
                <ProtectedRoute allow={["admin"]}>
                  <AdminLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<AdminDashboard />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="classes" element={<AdminClasses />} />
              <Route path="reports" element={<AdminReports />} />
              <Route path="communications" element={<AdminCommunications />} />
              <Route path="help" element={<AdminHelp />} />
              <Route path="settings" element={<AdminSettings />} />
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Route>
          </Routes>
        </Suspense>
      </AnimatePresence>
    </LayoutGroup>
  );
}
