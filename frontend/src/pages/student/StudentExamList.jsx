// src/pages/student/StudentExamList.js
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "../../components/common/Sidebar";
import { examAPI } from "../../api/client";

const LINKS = [
  { label: "Dashboard", path: "/student",         icon: "⬛" },
  { label: "My Exams",  path: "/student/exams",    icon: "📝" },
  { label: "Results",   path: "/student/results",  icon: "📊" },
];

export default function StudentExamList() {
  const navigate = useNavigate();
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    examAPI.myExams()
      .then(({ data }) => setExams(data))
      .finally(() => setLoading(false));
  }, []);

  const now = new Date();

  const getStatus = (ex) => {
    if (["submitted", "auto_submitted", "disqualified"].includes(ex.submission_status)) {
      return { label: "Assessment given", cls: "badge-gray" };
    }
    if (ex.submission_status === "ongoing") return { label: "In progress", cls: "badge-blue" };
    const start = new Date(ex.start_datetime);
    const end   = new Date(ex.end_datetime);
    if (now < start) return { label: "Upcoming", cls: "badge-blue" };
    if (now >= start && now <= end) return { label: "Active Now", cls: "badge-green" };
    return { label: "Ended", cls: "badge-gray" };
  };

  return (
    <div className="layout">
      <Sidebar role="student" links={LINKS} />
      <main className="main-content">
        <div className="page-header">
          <h1>My Exams & Assessments</h1>
          <p>Only allowlisted assessments for communities you have been approved to join appear here.</p>
        </div>

        {loading ? (
          <p className="text-muted">Loading your authorized exams…</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 18 }}>
            {exams.map((ex) => {
              const st = getStatus(ex);
              const canEnter = ex.is_joinable && !["submitted", "auto_submitted", "disqualified"].includes(ex.submission_status);
              return (
                <div
                  key={ex.id}
                  className="card"
                  style={{
                    cursor: canEnter ? "pointer" : "default",
                    display: "flex",
                    flexDirection: "column",
                  }}
                  onClick={() => {
                    if (canEnter) navigate(`/student/exams/${ex.id}/room`);
                  }}
                >
                  <div className="flex-between mb-3">
                    <span className={`badge ${st.cls}`}>{st.label}</span>
                    <span className="badge badge-purple">🔒 Authorized</span>
                  </div>

                  <h3 style={{ fontSize: 18, marginBottom: 8, color: "var(--text)" }}>{ex.title}</h3>
                  <div className="text-muted" style={{ fontSize: 12, marginBottom: 8 }}>
                    {ex.assessment_type?.replaceAll("_", " ")}
                  </div>
                  {ex.description && (
                    <p className="text-muted" style={{ fontSize: 13, marginBottom: 12, flex: 1 }}>
                      {ex.description.slice(0, 110)}{ex.description.length > 110 ? "..." : ""}
                    </p>
                  )}

                  <div style={{ background: "var(--surface2)", borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13 }}>
                    <div className="text-muted" style={{ marginBottom: 4 }}>
                      📅 <strong>Schedule:</strong> {new Date(ex.start_datetime).toLocaleString()}
                    </div>
                    <div className="text-muted" style={{ marginBottom: 4 }}>
                      ⏱ <strong>Duration:</strong> {ex.duration_minutes} minutes
                    </div>
                    <div className="text-muted">
                      📊 <strong>Results:</strong> {ex.results_visible_from ? new Date(ex.results_visible_from).toLocaleDateString() : "Pending"}
                    </div>
                  </div>

                  {canEnter ? (
                    <button
                      className="btn btn-primary"
                      style={{ width: "100%" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/student/exams/${ex.id}/room`);
                      }}
                    >
                      Enter Secure Exam Room →
                    </button>
                  ) : (
                    <button className="btn btn-ghost" style={{ width: "100%" }} disabled>
                      {["submitted", "auto_submitted", "disqualified"].includes(ex.submission_status)
                        ? "Assessment already given"
                        : new Date(ex.start_datetime) > now ? "Starts Soon" : "Exam Ended"}
                    </button>
                  )}
                </div>
              );
            })}
            {exams.length === 0 && (
              <div className="card" style={{ gridColumn: "1 / -1" }}>
                <p className="text-muted">
                  No assessments are currently assigned to your verified email. Request community membership or contact an assessment administrator.
                </p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
