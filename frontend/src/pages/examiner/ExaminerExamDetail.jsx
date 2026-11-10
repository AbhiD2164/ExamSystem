// src/pages/examiner/ExaminerExamDetail.js
import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Sidebar from "../../components/common/Sidebar";
import client, { examAPI } from "../../api/client";
import toast from "react-hot-toast";

const LINKS = [
  { label: "Dashboard",   path: "/examiner",         icon: "⬛" },
  { label: "My Exams",    path: "/examiner/exams",    icon: "📋" },
];

const EMPTY_QUESTION = {
  text: "",
  question_type: "long",
  marks: 5,
  order: 0,
  is_required: true,
  expected_notes: "",
  reference_context: "",
  rubrics: [],
  choices: [],
};

function QuestionForm({ initial, onSave, onCancel }) {
  const [q, setQ] = useState(initial ? { ...EMPTY_QUESTION, ...initial } : EMPTY_QUESTION);
  const [saving, setSaving] = useState(false);
  const [newRubricText, setNewRubricText] = useState("");
  const [newRubricWeight, setNewRubricWeight] = useState(1);

  const addChoice = () => setQ({
    ...q,
    choices: [...q.choices, { text: "", is_correct: false, order: q.choices.length }]
  });

  const updateChoice = (i, field, val) => {
    const choices = [...q.choices];
    choices[i] = { ...choices[i], [field]: val };
    if (field === "is_correct" && val && q.question_type === "mcq_single") {
      choices.forEach((c, idx) => { if (idx !== i) choices[idx] = { ...choices[idx], is_correct: false }; });
    }
    setQ({ ...q, choices });
  };

  const removeChoice = (i) => setQ({ ...q, choices: q.choices.filter((_, idx) => idx !== i) });

  const addRubricPoint = () => {
    if (!newRubricText.trim()) return;
    const item = {
      point: newRubricText.trim(),
      weight: Number(newRubricWeight) || 1,
    };
    setQ({ ...q, rubrics: [...(q.rubrics || []), item] });
    setNewRubricText("");
    setNewRubricWeight(1);
  };

  const removeRubricPoint = (i) => {
    const updated = (q.rubrics || []).filter((_, idx) => idx !== i);
    setQ({ ...q, rubrics: updated });
  };

  const isChoiceType = q.question_type === "mcq_single" || q.question_type === "mcq_multi";
  const isWrittenType = q.question_type === "short" || q.question_type === "long";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(q);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ padding: 24, background: "var(--surface2)", borderRadius: "var(--radius)", marginBottom: 20, border: "1px solid var(--border)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 14, marginBottom: 14 }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Question Prompt *</label>
          <textarea
            className="form-control"
            value={q.text}
            onChange={(e) => setQ({ ...q, text: e.target.value })}
            required
            rows={2}
            placeholder="e.g. Explain how transformers utilize multi-head self-attention mechanisms."
          />
        </div>
        <div className="form-group" style={{ marginBottom: 0, minWidth: 170 }}>
          <label>Question Type</label>
          <select
            className="form-control"
            value={q.question_type}
            onChange={(e) => setQ({ ...q, question_type: e.target.value, choices: [] })}
          >
            <option value="long">Long Answer (AI Graded)</option>
            <option value="short">Short Answer (AI Graded)</option>
            <option value="mcq_single">MCQ – Single Choice</option>
            <option value="mcq_multi">MCQ – Multi Choice</option>
          </select>
        </div>
        <div className="form-group" style={{ marginBottom: 0, minWidth: 90 }}>
          <label>Max Marks</label>
          <input
            className="form-control"
            type="number"
            min="1"
            value={q.marks}
            onChange={(e) => setQ({ ...q, marks: Number(e.target.value) })}
          />
        </div>
      </div>

      {isChoiceType && (
        <div style={{ marginBottom: 16 }}>
          <div className="text-muted mb-2" style={{ fontSize: 13, fontWeight: 600 }}>
            Answer Choices {q.question_type === "mcq_single" ? "(select the one correct choice)" : "(select all correct choices)"}
          </div>
          {q.choices.map((c, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
              <input
                type={q.question_type === "mcq_single" ? "radio" : "checkbox"}
                checked={c.is_correct}
                onChange={(e) => updateChoice(i, "is_correct", e.target.checked)}
                style={{ accentColor: "var(--accent)", width: 18, height: 18, flexShrink: 0 }}
              />
              <input
                className="form-control"
                value={c.text}
                placeholder={`Option ${i + 1}`}
                onChange={(e) => updateChoice(i, "text", e.target.value)}
                style={{ marginBottom: 0 }}
                required
              />
              <button type="button" className="btn btn-danger btn-sm" onClick={() => removeChoice(i)}>✕</button>
            </div>
          ))}
          <button type="button" className="btn btn-ghost btn-sm mt-2" onClick={addChoice}>+ Add Option</button>
        </div>
      )}

      {isWrittenType && (
        <div style={{ background: "rgba(16, 185, 129, 0.04)", border: "1px solid rgba(16, 185, 129, 0.2)", borderRadius: 10, padding: 18, marginBottom: 16 }}>
          <h4 style={{ fontSize: 14, color: "var(--accent-light)", marginBottom: 12 }}>
            🤖 ExMint ML Evaluation Criteria & Rubrics
          </h4>
          
          <div className="form-group">
            <label style={{ fontSize: 13 }}>Model Answer / Expected Points (Used by ML Semantic Evaluator)</label>
            <textarea
              className="form-control"
              value={q.expected_notes || ""}
              onChange={(e) => setQ({ ...q, expected_notes: e.target.value })}
              rows={3}
              placeholder="Provide the ideal model answer or key concepts that should be present in the examinee's response..."
            />
          </div>

          <div className="form-group">
            <label style={{ fontSize: 13 }}>Reference Context & Source Material (Optional)</label>
            <textarea
              className="form-control"
              value={q.reference_context || ""}
              onChange={(e) => setQ({ ...q, reference_context: e.target.value })}
              rows={2}
              placeholder="Additional background context, textbook passage, or scientific definitions for deep grounding..."
            />
          </div>

          {/* Structured Rubrics */}
          <div>
            <label style={{ fontSize: 13, display: "block", marginBottom: 6 }}>
              Key Concept Rubric Breakdown (Optional Structured Checkpoints)
            </label>
            {(q.rubrics || []).map((r, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                <span className="badge badge-green" style={{ flexShrink: 0 }}>Weight: {r.weight}</span>
                <span style={{ flex: 1, fontSize: 13, color: "var(--text)" }}>{r.point}</span>
                <button type="button" className="btn btn-danger btn-sm" onClick={() => removeRubricPoint(i)}>✕</button>
              </div>
            ))}

            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <input
                className="form-control"
                style={{ flex: 1 }}
                placeholder="e.g. Must mention Query, Key, and Value matrix multiplication"
                value={newRubricText}
                onChange={(e) => setNewRubricText(e.target.value)}
              />
              <input
                className="form-control"
                type="number"
                style={{ width: 80 }}
                min="0.5"
                step="0.5"
                value={newRubricWeight}
                onChange={(e) => setNewRubricWeight(e.target.value)}
                title="Weight / Marks"
              />
              <button type="button" className="btn btn-ghost btn-sm" onClick={addRubricPoint}>+ Add Rubric Point</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <button className="btn btn-primary btn-sm" type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save Question"}
        </button>
        <button className="btn btn-ghost btn-sm" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

export default function ExaminerExamDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [exam, setExam]           = useState(null);
  const [questions, setQuestions] = useState([]);
  const [addingQ, setAddingQ]     = useState(false);
  const [editingQ, setEditingQ]   = useState(null);
  const [tab, setTab]             = useState("questions");
  
  // Playground State
  const [testQuestionId, setTestQuestionId] = useState("");
  const [testAnswerText, setTestAnswerText] = useState("");
  const [testResult, setTestResult] = useState(null);
  const [testingML, setTestingML] = useState(false);

  const reload = useCallback(async () => {
    const [{ data: ex }, { data: qs }] = await Promise.all([
      examAPI.get(id),
      examAPI.listQuestions(id),
    ]);
    setExam(ex);
    setQuestions(qs);
    if (qs.length > 0 && !testQuestionId) {
      setTestQuestionId(String(qs[0].id));
    }
  }, [id, testQuestionId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const saveNewQuestion = async (q) => {
    try {
      await examAPI.createQuestion(id, q);
      toast.success("Question created with ML rubrics.");
      setAddingQ(false);
      reload();
    } catch { toast.error("Failed to add question."); }
  };

  const saveEditQuestion = async (q) => {
    try {
      await examAPI.updateQuestion(id, editingQ.id, q);
      toast.success("Question updated.");
      setEditingQ(null);
      reload();
    } catch { toast.error("Failed to update question."); }
  };

  const deleteQuestion = async (qId) => {
    if (!window.confirm("Delete this question?")) return;
    try { await examAPI.deleteQuestion(id, qId); toast.success("Deleted."); reload(); }
    catch { toast.error("Delete failed."); }
  };

  const runTestMLGrading = async () => {
    const selectedQ = questions.find((q) => String(q.id) === String(testQuestionId));
    if (!selectedQ) {
      toast.error("Please select a question.");
      return;
    }
    if (!testAnswerText.trim()) {
      toast.error("Please enter a sample examinee answer to test.");
      return;
    }

    setTestingML(true);
    setTestResult(null);
    try {
      const { data } = await client.post("/exams/ml-grade/preview/", {
        question_text: selectedQ.text,
        expected_notes: selectedQ.expected_notes || "",
        reference_context: selectedQ.reference_context || "",
        rubrics: selectedQ.rubrics || [],
        sample_answer: testAnswerText,
        max_marks: selectedQ.marks,
        question_type: selectedQ.question_type,
      });
      setTestResult(data);
      toast.success(`ML Evaluation complete: ${data.marks_awarded} / ${data.max_marks} marks`);
    } catch {
      toast.error("ML preview test failed.");
    } finally {
      setTestingML(false);
    }
  };

  if (!exam) return <div className="loading-screen">Loading ExMint Studio…</div>;

  const typeLabel = { short: "Short Answer", long: "Long Answer", mcq_single: "MCQ (1)", mcq_multi: "MCQ (N)" };

  return (
    <div className="layout">
      <Sidebar role="examiner" links={LINKS} />
      <main className="main-content">
        <div className="page-header flex-between">
          <div>
            <h1>{exam.title}</h1>
            <p>
              Start: {new Date(exam.start_datetime).toLocaleString()} · {exam.duration_minutes} mins ·{" "}
              <span className={`badge ${exam.status === "published" ? "badge-green" : "badge-gray"}`}>{exam.status}</span>
              {" "}·{" "}
              <span className="badge badge-purple">🔒 Candidate allowlist</span>
            </p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-ghost" onClick={() => navigate(`/examiner/exams/${id}/edit`)}>
              ⚙️ Edit Settings & Whitelist
            </button>
            <button className="btn btn-primary" onClick={() => navigate(`/examiner/exams/${id}/results`)}>
              📊 Submissions & Results
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 24, borderBottom: "1px solid var(--border)" }}>
          {[
            { id: "questions", label: `Questions (${questions.length})` },
            { id: "whitelist", label: "Authorized candidate emails" },
            { id: "ml_playground", label: `🤖 ML Grader Playground` },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: "12px 24px",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: tab === t.id ? "var(--accent-light)" : "var(--text-muted)",
                borderBottom: tab === t.id ? "2px solid var(--accent)" : "2px solid transparent",
                fontFamily: "inherit",
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Questions Tab */}
        {tab === "questions" && (
          <div>
            {addingQ && <QuestionForm onSave={saveNewQuestion} onCancel={() => setAddingQ(false)} />}

            {questions.map((q, idx) => (
              editingQ?.id === q.id ? (
                <QuestionForm key={q.id} initial={q} onSave={saveEditQuestion} onCancel={() => setEditingQ(null)} />
              ) : (
                <div key={q.id} className="question-card">
                  <div className="q-header">
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <span style={{ fontWeight: 700, color: "var(--accent-light)", fontSize: 14 }}>Q{idx + 1}</span>
                      <span className="badge badge-blue">{typeLabel[q.question_type] || q.question_type}</span>
                      <span className="text-muted" style={{ fontSize: 13 }}>{q.marks} mark{q.marks !== 1 ? "s" : ""}</span>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditingQ(q)}>Edit</button>
                      <button className="btn btn-danger btn-sm" onClick={() => deleteQuestion(q.id)}>Delete</button>
                    </div>
                  </div>

                  <div className="q-text">{q.text}</div>

                  {/* Written Answer Rubrics & Expected Notes Preview */}
                  {(q.question_type === "short" || q.question_type === "long") && (
                    <div style={{ background: "var(--surface2)", borderRadius: 8, padding: "12px 16px", marginTop: 10, fontSize: 13 }}>
                      {q.expected_notes && (
                        <div style={{ marginBottom: 6 }}>
                          <strong style={{ color: "var(--accent-light)" }}>Model Answer / Key Points: </strong>
                          <span className="text-muted">{q.expected_notes}</span>
                        </div>
                      )}
                      {q.reference_context && (
                        <div style={{ marginBottom: 6 }}>
                          <strong style={{ color: "var(--info)" }}>Reference Context: </strong>
                          <span className="text-muted">{q.reference_context.slice(0, 140)}...</span>
                        </div>
                      )}
                      {q.rubrics && q.rubrics.length > 0 && (
                        <div>
                          <strong style={{ color: "var(--purple)", display: "block", marginBottom: 4 }}>
                            Evaluator Rubrics:
                          </strong>
                          {q.rubrics.map((r, rIdx) => (
                            <span key={rIdx} className="rubric-tag">
                              • {r.point} ({r.weight} pt)
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Choice preview */}
                  {q.choices && q.choices.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      {q.choices.map((c) => (
                        <div key={c.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.05)", fontSize: 14 }}>
                          <span style={{ color: c.is_correct ? "var(--accent-light)" : "var(--text-dim)" }}>
                            {c.is_correct ? "✓" : "○"}
                          </span>
                          <span style={{ color: c.is_correct ? "var(--text)" : "var(--text-muted)" }}>{c.text}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            ))}

            {!addingQ && (
              <button className="btn btn-primary" onClick={() => setAddingQ(true)}>
                + Add Question & Rubric
              </button>
            )}
          </div>
        )}

        {/* Candidate allowlist */}
        {tab === "whitelist" && (
          <div className="card">
            <div className="card-title">Allowlisted candidates</div>
            <p className="text-muted">
              Every candidate must also have an approved membership in this community. Assessment registration is handled outside this application.
            </p>
            <ul>
              {(exam.allowed_emails || "").split(/[\s,]+/).filter(Boolean).map((email) => (
                <li key={email}>{email}</li>
              ))}
            </ul>
            <button className="btn btn-ghost" onClick={() => navigate(`/examiner/exams/${id}/edit`)}>
              Edit candidate allowlist
            </button>
          </div>
        )}

        {/* ML Playground Tab */}
        {tab === "ml_playground" && (
          <div className="card" style={{ maxWidth: 840 }}>
            <div className="card-title">🤖 In-House ML Grader Simulator & Playground</div>
            <p className="text-muted" style={{ fontSize: 14, marginBottom: 20 }}>
              Test how the ExMint ML evaluation engine scores various candidate answers against your model answers and rubrics.
            </p>

            <div className="form-group">
              <label>Select Question to Test</label>
              <select
                className="form-control"
                value={testQuestionId}
                onChange={(e) => setTestQuestionId(e.target.value)}
              >
                {questions
                  .filter((q) => q.question_type === "short" || q.question_type === "long")
                  .map((q) => (
                    <option key={q.id} value={q.id}>
                      Q{q.order}: {q.text.slice(0, 70)} ({q.marks} marks)
                    </option>
                  ))}
              </select>
            </div>

            <div className="form-group">
              <label>Sample Examinee Answer</label>
              <textarea
                className="form-control"
                rows={4}
                value={testAnswerText}
                onChange={(e) => setTestAnswerText(e.target.value)}
                placeholder="Type or paste a sample student response to test..."
              />
            </div>

            <button
              className="btn btn-primary"
              onClick={runTestMLGrading}
              disabled={testingML}
            >
              {testingML ? "Analyzing with ExMint ML…" : "Evaluate with ML Engine →"}
            </button>

            {testResult && (
              <div style={{ marginTop: 24, padding: 20, background: "var(--surface2)", borderRadius: 10, border: "1px solid var(--border)" }}>
                <div className="flex-between" style={{ marginBottom: 12 }}>
                  <h4 style={{ fontSize: 16 }}>ML Evaluation Scorecard</h4>
                  <span className="badge badge-green" style={{ fontSize: 14 }}>
                    {testResult.marks_awarded} / {testResult.max_marks} Marks ({testResult.percentage}%)
                  </span>
                </div>

                <div className="alert alert-info" style={{ fontSize: 13, marginBottom: 14 }}>
                  💬 <strong>Generated Feedback:</strong> {testResult.feedback}
                </div>

                <p style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 14 }}>
                  🔍 <strong>Engine Rationale:</strong> {testResult.reason}
                </p>

                {testResult.rubric_breakdown && testResult.rubric_breakdown.length > 0 && (
                  <div>
                    <h5 style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 8 }}>Rubric Coverage:</h5>
                    {testResult.rubric_breakdown.map((r, i) => (
                      <div
                        key={i}
                        className={`rubric-tag ${r.is_satisfied ? "satisfied" : "missed"}`}
                        style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}
                      >
                        <span>{r.is_satisfied ? "✓ Matched: " : "✗ Missing: "} {r.point}</span>
                        <span>{r.score * 100}%</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
