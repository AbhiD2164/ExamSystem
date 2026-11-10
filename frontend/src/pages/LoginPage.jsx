// src/pages/LoginPage.js
import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import toast from "react-hot-toast";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextPath = searchParams.get("next") || null;

  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const user = await login(form.email, form.password);
      toast.success(`Welcome back, ${user.full_name}!`);
      if (nextPath) navigate(nextPath);
      else if (user.role === "admin") navigate("/admin");
      else navigate("/student");
    } catch (err) {
      const detail = err.response?.data?.email?.[0] || err.response?.data?.detail;
      toast.error(detail || "Invalid credentials. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="card" style={{ width: "100%", maxWidth: 440, padding: 36, borderColor: "var(--border)" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ display: "inline-flex", justifyContent: "center", marginBottom: 12 }}>
            <div className="exmint-brand-logo">
              <div className="exmint-logo-icon" style={{ width: 44, height: 44 }}>
                <svg viewBox="0 0 24 24" style={{ width: 24, height: 24 }}>
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
              </div>
              <div className="exmint-logo-text" style={{ fontSize: 26 }}>
                ExMint
                <span className="exmint-logo-tag">Intelligent LMS</span>
              </div>
            </div>
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: 14 }}>
            Sign in to access your exams, evaluations & learning space
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email Address</label>
            <input
              className="form-control"
              type="email"
              placeholder="e.g. examinee@exmint.io"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </div>

          <div style={{ textAlign: "right", marginTop: -10, marginBottom: 14, fontSize: 13 }}>
            <Link to="/password-reset">Forgot password?</Link>
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              className="form-control"
              type="password"
              placeholder="••••••••"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
          </div>

          <button
            className="btn btn-primary"
            style={{ width: "100%", marginTop: 8 }}
            type="submit"
            disabled={loading}
          >
            {loading ? "Authenticating…" : "Sign In to ExMint →"}
          </button>
        </form>

        <div style={{ marginTop: 24, textAlign: "center", fontSize: 14, color: "var(--text-muted)" }}>
          Don't have an account?{" "}
          <Link to="/register" style={{ fontWeight: 600 }}>Create an account</Link>
        </div>
      </div>
    </div>
  );
}
