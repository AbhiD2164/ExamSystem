// src/pages/examiner/ExaminerResults.js
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Sidebar from "../../components/common/Sidebar";
import client, { resultsAPI, proctoringAPI, examAPI } from "../../api/client";
import toast from "react-hot-toast";

const LINKS = [
  { label: "Dashboard", path: "/examiner",      icon: "⬛" },
  { label: "My Exams",  path: "/examiner/exams", icon: "📋" },
];

const statusBadge = {
  submitted:      "badge-green",
  auto_submitted: "badge-red",
  ongoing:        "badge-gold",
  disqualified:   "badge-red",
};

export default function ExaminerResults() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [exam, setExam] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [violations, setViolations] = useState([]);
  const [gradeForm, setGradeForm] = useState({ score: "", total_marks: "", proctor_remark: "" });
  const [grading, setGrading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [aiGrading, setAiGrading] = useState(false);
  const [batchGrading, setBatchGrading] = useState(false);
  const [aiResult, setAiResult] = useState(null);

  useEffect(() => {
    Promise.all([examAPI.get(id), resultsAPI.examResults(id)])
      .then(([{ data: ex }, { data: subs }]) => {
        setExam(ex);
        setSubmissions(subs);
      })
      .catch(() => toast.error("Failed to load results."))
      .finally(() => setLoading(false));
  }, [id]);

  const openDetail = async (sub) => {
    setSelected(sub);
    setGradeForm({
      score: sub.score ?? "",
      total_marks: sub.total_marks ?? "",
      proctor_remark: sub.proctor_remark ?? "",
    });
    try {
      const { data } = await proctoringAPI.list(sub.id);
      setViolations(data);
    } catch {
      setViolations([]);
    }
  };

  const autoGradeSingle = async (subId) => {
    setAiGrading(true);
    setAiResult(null);
    try {
      const { data } = await client.post(`/exams/submissions/${subId}/ai-grade/`);
      setAiResult(data);
      toast.success(`ExMint ML graded: ${data.score}/${data.total_marks} (${data.percentage}%)`);
      const { data: subs } = await resultsAPI.examResults(id);
      setSubmissions(subs);
      const updated = subs.find((s) => s.id === subId);
      if (updated) setSelected(updated);
    } catch (err) {
      toast.error(err.response?.data?.detail || "ML Auto-grading failed.");
    } finally {
      setAiGrading(false);
    }
  };

  const batchAutoGrade = async () => {
    if (!window.confirm("Run ExMint ML auto-grading on all submitted exams?")) return;
    setBatchGrading(true);
    try {
      const { data } = await client.post(`/exams/${id}/batch-ml-grade/`);
      toast.success(data.detail || "Batch auto-grading completed.");
      const { data: subs } = await resultsAPI.examResults(id);
      setSubmissions(subs);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Batch grading failed.");
    } finally {
      setBatchGrading(false);
    }
  };

  const submitGrade = async () => {
    setGrading(true);
    try {
      await examAPI.gradeSubmission(selected.id, {
        score: Number(gradeForm.score),
        total_marks: Number(gradeForm.total_marks),
        proctor_remark: gradeForm.proctor_remark,
        is_graded: true,
      });
      toast.success("Grade saved successfully.");
      const { data } = await resultsAPI.examResults(id);
      setSubmissions(data);
      setSelected(null);
    } catch {
      toast.error("Grading save failed.");
    } finally {
      setGrading(false);
    }
  };

  if (loading) return <div className="loading-screen">Loading ExMint Results…</div>;

  return (
    <div className="layout">
      <Sidebar role="examiner" links={LINKS} />
      <main className="main-content">
        <div className="page-header flex-between">
          <div>
            <h1>Submissions & Grading — {exam?.title}</h1>
            <p>
              {submissions.length} examinee submission{submissions.length !== 1 ? "s" : ""} · In-House ML Evaluation Engine Active
            </p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              className="btn btn-primary"
              onClick={batchAutoGrade}
              disabled={batchGrading || submissions.length === 0}
            >
              {batchGrading ? "Running Batch ML…" : "🤖 Batch Auto-Grade All with ML"}
            </button>
            <button className="btn btn-ghost" onClick={() => navigate(`/examiner/exams/${id}`)}>
              ← Back to Exam
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: selected ? "1fr 480px" : "1fr", gap: 24 }}>
          {/* Submissions table */}
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Candidate</th>
                    <th>Status</th>
                    <th>Violations</th>
                    <th>Score</th>
                    <th>Graded</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {submissions.map((s) => (
                    <tr
                      key={s.id}
                      style={{ cursor: "pointer", background: selected?.id === s.id ? "var(--surface2)" : "transparent" }}
                      onClick={() => openDetail(s)}
                    >
                      <td>
                        <strong>{s.student_name}</strong>
                        <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{s.student_email}</div>
                      </td>
                      <td>
                        <span className={`badge ${statusBadge[s.status] || "badge-gray"}`}>
                          {s.status.replace("_", " ")}
                        </span>
                      </td>
                      <td style={{ color: s.violation_count > 0 ? "var(--danger)" : "inherit", fontWeight: s.violation_count > 0 ? 700 : 400 }}>
                        {s.violation_count}
                      </td>
                      <td>
                        {s.is_graded ? (
                          <span style={{ fontWeight: 700, color: "var(--accent-light)" }}>
                            {s.score} / {s.total_marks}
                          </span>
                        ) : "—"}
                      </td>
                      <td>
                        {s.is_graded ? (
                          <span className="badge badge-green">Graded</span>
                        ) : (
                          <span className="badge badge-gray">Pending</span>
                        )}
                      </td>
                      <td>
                        <button className="btn btn-ghost btn-sm">Inspect & Grade →</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {submissions.length === 0 && (
                <p className="text-muted mt-3">No candidate submissions recorded yet.</p>
              )}
            </div>
          </div>

          {/* Detailed inspection drawer */}
          {selected && (
            <div className="card" style={{ alignSelf: "start", maxHeight: "88vh", overflowY: "auto" }}>
              <div className="flex-between mb-3">
                <div>
                  <h3 style={{ fontSize: 18 }}>{selected.student_name}</h3>
                  <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{selected.student_email}</span>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => setSelected(null)}>✕</button>
              </div>

              <div style={{ marginBottom: 16 }}>
                <div className="text-muted" style={{ fontSize: 12, marginBottom: 4 }}>SUBMISSION STATUS</div>
                <span className={`badge ${statusBadge[selected.status] || "badge-gray"}`}>
                  {selected.status.replace("_", " ")}
                </span>
                <span className="text-muted" style={{ fontSize: 12, marginLeft: 10 }}>
                  Submitted: {selected.submitted_at ? new Date(selected.submitted_at).toLocaleTimeString() : "Ongoing"}
                </span>
              </div>

              {selected.proctor_remark && (
                <div className="alert alert-danger" style={{ fontSize: 13, marginBottom: 16 }}>
                  🚨 Proctor Remark: {selected.proctor_remark}
                </div>
              )}

              {violations.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div className="text-muted" style={{ fontSize: 12, marginBottom: 8 }}>
                    PROCTORING TELEMETRY ({violations.length} VIOLATIONS)
                  </div>
                  {violations.map((v) => (
                    <div
                      key={v.id}
                      style={{
                        fontSize: 13,
                        padding: "8px 12px",
                        background: "var(--surface2)",
                        borderRadius: 6,
                        marginBottom: 6,
                        borderLeft: `3px solid ${v.severity === "final" ? "var(--danger)" : "var(--warning)"}`,
                      }}
                    >
                      <strong>{v.violation_type.replace("_", " ")}</strong>
                      <span className="text-muted" style={{ marginLeft: 8 }}>
                        {new Date(v.occurred_at).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Answers & AI Evaluation Breakdown */}
              <div style={{ marginBottom: 16 }}>
                <div className="text-muted" style={{ fontSize: 12, marginBottom: 8 }}>
                  ANSWERS & ML EVALUATION ({selected.answers?.length || 0})
                </div>
                {selected.answers?.map((ans, aIdx) => (
                  <div
                    key={ans.id || aIdx}
                    style={{
                      background: "var(--surface2)",
                      borderRadius: 8,
                      padding: 12,
                      marginBottom: 10,
                      border: "1px solid var(--border)",
                    }}
                  >
                    <div className="flex-between" style={{ marginBottom: 6 }}>
                      <strong style={{ fontSize: 13, color: "var(--text)" }}>
                        Q: {ans.question_text || `Question ${aIdx + 1}`}
                      </strong>
                      <span className="badge badge-green" style={{ fontSize: 11 }}>
                        {ans.marks_awarded != null ? `${ans.marks_awarded}/${ans.max_marks}` : `${ans.max_marks} marks`}
                      </span>
                    </div>

                    <div style={{ fontSize: 13, color: "var(--text)", marginBottom: 8, background: "var(--bg)", padding: 8, borderRadius: 6 }}>
                      <strong>Examinee Answer:</strong> {ans.text_answer || (ans.selected_choices?.length ? `Selected Choice IDs: ${ans.selected_choices.join(", ")}` : "No answer")}
                    </div>

                    {ans.ai_feedback && (
                      <div style={{ fontSize: 12, color: "var(--accent-light)", marginBottom: 4 }}>
                        🤖 <strong>ML Feedback:</strong> {ans.ai_feedback}
                      </div>
                    )}

                    {ans.rubric_breakdown && ans.rubric_breakdown.length > 0 && (
                      <div style={{ marginTop: 6 }}>
                        {ans.rubric_breakdown.map((rb, rbIdx) => (
                          <span
                            key={rbIdx}
                            className={`rubric-tag ${rb.is_satisfied ? "satisfied" : "missed"}`}
                            style={{ fontSize: 11 }}
                          >
                            {rb.is_satisfied ? "✓" : "✗"} {rb.point}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <button
                className="btn btn-primary"
                style={{ width: "100%", marginBottom: 16 }}
                disabled={aiGrading}
                onClick={() => autoGradeSingle(selected.id)}
              >
                {aiGrading ? "🤖 Running ML Grader…" : "🤖 Auto-Grade this Submission with ML"}
              </button>

              {aiResult && (
                <div className="alert alert-info" style={{ fontSize: 13, marginBottom: 16 }}>
                  ExMint ML Score: <strong>{aiResult.score}/{aiResult.total_marks}</strong> ({aiResult.percentage}%)
                </div>
              )}

              {/* Manual Override & Remark */}
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
                <div className="text-muted" style={{ fontSize: 12, marginBottom: 12 }}>
                  MANUAL SCORE OVERRIDE & REMARKS
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Awarded Score</label>
                    <input
                      className="form-control"
                      type="number"
                      min="0"
                      step="0.5"
                      value={gradeForm.score}
                      onChange={(e) => setGradeForm({ ...gradeForm, score: e.target.value })}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Max Marks</label>
                    <input
                      className="form-control"
                      type="number"
                      min="0"
                      value={gradeForm.total_marks}
                      onChange={(e) => setGradeForm({ ...gradeForm, total_marks: e.target.value })}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Examiner Remarks</label>
                  <textarea
                    className="form-control"
                    rows={2}
                    value={gradeForm.proctor_remark}
                    onChange={(e) => setGradeForm({ ...gradeForm, proctor_remark: e.target.value })}
                    placeholder="Optional remarks or proctoring notes"
                  />
                </div>
                <button
                  className="btn btn-primary"
                  style={{ width: "100%" }}
                  disabled={grading}
                  onClick={submitGrade}
                >
                  {grading ? "Saving…" : "Save Official Grade"}
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
