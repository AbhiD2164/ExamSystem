// src/pages/student/StudentResults.js
import React, { useEffect, useState } from "react";
import Sidebar from "../../components/common/Sidebar";
import { resultsAPI } from "../../api/client";

const LINKS = [
  { label: "Dashboard", path: "/student",         icon: "⬛" },
  { label: "My Exams",  path: "/student/exams",    icon: "📝" },
  { label: "Results",   path: "/student/results",  icon: "📊" },
];

export default function StudentResults() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    resultsAPI.myResults()
      .then(({ data }) => setResults(data))
      .finally(() => setLoading(false));
  }, []);

  const pct = (s) => (s.total_marks ? Math.round((Number(s.score) / Number(s.total_marks)) * 100) : 0);

  return (
    <div className="layout">
      <Sidebar role="student" links={LINKS} />
      <main className="main-content">
        <div className="page-header">
          <h1>Assessment Results & AI Feedback</h1>
          <p>Detailed performance breakdown and intelligent rubric evaluation</p>
        </div>

        {loading ? (
          <p className="text-muted">Loading your results…</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: selected ? "1fr 440px" : "1fr", gap: 24 }}>
            <div>
              {results.length === 0 && (
                <div className="card">
                  <p className="text-muted">
                    No results available yet. Results are published automatically on the examiner-scheduled release date.
                  </p>
                </div>
              )}
              {results.map((r) => (
                <div
                  key={r.id}
                  className="card"
                  style={{
                    marginBottom: 16,
                    cursor: "pointer",
                    borderColor: selected?.id === r.id ? "var(--accent)" : "var(--border)",
                  }}
                  onClick={() => setSelected(selected?.id === r.id ? null : r)}
                >
                  <div className="flex-between">
                    <div>
                      <h3 style={{ fontSize: 18, marginBottom: 4, color: "var(--text)" }}>{r.exam_title}</h3>
                      <div className="text-muted" style={{ fontSize: 13 }}>
                        📅 Completed: {r.submitted_at ? new Date(r.submitted_at).toLocaleString() : "Auto-submitted"}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div
                        style={{
                          fontSize: 28,
                          fontWeight: 800,
                          fontFamily: "Syne, sans-serif",
                          color: pct(r) >= 50 ? "var(--accent-light)" : "var(--danger)",
                        }}
                      >
                        {r.status === "disqualified" ? "FAIL" : `${pct(r)}%`}
                      </div>
                      <div className="text-muted" style={{ fontSize: 12 }}>
                        {r.score} / {r.total_marks} Marks
                      </div>
                    </div>
                  </div>
                  {r.status === "disqualified" && (
                    <div className="alert alert-danger" style={{ marginTop: 12, marginBottom: 0, fontSize: 13 }}>
                      Failed and auto-submitted after exceeding the proctoring limit.
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Selected Result Deep-Dive */}
            {selected && (
              <div className="card" style={{ alignSelf: "start", maxHeight: "88vh", overflowY: "auto" }}>
                <div className="flex-between mb-3">
                  <h3 style={{ fontSize: 17 }}>Performance Scorecard</h3>
                  <button className="btn btn-ghost btn-sm" onClick={() => setSelected(null)}>✕</button>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <div className="text-muted" style={{ fontSize: 11, marginBottom: 4 }}>OVERALL SCORE</div>
                  <div
                    style={{
                      fontSize: 36,
                      fontWeight: 800,
                      fontFamily: "Syne, sans-serif",
                      color: pct(selected) >= 50 ? "var(--accent-light)" : "var(--danger)",
                    }}
                  >
                    {selected.status === "disqualified" ? "FAIL" : `${pct(selected)}%`}
                  </div>
                  <div className="text-muted" style={{ fontSize: 13 }}>
                    {selected.score} / {selected.total_marks} Total Marks Earned
                  </div>
                </div>

                {selected.proctor_remark && (
                  <div className="alert alert-warning" style={{ fontSize: 13, marginBottom: 12 }}>
                    💬 <strong>Examiner Note:</strong> {selected.proctor_remark}
                  </div>
                )}

                {selected.violation_count > 0 && (
                  <div className="alert alert-danger" style={{ fontSize: 13, marginBottom: 12 }}>
                    🚨 {selected.violation_count} proctoring warning{selected.violation_count > 1 ? "s" : ""} recorded during session
                  </div>
                )}

                <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16, marginTop: 12 }}>
                  <div className="text-muted" style={{ fontSize: 12, marginBottom: 10 }}>
                    QUESTION-BY-QUESTION REVIEW
                  </div>
                  {selected.answers?.map((a, i) => (
                    <div
                      key={i}
                      style={{
                        marginBottom: 12,
                        padding: 12,
                        background: "var(--surface2)",
                        borderRadius: 8,
                        fontSize: 13,
                        border: "1px solid var(--border)",
                      }}
                    >
                      <div className="flex-between" style={{ marginBottom: 6 }}>
                        <strong style={{ color: "var(--text)" }}>
                          Q{i + 1}: {a.question_text || "Question"}
                        </strong>
                        <span className="badge badge-green" style={{ fontSize: 11 }}>
                          {a.marks_awarded != null ? `${a.marks_awarded} / ${a.max_marks}` : `${a.max_marks} pts`}
                        </span>
                      </div>

                      <div className="text-muted" style={{ marginBottom: 6, background: "var(--bg)", padding: 8, borderRadius: 6 }}>
                        <strong>Your Response:</strong> {a.text_answer || (a.selected_choices?.length > 0 ? `Selected Option(s): ${a.selected_choices.join(", ")}` : "No answer submitted")}
                      </div>

                      {a.ai_feedback && (
                        <div style={{ color: "var(--accent-light)", fontSize: 12, marginBottom: 6 }}>
                          🤖 <strong>AI Feedback:</strong> {a.ai_feedback}
                        </div>
                      )}

                      {a.rubric_breakdown && a.rubric_breakdown.length > 0 && (
                        <div style={{ marginTop: 4 }}>
                          {a.rubric_breakdown.map((r, rIdx) => (
                            <span
                              key={rIdx}
                              className={`rubric-tag ${r.is_satisfied ? "satisfied" : "missed"}`}
                              style={{ fontSize: 11 }}
                            >
                              {r.is_satisfied ? "✓ Matched: " : "✗ Missing: "} {r.point}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
