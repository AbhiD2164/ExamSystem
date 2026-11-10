import React, { useState } from "react";
import { authAPI } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import toast from "react-hot-toast";

export default function AccountSettingsModal({ isOpen, onClose }) {
  const { user, reload } = useAuth();
  const [step, setStep] = useState("idle"); // idle | enter_code
  const [newEmail, setNewEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [alertInfo, setAlertInfo] = useState("");

  if (!isOpen) return null;

  const handleRequestChange = async (e) => {
    e.preventDefault();
    if (!newEmail || !newEmail.includes("@")) {
      toast.error("Please enter a valid email address.");
      return;
    }
    setLoading(true);
    try {
      const res = await authAPI.requestEmailChange({ new_email: newEmail });
      setAlertInfo(res.data?.alert || "Verification code dispatched.");
      setStep("enter_code");
      toast.success(res.data?.detail || "Verification code sent to your new email.");
    } catch (err) {
      const msg = err.response?.data?.detail || "Could not request email change.";
      toast.error(msg);
      if (err.response?.data?.alert) {
        setAlertInfo(err.response.data.alert);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmChange = async (e) => {
    e.preventDefault();
    if (!code || code.length !== 6) {
      toast.error("Please enter the 6-digit verification code.");
      return;
    }
    setLoading(true);
    try {
      const res = await authAPI.confirmEmailChange({ code });
      toast.success(res.data?.detail || "Email address updated successfully!");
      if (reload) await reload();
      setStep("idle");
      setNewEmail("");
      setCode("");
      onClose();
    } catch (err) {
      const msg = err.response?.data?.code?.[0] || err.response?.data?.detail || "Invalid or expired code.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const canChangeEmail = user?.can_change_email !== false && (user?.email_change_cooldown_days || 0) === 0;

  return (
    <div className="modal-backdrop" style={{ zIndex: 9999 }}>
      <div className="modal" style={{ maxWidth: 540 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Account Profile & Security</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose} style={{ padding: "4px 8px" }}>✕</button>
        </div>

        {/* User Profile Card */}
        <div style={{
          background: "var(--surface2)",
          borderRadius: "var(--radius)",
          padding: 16,
          marginBottom: 20,
          border: "1px solid var(--border)",
        }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 13 }}>
            <div>
              <span className="text-muted" style={{ display: "block", fontSize: 11 }}>FULL NAME</span>
              <strong>{user?.full_name}</strong>
            </div>
            <div>
              <span className="text-muted" style={{ display: "block", fontSize: 11 }}>ACCOUNT ROLE</span>
              <span className="badge badge-blue" style={{ textTransform: "capitalize" }}>{user?.role}</span>
            </div>
            <div>
              <span className="text-muted" style={{ display: "block", fontSize: 11 }}>INSTITUTION</span>
              <span>{user?.institution_name || "Not set"}</span>
            </div>
            <div>
              <span className="text-muted" style={{ display: "block", fontSize: 11 }}>DEPARTMENT</span>
              <span>{user?.department || "Not set"}</span>
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <span className="text-muted" style={{ display: "block", fontSize: 11 }}>PRIMARY REGISTERED EMAIL</span>
              <span style={{ color: "var(--accent-light)", fontWeight: 600 }}>{user?.email}</span>
              {" "}
              {user?.email_verified && <span className="badge badge-green" style={{ fontSize: 10 }}>Verified ✓</span>}
            </div>
          </div>
        </div>

        {/* Email Modification Section with 6-Month Validation */}
        <div style={{
          background: "rgba(99, 102, 241, 0.05)",
          border: "1px solid rgba(99, 102, 241, 0.2)",
          borderRadius: "var(--radius)",
          padding: 18,
          marginBottom: 16,
        }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Email Address Management</h3>
          
          {/* Prominent Mandatory Alert */}
          <div style={{
            background: "rgba(245, 158, 11, 0.12)",
            border: "1px solid rgba(245, 158, 11, 0.3)",
            borderRadius: "var(--radius-sm)",
            padding: "10px 12px",
            fontSize: 12.5,
            color: "var(--warning)",
            marginBottom: 14,
          }}>
            ⚠️ <strong>Policy Warning:</strong> Email addresses can only be changed once every 6 months (180 days). Please avoid changing your email address unnecessarily to maintain examination and identity security.
          </div>

          {!canChangeEmail ? (
            <div style={{
              background: "var(--surface2)",
              padding: 12,
              borderRadius: "var(--radius-sm)",
              fontSize: 13,
              color: "var(--text-muted)",
            }}>
              🔒 <strong>Email Change Locked:</strong> You recently modified your email.
              {user?.last_email_changed_at && (
                <div style={{ marginTop: 4, fontSize: 12 }}>
                  Last changed: {new Date(user.last_email_changed_at).toLocaleDateString()}
                </div>
              )}
              <div style={{ color: "var(--accent-light)", fontWeight: 600, marginTop: 4 }}>
                Next change allowed in {user?.email_change_cooldown_days} days.
              </div>
            </div>
          ) : step === "idle" ? (
            <form onSubmit={handleRequestChange}>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12.5 }}>New Email Address</label>
                <input
                  className="form-control"
                  type="email"
                  value={newEmail}
                  required
                  placeholder="Enter your new email address"
                  onChange={(e) => setNewEmail(e.target.value)}
                />
              </div>
              <button className="btn btn-primary btn-sm" type="submit" disabled={loading} style={{ width: "100%" }}>
                {loading ? "Sending Code…" : "Send Verification Code to New Email →"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleConfirmChange}>
              <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 10 }}>
                Enter the 6-digit confirmation code dispatched to <strong>{newEmail || user?.pending_email}</strong>:
              </div>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <input
                  className="form-control"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  required
                  placeholder="6-digit verification code"
                  onChange={(e) => setCode(e.target.value)}
                />
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => setStep("idle")}>
                  ← Back
                </button>
                <button className="btn btn-success btn-sm" type="submit" disabled={loading} style={{ flex: 1 }}>
                  {loading ? "Verifying…" : "Confirm & Update Email ✓"}
                </button>
              </div>
            </form>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
