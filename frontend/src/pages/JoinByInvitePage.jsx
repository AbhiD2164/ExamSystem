/**
 * JoinByInvitePage.jsx
 *
 * Handles community invite links in the form:
 *   /join/:token
 *
 * Flow:
 *   1. Load invite info (community name, domain requirement, role).
 *   2. If not logged in → show login/register prompt, preserve token in state.
 *   3. If logged in and email verified → POST join-by-invite.
 *   4. Display result with link to dashboard / communities.
 */
import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { authAPI } from "../api/client";
import { useAuth } from "../context/AuthContext";
import toast from "react-hot-toast";

export default function JoinByInvitePage() {
  const { token } = useParams();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [info, setInfo] = useState(null);
  const [infoLoading, setInfoLoading] = useState(true);
  const [infoError, setInfoError] = useState("");
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [joinError, setJoinError] = useState("");

  // Step 1: Fetch invite metadata
  useEffect(() => {
    if (!token) return;
    setInfoLoading(true);
    authAPI.getInviteInfo(token)
      .then(({ data }) => {
        setInfo(data);
        setInfoError("");
      })
      .catch((err) => {
        const msg =
          err.response?.data?.detail ||
          (err.response?.status === 404 ? "This invite link is invalid or has been removed." : "Could not load invite info.");
        setInfoError(msg);
      })
      .finally(() => setInfoLoading(false));
  }, [token]);

  // Step 2: Auto-join when logged in and info available
  useEffect(() => {
    if (!authLoading && user && info && !joined && !joining && !joinError) {
      handleJoin();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, info]);

  const handleJoin = async () => {
    setJoining(true);
    setJoinError("");
    try {
      await authAPI.joinByInvite(token);
      setJoined(true);
      toast.success(`You have joined ${info?.community_name || "the community"}!`);
    } catch (err) {
      const msg = err.response?.data?.detail || "Could not join this community.";
      setJoinError(msg);
      toast.error(msg);
    } finally {
      setJoining(false);
    }
  };

  if (authLoading || infoLoading) {
    return (
      <div className="auth-wrapper">
        <div className="card auth-card" style={{ textAlign: "center" }}>
          <div className="spinner" style={{ margin: "0 auto 16px" }} />
          <p className="text-muted">Loading invite details…</p>
        </div>
      </div>
    );
  }

  if (infoError) {
    return (
      <div className="auth-wrapper">
        <div className="card auth-card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔗</div>
          <h2 style={{ color: "var(--danger)" }}>Invalid Invite Link</h2>
          <p className="text-muted" style={{ marginBottom: 24 }}>{infoError}</p>
          <Link className="btn btn-primary" to="/login">Go to login</Link>
        </div>
      </div>
    );
  }

  const orgTypeLabel = {
    school: "School",
    college: "College / University",
    company: "Company / Employer",
    other: "Organization",
  }[info?.organization_type] || "Organization";

  if (joined) {
    return (
      <div className="auth-wrapper">
        <div className="card auth-card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>🎉</div>
          <h2 style={{ color: "var(--success, #22c55e)" }}>You're in!</h2>
          <p style={{ marginBottom: 8 }}>
            You have successfully joined <strong>{info?.community_name}</strong>
            {info?.member_group ? ` (${info.member_group})` : ""}.
          </p>
          <p className="text-muted" style={{ marginBottom: 24, fontSize: 13 }}>
            Your membership role: <span className="badge badge-blue" style={{ textTransform: "capitalize" }}>{info?.role}</span>
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button className="btn btn-primary" onClick={() => navigate("/communities")}>
              View My Communities
            </button>
            <button className="btn btn-secondary" onClick={() => navigate("/student")}>
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-wrapper">
      <div className="card auth-card">
        {/* Invite Info Card */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🏫</div>
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
            Join {info?.community_name}
          </h2>
          <p className="text-muted" style={{ fontSize: 14 }}>
            {orgTypeLabel} · {info?.title || "Community invite"}
          </p>
          {info?.member_group && (
            <p className="text-muted" style={{ fontSize: 13, marginTop: 4 }}>
              Group: <strong>{info.member_group}</strong>
            </p>
          )}
          {info?.requires_domain && (
            <div style={{
              background: "var(--surface2)",
              border: "1px solid var(--warning, #f59e0b)",
              borderRadius: "var(--radius)",
              padding: "10px 14px",
              marginTop: 12,
              fontSize: 13,
            }}>
              ⚠️ This group requires an official <strong>@{info.allowed_domain}</strong> email address.
            </div>
          )}
          <p style={{ fontSize: 13, marginTop: 10 }}>
            You will join as: <span className="badge badge-blue" style={{ textTransform: "capitalize" }}>{info?.role}</span>
          </p>
        </div>

        <hr style={{ borderColor: "var(--border)", margin: "0 0 20px" }} />

        {user ? (
          /* Logged-in user: joining in progress or error */
          <div style={{ textAlign: "center" }}>
            {joining ? (
              <>
                <div className="spinner" style={{ margin: "0 auto 12px" }} />
                <p className="text-muted">Joining community…</p>
              </>
            ) : joinError ? (
              <>
                <div style={{ fontSize: 36, marginBottom: 8 }}>❌</div>
                <p style={{ color: "var(--danger)", marginBottom: 16 }}>{joinError}</p>
                <p className="text-muted" style={{ fontSize: 13, marginBottom: 20 }}>
                  You are signed in as <strong>{user.email}</strong>. If this is incorrect,{" "}
                  <Link to="/login" style={{ color: "var(--accent-light)" }}>switch account</Link>.
                </p>
                <button className="btn btn-primary" onClick={handleJoin}>Try Again</button>
              </>
            ) : (
              <>
                <p className="text-muted" style={{ fontSize: 13, marginBottom: 20 }}>
                  Signed in as <strong>{user.email}</strong>
                </p>
                <button className="btn btn-primary btn-lg" onClick={handleJoin}>
                  Join {info?.community_name}
                </button>
              </>
            )}
          </div>
        ) : (
          /* Not logged in: prompt auth */
          <div>
            <p style={{ textAlign: "center", marginBottom: 20, fontSize: 14 }}>
              Please sign in or create an account to join this community.
              Your invite link will still work after signing in.
            </p>
            <div style={{ display: "flex", gap: 12 }}>
              <Link
                className="btn btn-primary"
                style={{ flex: 1, textAlign: "center" }}
                to={`/login?next=/join/${token}`}
              >
                Sign in
              </Link>
              <Link
                className="btn btn-secondary"
                style={{ flex: 1, textAlign: "center" }}
                to={`/register?next=/join/${token}`}
              >
                Create account
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
