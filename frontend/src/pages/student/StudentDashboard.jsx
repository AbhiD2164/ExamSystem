// src/pages/student/StudentDashboard.js
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "../../components/common/Sidebar";
import { examAPI, resultsAPI } from "../../api/client";
import { useAuth } from "../../context/AuthContext";

const LINKS = [
  { label: "Dashboard", path: "/student",         icon: "⬛" },
  { label: "My Exams",  path: "/student/exams",    icon: "📝" },
  { label: "Results",   path: "/student/results",  icon: "📊" },
];

export default function StudentDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [exams, setExams]     = useState([]);
  const [results, setResults] = useState([]);

  useEffect(() => {
    examAPI.myExams().then(({ data }) => setExams(data)).catch(() => {});
    resultsAPI.myResults().then(({ data }) => setResults(data)).catch(() => {});
  }, []);

  const upcoming = exams.filter((e) => new Date(e.start_datetime) > new Date());
  const active   = exams.filter((e) => e.is_joinable);

  return (
    <div className="layout">
      <Sidebar role="student" links={LINKS} />
      <main className="main-content">
        <div className="page-header">
          <h1>Welcome, {user?.full_name} 👋</h1>
          <p>Your assessments and community workspace</p>
          {user?.can_create_exam && (
            <button className="btn btn-primary mt-2" onClick={() => navigate("/examiner")}>
              Open exam creator workspace
            </button>
          )}
        </div>

        <div className="stat-grid">
          <div className="stat-card">
            <div className="label">Accessible Exams</div>
            <div className="value mint">{exams.length}</div>
          </div>
          <div className="stat-card">
            <div className="label">Live Active Now</div>
            <div className="value green">{active.length}</div>
          </div>
          <div className="stat-card">
            <div className="label">Upcoming Scheduled</div>
            <div className="value blue">{upcoming.length}</div>
          </div>
          <div className="stat-card">
            <div className="label">Published Results</div>
            <div className="value gold">{results.length}</div>
          </div>
        </div>

        {active.length > 0 && (
          <div className="alert alert-success" style={{ marginBottom: 24, display: "flex", justifyContent: "space-between" }}>
            <div>
              🟢 <strong>{active.length}</strong> active exam{active.length > 1 ? "s" : ""} available to take right now!
            </div>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => navigate("/student/exams")}
            >
              Enter Exam Room →
            </button>
          </div>
        )}

        <div className="card">
          <div className="card-title">Upcoming & Eligible Exams</div>
          {upcoming.length === 0 ? (
            <p className="text-muted">No scheduled upcoming exams.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Exam Title</th>
                    <th>Created by</th>
                    <th>Assessment Type</th>
                    <th>Date & Time</th>
                    <th>Duration</th>
                    <th>Results Release</th>
                  </tr>
                </thead>
                <tbody>
                  {upcoming.slice(0, 6).map((ex) => (
                    <tr key={ex.id}>
                      <td><strong>{ex.title}</strong></td>
                      <td className="text-muted">{ex.created_by_name || "Examiner"}</td>
                      <td>
                        <span className="badge badge-purple">{ex.assessment_type?.replaceAll("_", " ")}</span>
                      </td>
                      <td className="text-muted">{new Date(ex.start_datetime).toLocaleString()}</td>
                      <td className="text-muted">{ex.duration_minutes} mins</td>
                      <td className="text-muted">
                        {ex.results_visible_from ? new Date(ex.results_visible_from).toLocaleDateString() : "TBA"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
