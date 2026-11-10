// src/components/common/Sidebar.js
import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import AccountSettingsModal from "./AccountSettingsModal";
import toast from "react-hot-toast";

export default function Sidebar({ role, links }) {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [profileModalOpen, setProfileModalOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    toast.success("Logged out.");
    navigate("/login");
  };

  const roleLabel = {
    admin: "Admin Studio",
    examiner: "Community workspace",
    student: "My workspace",
  };

  return (
    <>
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="exmint-brand-logo" onClick={() => navigate(`/${role || "login"}`)}>
            <div className="exmint-logo-icon">
              <svg viewBox="0 0 24 24">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
            <div className="exmint-logo-text">
              ExMint
              <span className="exmint-logo-tag">Universal LMS</span>
            </div>
          </div>
          <div className="sidebar-badge">{roleLabel[role] ?? "ExMint Panel"}</div>
        </div>

        <nav>
          {links.map(({ label, path, icon }) => (
            <div
              key={path}
              className={`nav-item ${pathname === path || (path !== `/${role}` && pathname.startsWith(path)) ? "active" : ""}`}
              onClick={() => navigate(path)}
            >
              <span>{icon}</span>
              {label}
            </div>
          ))}
          {!links.some((link) => link.path === "/communities") && (
            <div className={`nav-item ${pathname.startsWith("/communities") ? "active" : ""}`}
              onClick={() => navigate("/communities")}>
              <span>◎</span>
              Communities
            </div>
          )}
        </nav>

        <div className="sidebar-footer">
          <div
            style={{
              padding: "8px 10px",
              background: "var(--surface2)",
              borderRadius: "var(--radius-sm)",
              marginBottom: 10,
              cursor: "pointer",
              transition: "background 0.2s ease",
            }}
            onClick={() => setProfileModalOpen(true)}
            title="Click to view Account Profile & Email Settings"
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ color: "var(--text)", fontSize: 13, display: "block" }}>{user?.full_name}</strong>
              <span style={{ fontSize: 11, color: "var(--accent-light)" }}>⚙ Settings</span>
            </div>
            <span style={{ fontSize: 11, color: "var(--text-dim)", display: "block", textOverflow: "ellipsis", overflow: "hidden" }}>
              {user?.email}
            </span>
          </div>
          <button className="btn btn-ghost btn-sm" style={{ width: "100%" }} onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </aside>

      <AccountSettingsModal isOpen={profileModalOpen} onClose={() => setProfileModalOpen(false)} />
    </>
  );
}
