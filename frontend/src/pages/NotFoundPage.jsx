// src/pages/NotFoundPage.jsx
import React from "react";
import { Link, useNavigate } from "react-router-dom";

export default function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px",
      background: "radial-gradient(ellipse at 50% 20%, var(--accent-bg) 0%, transparent 60%), var(--bg)",
      textAlign: "center"
    }}>
      <div className="card" style={{ maxWidth: 480, padding: 40 }}>
        <div style={{
          fontSize: 64,
          fontWeight: 800,
          fontFamily: "var(--font-heading)",
          background: "linear-gradient(135deg, var(--accent-light) 0%, var(--accent) 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          lineHeight: 1,
          marginBottom: 16
        }}>
          404
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>Resource or Page Not Found</h2>
        <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 24 }}>
          The requested examination page, user identifier, or endpoint does not exist or has been relocated.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <button className="btn btn-primary" onClick={() => navigate(-1)}>
            ← Go Back
          </button>
          <Link to="/" className="btn btn-ghost">
            Return Home
          </Link>
        </div>
      </div>
    </div>
  );
}
