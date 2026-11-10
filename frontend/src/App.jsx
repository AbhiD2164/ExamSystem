// src/App.js
import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { AuthProvider, useAuth } from "./context/AuthContext";

// Auth Pages
import LoginPage       from "./pages/LoginPage";
import RegisterPage    from "./pages/RegisterPage";
import PasswordResetPage from "./pages/PasswordResetPage";
import CommunityPage from "./pages/CommunityPage";
import JoinByInvitePage from "./pages/JoinByInvitePage";

// Admin Pages
import AdminDashboard       from "./pages/admin/AdminDashboard";
import AdminUsers           from "./pages/admin/AdminUsers";
import AdminUserDetail      from "./pages/admin/AdminUserDetail";

// Examiner Pages
import ExaminerDashboard    from "./pages/examiner/ExaminerDashboard";
import ExaminerExamList     from "./pages/examiner/ExaminerExamList";
import ExaminerExamCreate   from "./pages/examiner/ExaminerExamCreate";
import ExaminerExamEdit     from "./pages/examiner/ExaminerExamEdit";
import ExaminerExamDetail   from "./pages/examiner/ExaminerExamDetail";
import ExaminerResults      from "./pages/examiner/ExaminerResults";

// Student Pages
import StudentDashboard     from "./pages/student/StudentDashboard";
import StudentExamList      from "./pages/student/StudentExamList";
import StudentExamRoom      from "./pages/student/StudentExamRoom";
import StudentResults       from "./pages/student/StudentResults";

// 404 Not Found Page
import NotFoundPage         from "./pages/NotFoundPage";
import ThemeToggle from "./components/common/ThemeToggle";

// ── Route Guards ──────────────────────────────────────────────────────────────

function RequireRole({ roles, children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to="/unauthorized" replace />;
  return children;
}

function PublicOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) {
    if (user.role === "admin") return <Navigate to="/admin" replace />;
    return <Navigate to="/student" replace />;
  }
  return children;
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" toastOptions={{ duration: 5000 }} />
        <ThemeToggle />
        <Routes>
          {/* Public */}
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login"    element={<PublicOnly><LoginPage /></PublicOnly>} />
          <Route path="/register" element={<PublicOnly><RegisterPage /></PublicOnly>} />
          <Route path="/password-reset" element={<PublicOnly><PasswordResetPage /></PublicOnly>} />
          <Route path="/unauthorized" element={<div style={{padding:40}}>You are not authorized to view this page.</div>} />

          {/* Community Invite Link — accessible regardless of auth state */}
          <Route path="/join/:token" element={<JoinByInvitePage />} />

          {/* Admin */}
          <Route path="/admin" element={<RequireRole roles={["admin"]}><AdminDashboard /></RequireRole>} />
          <Route path="/admin/users" element={<RequireRole roles={["admin"]}><AdminUsers /></RequireRole>} />
          <Route path="/admin/users/:id" element={<RequireRole roles={["admin"]}><AdminUserDetail /></RequireRole>} />

          {/* Examiner */}
          <Route path="/examiner" element={<RequireRole roles={["user", "examiner", "admin"]}><ExaminerDashboard /></RequireRole>} />
          <Route path="/examiner/exams" element={<RequireRole roles={["user", "examiner", "admin"]}><ExaminerExamList /></RequireRole>} />
          <Route path="/examiner/exams/create" element={<RequireRole roles={["user", "examiner", "admin"]}><ExaminerExamCreate /></RequireRole>} />
          <Route path="/examiner/exams/:id" element={<RequireRole roles={["user", "examiner", "admin"]}><ExaminerExamDetail /></RequireRole>} />
          <Route path="/examiner/exams/:id/edit" element={<RequireRole roles={["user", "examiner", "admin"]}><ExaminerExamEdit /></RequireRole>} />
          <Route path="/examiner/exams/:id/results" element={<RequireRole roles={["user", "examiner", "admin"]}><ExaminerResults /></RequireRole>} />

          {/* Student */}
          <Route path="/student" element={<RequireRole roles={["user"]}><StudentDashboard /></RequireRole>} />
          <Route path="/student/exams" element={<RequireRole roles={["user"]}><StudentExamList /></RequireRole>} />
          <Route path="/student/exams/:id/room" element={<RequireRole roles={["user"]}><StudentExamRoom /></RequireRole>} />
          <Route path="/student/results" element={<RequireRole roles={["user"]}><StudentResults /></RequireRole>} />
          <Route path="/communities" element={<RequireRole roles={["user", "admin"]}><CommunityPage /></RequireRole>} />

          {/* 404 Catch-All */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
