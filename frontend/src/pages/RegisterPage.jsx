import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { authAPI } from "../api/client";
import { useAuth } from "../context/AuthContext";
import toast from "react-hot-toast";

export default function RegisterPage() {
  const { register, verifyEmail } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextPath = searchParams.get("next") || "/student";

  const [stage, setStage] = useState("register");
  const [form, setForm] = useState({
    email: "",
    full_name: "",
    institution_name: "",
    department: "",
    password: "",
  });
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  const submitRegistration = async (event) => {
    event.preventDefault();
    setLoading(true);
    try {
      await register(form);
      setStage("verify");
      toast.success("Check your inbox for a six-digit verification code.");
    } catch (error) {
      const errData = error.response?.data;
      const message =
        errData?.email?.[0] ||
        errData?.detail ||
        "Could not create your account.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const submitVerification = async (event) => {
    event.preventDefault();
    setLoading(true);
    try {
      await verifyEmail(form.email, code);
      toast.success("Email verified! Welcome to ExMint.");
      navigate(nextPath);
    } catch (error) {
      const message = error.response?.data?.code?.[0] || error.response?.data?.detail;
      toast.error(message || "The code could not be verified.");
    } finally {
      setLoading(false);
    }
  };

  const resendCode = async () => {
    try {
      await authAPI.resendVerification({ email: form.email });
      toast.success("A fresh verification code has been sent.");
    } catch {
      toast.error("Could not resend the code. Try again shortly.");
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="card auth-card">
        <div style={{ textAlign: "center", marginBottom: 26 }}>
          <div className="exmint-brand-logo" style={{ justifyContent: "center", marginBottom: 16 }}>
            <div className="exmint-logo-icon"><span aria-hidden="true">✦</span></div>
            <div className="exmint-logo-text">ExMint<span className="exmint-logo-tag">Universal LMS</span></div>
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>
            {stage === "register" ? "Create your account" : "Verify your email"}
          </h2>
          <p style={{ color: "var(--text-muted)", fontSize: 13.5 }}>
            {stage === "register"
              ? "Register with your email address. Join your organization community after signing in."
              : `Enter the six-digit code sent to ${form.email}.`}
          </p>
        </div>

        {stage === "register" ? (
          <form onSubmit={submitRegistration}>
            <div className="form-group">
              <label htmlFor="full_name">Full Name *</label>
              <input
                id="full_name"
                className="form-control"
                value={form.full_name}
                required
                autoComplete="name"
                placeholder="e.g. Alex Vance"
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label htmlFor="email">Email Address *</label>
              <input
                id="email"
                className="form-control"
                type="email"
                value={form.email}
                required
                autoComplete="email"
                placeholder="e.g. alex@university.edu"
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
              <div className="text-muted mt-1" style={{ fontSize: 11.5 }}>
                💡 Use your official institutional or work email if your organization requires it.
              </div>
            </div>

            <div className="form-grid-2">
              <div className="form-group">
                <label htmlFor="institution_name">School / Institute</label>
                <input
                  id="institution_name"
                  className="form-control"
                  value={form.institution_name}
                  placeholder="e.g. IIT Bombay"
                  onChange={(e) => setForm({ ...form, institution_name: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label htmlFor="department">Department</label>
                <input
                  id="department"
                  className="form-control"
                  value={form.department}
                  placeholder="e.g. Computer Science"
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="password">Password *</label>
              <input
                id="password"
                className="form-control"
                type="password"
                value={form.password}
                required
                minLength={8}
                placeholder="Minimum 8 characters"
                autoComplete="new-password"
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>

            <button
              className="btn btn-primary"
              style={{ width: "100%", padding: "12px", marginTop: 4 }}
              type="submit"
              disabled={loading}
            >
              {loading ? "Creating account…" : "Create Account →"}
            </button>
          </form>
        ) : (
          <form onSubmit={submitVerification}>
            <div className="form-group">
              <label htmlFor="verification-code">Email verification code</label>
              <input
                id="verification-code"
                className="form-control"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="6-digit code"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                required
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            <button
              className="btn btn-primary"
              style={{ width: "100%", padding: "12px" }}
              type="submit"
              disabled={loading}
            >
              {loading ? "Verifying…" : "Verify Email & Continue →"}
            </button>
            <button
              className="btn btn-ghost"
              style={{ width: "100%", marginTop: 10 }}
              type="button"
              onClick={resendCode}
            >
              Resend Code
            </button>
          </form>
        )}

        <div style={{ marginTop: 22, textAlign: "center", fontSize: 13.5, color: "var(--text-muted)" }}>
          {stage === "verify" ? "Wrong email? " : "Already have an account? "}
          {stage === "verify" ? (
            <button className="link-button" type="button" onClick={() => setStage("register")}>
              Edit registration
            </button>
          ) : (
            <Link to="/login" style={{ fontWeight: 600 }}>Sign in</Link>
          )}
        </div>
      </div>
    </div>
  );
}
