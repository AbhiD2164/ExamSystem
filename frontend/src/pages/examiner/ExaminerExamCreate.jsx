// src/pages/examiner/ExaminerExamCreate.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "../../components/common/Sidebar";
import { authAPI, examAPI } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import toast from "react-hot-toast";

const LINKS = [
  { label: "Dashboard",   path: "/examiner",         icon: "⬛" },
  { label: "My Exams",    path: "/examiner/exams",    icon: "📋" },
];

export default function ExaminerExamCreate() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [communities, setCommunities] = useState([]);
  const [form, setForm] = useState({
    title: "",
    assessment_type: "practice",
    description: "",
    instructions: "",
    institution_name: user?.institution_name || "",
    department: user?.department || "",
    target_batch: "",
    start_datetime: "",
    duration_minutes: 60,
    results_visible_from: "",
    community: "",
    time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    status: "draft",
    allowed_emails: "",
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    authAPI.communities()
      .then(({ data }) => setCommunities(data.filter((community) =>
        ["owner", "manager"].includes(community.membership_role)
        || (
          community.membership_role === "exam_creator"
          && community.creator_exam_types?.length
        ))))
      .catch(() => toast.error("Could not load your communities."));
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm({ ...form, [name]: type === "checkbox" ? checked : value });
  };
  const availableCommunities = communities.filter((community) =>
    ["owner", "manager"].includes(community.membership_role)
    || community.creator_exam_types?.includes(form.assessment_type)
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const payload = { ...form };
      if (!payload.results_visible_from) delete payload.results_visible_from;
      const { data } = await examAPI.create(payload);
      toast.success("Exam standardized and created! Now configure questions & AI rubrics.");
      navigate(`/examiner/exams/${data.id}`);
    } catch (err) {
      const data = err.response?.data;
      setErrors(data?.field_errors || data || {});
      toast.error(data?.detail || "Failed to create exam.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="layout">
      <Sidebar role="examiner" links={LINKS} />
      <main className="main-content">
        <div className="page-header">
          <h1>Create Standardized Exam</h1>
          <p>Create an assessment for one of your communities. Add answer keys and AI grading rubrics to its questions.</p>
        </div>

        <div className="card" style={{ maxWidth: 840 }}>
          <form onSubmit={handleSubmit}>
            <div className="form-grid-2">
              <div className="form-group">
                <label htmlFor="exam-community">Owning community *</label>
                <select id="exam-community" className="form-control" name="community" value={form.community}
                  onChange={(event) => {
                    const community = communities.find((item) => String(item.id) === event.target.value);
                    setForm({ ...form, community: event.target.value, time_zone: community?.time_zone || form.time_zone });
                  }} required>
                  <option value="">Select a community</option>
                  {availableCommunities.map((community) => (
                    <option value={community.id} key={community.id}>{community.name}</option>
                  ))}
                </select>
                {communities.length === 0 && (
                  <div className="text-muted mt-1">Ask a community manager to authorize your account for this assessment type.</div>
                )}
              </div>
              <div className="form-group">
                <label htmlFor="exam-time-zone">Schedule time zone</label>
                <input id="exam-time-zone" className="form-control" value={form.time_zone} readOnly />
                <div className="text-muted mt-1">Date and result times below use this community's local time.</div>
              </div>
            </div>
            <div className="form-group">
              <label>Exam Title *</label>
              <input
                className="form-control"
                name="title"
                value={form.title}
                onChange={handleChange}
                required
                placeholder="e.g. Distributed Systems & Cloud Computing Midterm"
              />
              {errors.title && <div className="text-danger mt-1">{errors.title[0]}</div>}
            </div>
            <div className="form-group">
              <label htmlFor="assessment-type">Assessment type *</label>
              <select id="assessment-type" className="form-control" name="assessment_type"
                value={form.assessment_type} onChange={handleChange} required>
                <option value="practice">Practice</option>
                <option value="placement">Placement / entry-level jobs</option>
                <option value="internal">Internal assessment</option>
                <option value="member_selection">Member selection</option>
                <option value="other">Other</option>
              </select>
              <div className="text-muted mt-1">Your community role must be authorized for this assessment type.</div>
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
              <div className="text-muted mt-2" style={{ fontSize: 12 }}>
                🏫 When specified, students registered under this institute or department will have automatic eligibility.
              </div>
            </div>

            <div className="form-group">
              <label>Description</label>
              <textarea
                className="form-control"
                name="description"
                value={form.description}
                onChange={handleChange}
                placeholder="Brief curriculum overview or course description"
                rows={2}
              />
            </div>

            <div className="form-group">
              <label>Instructions for Examinees</label>
              <textarea
                className="form-control"
                name="instructions"
                value={form.instructions}
                onChange={handleChange}
                placeholder="Standardized instructions, proctoring warnings, and guidelines"
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
                Candidates must have an approved membership in this community and an email address listed here.
                Assessment lookup or a shared ID never grants access.
              </p>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="candidate-emails" style={{ fontSize: 13, color: "var(--accent-light)" }}>
                  Authorized candidate emails {form.status === "published" ? "*" : ""}
                </label>
                <textarea
                  id="candidate-emails"
                  className="form-control"
                  name="allowed_emails"
                  value={form.allowed_emails}
                  onChange={handleChange}
                  placeholder="candidate1@univ.edu, candidate2@univ.edu"
                  rows={3}
                  required={form.status === "published"}
                />
                <div className="text-muted mt-1" style={{ fontSize: 12 }}>
                  Only registered, verified accounts on this list can discover or take this assessment.
                </div>
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
                {errors.start_datetime && <div className="text-danger mt-1">{errors.start_datetime[0]}</div>}
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
                <div className="text-muted mt-1" style={{ fontSize: 12 }}>
                  This time is interpreted in {form.time_zone} and stored as a UTC instant.
                </div>
              </div>

              <div className="form-group">
                <label>Status</label>
                <select className="form-control" name="status" value={form.status} onChange={handleChange}>
                  <option value="draft">Draft (Private to Examiner)</option>
                  <option value="published">Published (Ready for Candidates)</option>
                </select>
              </div>
            </div>

            <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? "Creating Exam…" : "Create Exam & Configure AI Rubrics →"}
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => navigate("/examiner/exams")}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
