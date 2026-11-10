// src/pages/examiner/ExaminerExamEdit.jsx
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Sidebar from "../../components/common/Sidebar";
import { examAPI } from "../../api/client";
import toast from "react-hot-toast";

const LINKS = [
  { label: "Dashboard", path: "/examiner",      icon: "⬛" },
  { label: "My Exams",  path: "/examiner/exams", icon: "📋" },
];

function toDateTimeLocal(value, timeZone) {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const formatted = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return `${formatted.year}-${formatted.month}-${formatted.day}T${formatted.hour}:${formatted.minute}`;
}

export default function ExaminerExamEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    title: "",
    assessment_type: "practice",
    description: "",
    instructions: "",
    institution_name: "",
    department: "",
    target_batch: "",
    start_datetime: "",
    duration_minutes: 60,
    results_visible_from: "",
    community: "",
    time_zone: "UTC",
    status: "draft",
    allowed_emails: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    examAPI.get(id)
      .then(({ data }) => {
        const timeZone = data.time_zone || "UTC";
        setForm({
          title: data.title || "",
          assessment_type: data.assessment_type || "practice",
          description: data.description || "",
          instructions: data.instructions || "",
          institution_name: data.institution_name || "",
          department: data.department || "",
          target_batch: data.target_batch || "",
          start_datetime: toDateTimeLocal(data.start_datetime, timeZone),
          duration_minutes: data.duration_minutes || 60,
          results_visible_from: toDateTimeLocal(data.results_visible_from, timeZone),
          community: data.community || "",
          time_zone: timeZone,
          status: data.status || "draft",
          allowed_emails: data.allowed_emails || "",
        });
      })
      .catch((err) => {
        const msg = err.response?.data?.detail || "Failed to load exam.";
        toast.error(msg);
        navigate("/examiner/exams");
      })
      .finally(() => setLoading(false));
  }, [id, navigate]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm({ ...form, [name]: type === "checkbox" ? checked : value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const payload = { ...form };
      if (!payload.results_visible_from) payload.results_visible_from = null;
      await examAPI.update(id, payload);
      toast.success("Exam details updated successfully.");
      navigate(`/examiner/exams/${id}`);
    } catch (err) {
      const data = err.response?.data;
      setErrors(data?.field_errors || data || {});
      toast.error(data?.detail || "Failed to update exam.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="loading-screen">Loading exam details…</div>;

  return (
    <div className="layout">
      <Sidebar role="examiner" links={LINKS} />
      <main className="main-content">
        <div className="page-header">
          <h1>Edit Standardized Exam</h1>
          <p>Modify this community assessment. Scheduled values use {form.time_zone}.</p>
        </div>

        <div className="card" style={{ maxWidth: 840 }}>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Owning community</label>
              <input className="form-control" value={form.community ? `Community #${form.community}` : "Legacy exam"} readOnly />
              <input type="hidden" name="community" value={form.community} />
            </div>
            <div className="form-group">
              <label>Exam Title *</label>
              <input
                className="form-control"
                name="title"
                value={form.title}
                onChange={handleChange}
                required
              />
              {errors.title && <div className="text-danger mt-1">{errors.title[0]}</div>}
            </div>
            <div className="form-group">
              <label htmlFor="assessment-type">Assessment type</label>
              <select id="assessment-type" className="form-control" name="assessment_type"
                value={form.assessment_type} onChange={handleChange} required>
                <option value="practice">Practice</option>
                <option value="placement">Placement / entry-level jobs</option>
                <option value="internal">Internal assessment</option>
                <option value="member_selection">Member selection</option>
                <option value="other">Other</option>
              </select>
            </div>

            {/* Institutional Organization */}
            <div style={{
              background: "var(--surface2)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "16px 20px",
              marginBottom: 20
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--accent-light)", marginBottom: 12 }}>
                Institutional & Departmental Scope
              </div>
              <div className="form-grid-3">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Host School / Institute</label>
                  <input
                    className="form-control"
                    name="institution_name"
                    value={form.institution_name}
                    onChange={handleChange}
                    placeholder="e.g. Institute of Technology"
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Department / Faculty</label>
                  <input
                    className="form-control"
                    name="department"
                    value={form.department}
                    onChange={handleChange}
                    placeholder="e.g. Computer Science"
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Target Cohort / Batch</label>
                  <input
                    className="form-control"
                    name="target_batch"
                    value={form.target_batch}
                    onChange={handleChange}
                    placeholder="e.g. 2026-Batch, Sec A"
                  />
                </div>
              </div>
            </div>

            <div className="form-group">
              <label>Description</label>
              <textarea
                className="form-control"
                name="description"
                value={form.description}
                onChange={handleChange}
                rows={2}
              />
            </div>

            <div className="form-group">
              <label>Instructions</label>
              <textarea
                className="form-control"
                name="instructions"
                value={form.instructions}
                onChange={handleChange}
                rows={3}
              />
            </div>

            {/* Access Control & Candidate Whitelist */}
            <div style={{
              background: "var(--surface2)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: 20,
              marginBottom: 20
            }}>
              <h4 style={{ fontSize: 15, marginBottom: 8 }}>Candidate email allowlist</h4>
              <p className="text-muted" style={{ fontSize: 13 }}>
                Candidates must be approved members of this community and appear in the list below.
              </p>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="candidate-emails">Authorized candidate emails</label>
                <textarea id="candidate-emails" className="form-control" name="allowed_emails"
                  value={form.allowed_emails} onChange={handleChange} rows={3}
                  required={form.status === "published"} />
                {errors.allowed_emails && <div className="text-danger mt-1">{errors.allowed_emails[0]}</div>}
              </div>
            </div>

            <div className="form-grid-2">
              <div className="form-group">
                <label>Start Date & Time *</label>
                <input
                  className="form-control"
                  type="datetime-local"
                  name="start_datetime"
                  value={form.start_datetime}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="form-group">
                <label>Duration (minutes) *</label>
                <input
                  className="form-control"
                  type="number"
                  name="duration_minutes"
                  value={form.duration_minutes}
                  onChange={handleChange}
                  min="1"
                  required
                />
              </div>
            </div>

            <div className="form-grid-2">
              <div className="form-group">
                <label>Results Release Date & Time</label>
                <input
                  className="form-control"
                  type="datetime-local"
                  name="results_visible_from"
                  value={form.results_visible_from}
                  onChange={handleChange}
                />
              </div>

              <div className="form-group">
                <label>Status</label>
                <select className="form-control" name="status" value={form.status} onChange={handleChange}>
                  <option value="draft">Draft (Private)</option>
                  <option value="published">Published (Active)</option>
                  <option value="archived">Archived (Closed)</option>
                </select>
              </div>
            </div>

            <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? "Saving Changes…" : "Save Changes"}
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => navigate(`/examiner/exams/${id}`)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
