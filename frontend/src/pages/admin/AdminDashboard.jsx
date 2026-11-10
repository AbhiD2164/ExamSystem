// src/pages/admin/AdminDashboard.js
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "../../components/common/Sidebar";
import { authAPI } from "../../api/client";

const LINKS = [
  { label: "Dashboard",  path: "/admin",       icon: "⬛" },
  { label: "All Users",  path: "/admin/users",  icon: "👥" },
];

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({ users: 0, admins: 0 });

  useEffect(() => {
    authAPI.listUsers().then(({ data }) => {
      setStats({
        users: data.filter((user) => user.role === "user").length,
        admins: data.filter((user) => user.role === "admin").length,
      });
    }).catch(() => {});
  }, []);

  return (
    <div className="layout">
      <Sidebar role="admin" links={LINKS} />
      <main className="main-content">
        <div className="page-header">
          <h1>Admin Dashboard</h1>
          <p>Manage accounts. Community owners grant exam-creator access.</p>
        </div>

        <div className="stat-grid">
          <div className="stat-card">
            <div className="label">Normal accounts</div>
            <div className="value gold">{stats.users}</div>
          </div>
          <div className="stat-card">
            <div className="label">Administrators</div>
            <div className="value gold">{stats.admins}</div>
          </div>
        </div>

        <div className="card">
          <div className="card-title">Quick Actions</div>
          <div style={{ display: "flex", gap: 12 }}>
            <button className="btn btn-primary" onClick={() => navigate("/admin/users?role=user")}>
              Manage users
            </button>
            <button className="btn btn-ghost" onClick={() => navigate("/communities")}>
              Communities
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
