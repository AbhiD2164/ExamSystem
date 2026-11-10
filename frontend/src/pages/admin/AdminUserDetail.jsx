// src/pages/admin/AdminUserDetail.js
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Sidebar from "../../components/common/Sidebar";
import { authAPI } from "../../api/client";
import toast from "react-hot-toast";

const LINKS = [
  { label: "Dashboard",  path: "/admin",       icon: "⬛" },
  { label: "All Users",  path: "/admin/users",  icon: "👥" },
];

export default function AdminUserDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [form, setForm] = useState({ is_active: true });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    authAPI.getUser(id).then(({ data }) => {
      setUser(data);
      setForm({
        is_active: data.is_active,
      });
    }).catch(() => toast.error("User not found."));
  }, [id]);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await authAPI.updateUser(id, { is_active: form.is_active });
      toast.success("User updated.");
      navigate("/admin/users");
    } catch { toast.error("Failed to update user."); }
    finally { setSaving(false); }
  };

  const deleteUser = async () => {
    if (!window.confirm(`Delete ${user.full_name}? This cannot be undone.`)) return;
    try {
      await authAPI.deleteUser(id);
      toast.success("User deleted.");
      navigate("/admin/users");
    } catch { toast.error("Delete failed."); }
  };

  if (!user) return <div className="loading-screen">Loading…</div>;

  return (
    <div className="layout">
      <Sidebar role="admin" links={LINKS} />
      <main className="main-content">
        <div className="page-header flex-between">
          <div>
            <h1>{user.full_name}</h1>
            <p>{user.email} — Joined {new Date(user.date_joined).toLocaleDateString()}</p>
            <p className="text-muted">{user.email_verified ? "Verified email" : "Email not verified"} · {user.role}</p>
          </div>
          <button className="btn btn-danger" onClick={deleteUser}>Delete User</button>
        </div>

        <div className="card" style={{ maxWidth: 520 }}>
          <form onSubmit={save}>
            <div className="form-group">
              <label>Account Status</label>
              <select className="form-control" value={form.is_active ? "active" : "disabled"}
                onChange={(e) => setForm({ ...form, is_active: e.target.value === "active" })}>
                <option value="active">Active</option>
                <option value="disabled">Disabled</option>
              </select>
            </div>

            <p className="text-muted mt-2">Exam-creator access is controlled by community owners and managers.</p>

            <div style={{ display: "flex", gap: 12 }}>
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save Changes"}
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => navigate("/admin/users")}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
