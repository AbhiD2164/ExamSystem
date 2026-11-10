// src/pages/examiner/ExaminerDashboard.js
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "../../components/common/Sidebar";
import { examAPI } from "../../api/client";
import { useAuth } from "../../context/AuthContext";

const LINKS = [
  { label: "Dashboard",   path: "/examiner",         icon: "⬛" },
  { label: "My Exams",    path: "/examiner/exams",    icon: "📋" },
];

export default function ExaminerDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [exams, setExams] = useState([]);

  useEffect(() => {
    examAPI.list().then(({ data }) => setExams(data)).catch(() => {});
  }, []);

  const stats = {
    total: exams.length,
    published: exams.filter((e) => e.status === "published").length,
    draft: exams.filter((e) => e.status === "draft").length,
  };

  if (!user?.can_create_exam) {
    return (
      <div className="layout">
        <Sidebar role="examiner" links={LINKS} />
        <main className="main-content">
          <div className="page-header"><h1>Community workspace</h1></div>
          <div className="alert alert-warning">
            Your account is not an exam creator in a community yet. Create a community or ask its owner to grant you exam-creator access.
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="layout">
      <Sidebar role="examiner" links={LINKS} />
      <main className="main-content">
        <div className="page-header flex-between">
          <div>
            <h1>Welcome, {user.full_name}</h1>
            <p>Assessments managed by your communities</p>
          </div>
          <button className="btn btn-primary" onClick={() => navigate("/examiner/exams/create")}>
            + New Exam
          </button>
        </div>

        <div className="stat-grid">
          <div className="stat-card"><div className="label">Total Exams</div><div className="value gold">{stats.total}</div></div>
          <div className="stat-card"><div className="label">Published</div><div className="value green">{stats.published}</div></div>
          <div className="stat-card"><div className="label">Drafts</div><div className="value">{stats.draft}</div></div>
        </div>

        <div className="card">
          <div className="card-title">Recent Exams</div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Title</th><th>Status</th><th>Start</th><th>Duration</th><th></th></tr>
              </thead>
              <tbody>
                {exams.slice(0, 5).map((ex) => (
                  <tr key={ex.id}>
                    <td>{ex.title}</td>
                    <td><span className={`badge ${ex.status === "published" ? "badge-green" : "badge-gray"}`}>{ex.status}</span></td>
                    <td className="text-muted">{new Date(ex.start_datetime).toLocaleString()}</td>
                    <td className="text-muted">{ex.duration_minutes} min</td>
                    <td><button className="btn btn-ghost btn-sm" onClick={() => navigate(`/examiner/exams/${ex.id}`)}>View</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {exams.length === 0 && <p className="text-muted mt-3">No exams yet. Create one to get started.</p>}
          </div>
        </div>
      </main>
    </div>
  );
}
