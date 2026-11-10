import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { authAPI } from "../api/client";
import toast from "react-hot-toast";

export default function PasswordResetPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [stage, setStage] = useState("request");
  const [loading, setLoading] = useState(false);

  const requestCode = async (event) => {
    event.preventDefault();
    setLoading(true);
    try {
      await authAPI.requestPasswordReset({ email });
      setStage("confirm");
      toast.success("If a verified account exists, a reset code has been sent.");
    } catch (error) {
      toast.error(error.response?.data?.email?.[0] || "Could not request a reset code.");
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (event) => {
    event.preventDefault();
    setLoading(true);
    try {
      await authAPI.confirmPasswordReset({ email, code, password });
      toast.success("Password reset. Sign in with your new password.");
      navigate("/login");
    } catch (error) {
      const data = error.response?.data;
      toast.error(data?.code?.[0] || data?.password?.[0] || data?.detail || "Could not reset the password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="card auth-card">
        <div className="page-header">
          <h1>{stage === "request" ? "Reset your password" : "Enter your reset code"}</h1>
          <p>We will email a short-lived verification code. No Google or email-link login is used.</p>
        </div>
        {stage === "request" ? (
          <form onSubmit={requestCode}>
            <div className="form-group">
              <label htmlFor="reset-email">Account email</label>
              <input id="reset-email" className="form-control" type="email" autoComplete="email"
                value={email} onChange={(event) => setEmail(event.target.value)} required />
            </div>
            <button className="btn btn-primary" style={{ width: "100%" }} disabled={loading}>
              {loading ? "Sending…" : "Send reset code"}
            </button>
          </form>
        ) : (
          <form onSubmit={resetPassword}>
            <div className="form-group">
              <label htmlFor="reset-code">Six-digit code sent to {email}</label>
              <input id="reset-code" className="form-control" inputMode="numeric" autoComplete="one-time-code"
                pattern="[0-9]{6}" maxLength={6} value={code}
                onChange={(event) => setCode(event.target.value)} required />
            </div>
            <div className="form-group">
              <label htmlFor="new-password">New password</label>
              <input id="new-password" className="form-control" type="password" autoComplete="new-password"
                minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required />
            </div>
            <button className="btn btn-primary" style={{ width: "100%" }} disabled={loading}>
              {loading ? "Updating…" : "Set new password"}
            </button>
          </form>
        )}
        <p style={{ marginTop: 20, textAlign: "center", color: "var(--text-muted)" }}>
          <Link to="/login">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
