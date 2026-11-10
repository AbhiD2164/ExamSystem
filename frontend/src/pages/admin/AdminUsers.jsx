// src/pages/admin/AdminUsers.js
import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Sidebar from "../../components/common/Sidebar";
import { authAPI } from "../../api/client";
import toast from "react-hot-toast";

const LINKS = [
  { label: "Dashboard",  path: "/admin",       icon: "⬛" },
  { label: "All Users",  path: "/admin/users",  icon: "👥" },
];

const roleBadge = { admin: "badge-blue", user: "badge-green" };

export default function AdminUsers() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const roleFilter = searchParams.get("role") || "";

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState(roleFilter);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data } = await authAPI.listUsers(filter || undefined);
      setUsers(data);
    } catch { toast.error("Failed to load users."); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchUsers(); }, [filter]); // eslint-disable-line

  const toggleActive = async (user) => {
    try {
      await authAPI.updateUser(user.id, { is_active: !user.is_active });
      toast.success(`User ${user.is_active ? "deactivated" : "activated"}.`);
      fetchUsers();
    } catch { toast.error("Update failed."); }
  };

  return (
    <div className="layout">
      <Sidebar role="admin" links={LINKS} />
      <main className="main-content">
        <div className="page-header flex-between">
          <div>
            <h1>Users</h1>
            <p>Manage verified accounts. Community owners control exam-creator access.</p>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", gap: 8 }}>
            {["", "user", "admin"].map((r) => (
              <button key={r} className={`btn btn-sm ${filter === r ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setFilter(r)}>
                {r === "user" ? "Users" : r === "admin" ? "Admins" : "All"}
              </button>
            ))}
          </div>
        </div>

        <div className="card">
          {loading ? <p className="text-muted">Loading…</p> : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th><th>Email</th><th>Role</th>
                    <th>Can Create Exam</th><th>Can Publish Results</th>
                    <th>Status</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td>{u.full_name}</td>
                      <td style={{ color: "var(--text-muted)" }}>{u.email}</td>
                      <td><span className={`badge ${roleBadge[u.role]}`}>{u.role}</span></td>
                      <td>{u.can_create_exam ? "✅" : "—"}</td>
                      <td>{u.can_publish_results ? "✅" : "—"}</td>
                      <td>
                        <span className={`badge ${u.is_active ? "badge-green" : "badge-red"}`}>
                          {u.is_active ? "Active" : "Disabled"}
                        </span>
                      </td>
                      <td style={{ display: "flex", gap: 6 }}>
                        <button className="btn btn-ghost btn-sm"
                          onClick={() => navigate(`/admin/users/${u.id}`)}>Edit</button>
                        <button className={`btn btn-sm ${u.is_active ? "btn-danger" : "btn-success"}`}
                          onClick={() => toggleActive(u)}>
                          {u.is_active ? "Disable" : "Enable"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {users.length === 0 && <p className="text-muted mt-3">No users found.</p>}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
