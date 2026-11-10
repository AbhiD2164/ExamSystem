// src/pages/examiner/ExaminerExamList.js
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "../../components/common/Sidebar";
import { examAPI } from "../../api/client";
import toast from "react-hot-toast";

const LINKS = [
  { label: "Dashboard",   path: "/examiner",         icon: "⬛" },
  { label: "My Exams",    path: "/examiner/exams",    icon: "📋" },
];

export default function ExaminerExamList() {
  const navigate = useNavigate();
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchExams = async () => {
    try { const { data } = await examAPI.list(); setExams(data); }
    catch { toast.error("Failed to load exams."); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchExams(); }, []);

  const deleteExam = async (id) => {
    if (!window.confirm("Delete this exam?")) return;
    try { await examAPI.delete(id); toast.success("Deleted."); fetchExams(); }
    catch { toast.error("Delete failed."); }
  };

  return (
    <div className="layout">
      <Sidebar role="examiner" links={LINKS} />
      <main className="main-content">
        <div className="page-header flex-between">
          <div><h1>Community assessments</h1><p>Create and manage assessments in your communities.</p></div>
          <button className="btn btn-primary" onClick={() => navigate("/examiner/exams/create")}>+ New Exam</button>
        </div>

        <div className="card">
          {loading ? <p className="text-muted">Loading…</p> : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Title</th><th>Status</th><th>Start</th><th>Duration</th><th>Results From</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {exams.map((ex) => (
                    <tr key={ex.id}>
                      <td><strong>{ex.title}</strong></td>
                      <td><span className={`badge ${ex.status === "published" ? "badge-green" : ex.status === "draft" ? "badge-gray" : "badge-gold"}`}>{ex.status}</span></td>
                      <td className="text-muted">{new Date(ex.start_datetime).toLocaleString()}</td>
                      <td className="text-muted">{ex.duration_minutes} min</td>
                      <td className="text-muted">{ex.results_visible_from ? new Date(ex.results_visible_from).toLocaleDateString() : "—"}</td>
                      <td>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/examiner/exams/${ex.id}`)}>Manage</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/examiner/exams/${ex.id}/edit`)}>Edit</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/examiner/exams/${ex.id}/results`)}>Results</button>
                          <button className="btn btn-danger btn-sm" onClick={() => deleteExam(ex.id)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {exams.length === 0 && <p className="text-muted mt-3">No exams yet.</p>}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
