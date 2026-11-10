import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authAPI } from "../api/client";
import { useAuth } from "../context/AuthContext";
import Sidebar from "../components/common/Sidebar";
import toast from "react-hot-toast";

const LINKS = [
  { label: "Dashboard", path: "/student", icon: "⌂" },
  { label: "Communities", path: "/communities", icon: "◎" },
];

const FRONTEND_BASE = window.location.origin;

export default function CommunityPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [communities, setCommunities] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [members, setMembers] = useState([]);
  const [joinRequests, setJoinRequests] = useState([]);
  const [invites, setInvites] = useState([]);
  const [communityForm, setCommunityForm] = useState({
    name: "", organization_type: "college", country: "",
    time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  });
  const [memberForm, setMemberForm] = useState({
    email: "", role: "member", member_group: "", creator_exam_types: [],
  });
  const [inviteForm, setInviteForm] = useState({
    title: "", role: "member", member_group: "", allowed_domain: "", allowed_emails: "", max_uses: "", expires_at: "",
  });
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copiedToken, setCopiedToken] = useState("");
  const selected = communities.find((c) => String(c.id) === String(selectedId));

  const loadCommunities = async () => {
    const { data } = await authAPI.communities();
    setCommunities(data);
    if (!selectedId && data.length) setSelectedId(String(data[0].id));
  };

  useEffect(() => {
    loadCommunities().catch(() => toast.error("Could not load your communities."));
  }, []);

  useEffect(() => {
    if (!selectedId || !selected || !["owner", "manager"].includes(selected.membership_role)) {
      setMembers([]);
      setJoinRequests([]);
      setInvites([]);
      return;
    }
    Promise.all([
      authAPI.communityMembers(selectedId),
      authAPI.communityJoinRequests(selectedId),
      authAPI.communityInvites(selectedId),
    ])
      .then(([memberRes, requestRes, inviteRes]) => {
        setMembers(memberRes.data);
        setJoinRequests(requestRes.data);
        setInvites(inviteRes.data);
      })
      .catch(() => toast.error("Could not load community membership details."));
  }, [selectedId, communities]);

  const createCommunity = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const { data } = await authAPI.createCommunity(communityForm);
      setCommunities((prev) => [...prev, data]);
      setSelectedId(String(data.id));
      setCommunityForm({ ...communityForm, name: "", country: "" });
      toast.success("Community created. You are its owner.");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not create the community.");
    } finally {
      setSaving(false);
    }
  };

  const addMember = async (event) => {
    event.preventDefault();
    if (!selectedId) return;
    if (memberForm.role === "exam_creator" && !memberForm.member_group.trim()) {
      toast.error("Name the authorized group for this exam creator.");
      return;
    }
    if (memberForm.role === "exam_creator" && !memberForm.creator_exam_types.length) {
      toast.error("Select at least one assessment type for this exam creator.");
      return;
    }
    setSaving(true);
    try {
      const { data } = await authAPI.addCommunityMember(selectedId, memberForm);
      setMembers((prev) => [...prev.filter((m) => m.email !== data.email), data]);
      setMemberForm({ email: "", role: "member", member_group: "", creator_exam_types: [] });
      toast.success("Member approved for this community.");
    } catch (error) {
      const d = error.response?.data;
      toast.error(d?.detail || d?.email?.[0] || d?.member_group?.[0] || d?.creator_exam_types?.[0] || "Could not add this member.");
    } finally {
      setSaving(false);
    }
  };

  const requestMembership = async () => {
    try {
      await authAPI.requestCommunityMembership(selectedId);
      await loadCommunities();
      toast.success("Membership request sent. Waiting for admin approval.");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not request community membership.");
    }
  };

  const reviewRequest = async (membershipId, action) => {
    try {
      await authAPI.reviewCommunityJoinRequest(selectedId, membershipId, action);
      setJoinRequests((prev) => prev.filter((r) => r.id !== membershipId));
      if (action === "approve") await loadCommunities();
      toast.success(action === "approve" ? "Membership approved." : "Request rejected.");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not update the membership request.");
    }
  };

  const createInvite = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = {
        title: inviteForm.title,
        role: inviteForm.role,
        member_group: inviteForm.member_group,
        allowed_domain: inviteForm.allowed_domain,
        allowed_emails: inviteForm.allowed_emails,
        max_uses: inviteForm.max_uses ? parseInt(inviteForm.max_uses) : null,
        expires_at: inviteForm.expires_at || null,
      };
      const { data } = await authAPI.createCommunityInvite(selectedId, payload);
      setInvites((prev) => [data, ...prev]);
      setInviteForm({ title: "", role: "member", member_group: "", allowed_domain: "", allowed_emails: "", max_uses: "", expires_at: "" });
      setShowInviteForm(false);
      toast.success("Invite link created. Share it with your candidates.");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not create invite link.");
    } finally {
      setSaving(false);
    }
  };

  const deactivateInvite = async (inviteId) => {
    if (!window.confirm("Deactivate this invite link? It will no longer work for new joiners.")) return;
    try {
      await authAPI.deactivateCommunityInvite(selectedId, inviteId);
      setInvites((prev) => prev.filter((i) => i.id !== inviteId));
      toast.success("Invite link deactivated.");
    } catch {
      toast.error("Could not deactivate the invite link.");
    }
  };

  const copyInviteLink = (token) => {
    const url = `${FRONTEND_BASE}/join/${token}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedToken(token);
      toast.success("Invite link copied to clipboard!");
      setTimeout(() => setCopiedToken(""), 3000);
    });
  };

  const toggleCreatorType = (type) => {
    const types = new Set(memberForm.creator_exam_types);
    if (types.has(type)) types.delete(type);
    else types.add(type);
    setMemberForm({ ...memberForm, creator_exam_types: [...types] });
  };

  return (
    <div className="layout">
      <Sidebar role={user?.role === "admin" ? "admin" : "student"} links={LINKS} />
      <main className="main-content">
        <div className="page-header">
          <h1>Communities &amp; Groups</h1>
          <p>
            Join your college, university, or employer community to participate in exams meant for you.
            Organizations manage member access via invite links — click your invite link to join.
          </p>
        </div>

        <div className="community-grid">
          {/* Admin: Create community */}
          {user?.role === "admin" ? (
            <section className="card">
              <h2 className="card-title">Register a community</h2>
              <form onSubmit={createCommunity}>
                <div className="form-group">
                  <label htmlFor="community-name">Organization name</label>
                  <input id="community-name" className="form-control" required value={communityForm.name}
                    onChange={(e) => setCommunityForm({ ...communityForm, name: e.target.value })} />
                </div>
                <div className="form-group">
                  <label htmlFor="community-type">Organization type</label>
                  <select id="community-type" className="form-control" value={communityForm.organization_type}
                    onChange={(e) => setCommunityForm({ ...communityForm, organization_type: e.target.value })}>
                    <option value="school">School</option>
                    <option value="college">College / university</option>
                    <option value="company">Company / employer</option>
                    <option value="other">Other organization</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="community-country">Country (optional)</label>
                  <input id="community-country" className="form-control" value={communityForm.country}
                    onChange={(e) => setCommunityForm({ ...communityForm, country: e.target.value })} />
                </div>
                <div className="form-group">
                  <label htmlFor="community-zone">IANA time zone</label>
                  <input id="community-zone" className="form-control" required value={communityForm.time_zone}
                    placeholder="Asia/Kolkata"
                    onChange={(e) => setCommunityForm({ ...communityForm, time_zone: e.target.value })} />
                </div>
                <button className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : "Create community"}</button>
              </form>
            </section>
          ) : (
            <section className="card">
              <h2 className="card-title">How communities work</h2>
              <p className="text-muted" style={{ fontSize: 14, lineHeight: 1.6 }}>
                Your college, company, or organization creates a verified community on this platform.
                Community admins send you an <strong>invite link</strong> (via email or other channels).
                Clicking that link and signing in adds you to the community and grants access to its exams.
                You can also <strong>browse and request to join</strong> communities below — your request will be reviewed by an admin.
              </p>
            </section>
          )}

          {/* Find / Browse communities */}
          <section className="card">
            <h2 className="card-title">Find communities</h2>
            {communities.length === 0 ? (
              <p className="text-muted">No communities are available yet.</p>
            ) : (
              <>
                <label className="form-group" htmlFor="community-select">Select a community</label>
                <select id="community-select" className="form-control" value={selectedId}
                  onChange={(e) => setSelectedId(e.target.value)}>
                  {communities.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {c.membership_role || c.join_status || "not a member"}
                    </option>
                  ))}
                </select>

                {selected && (
                  <>
                    <p className="text-muted mt-2" style={{ fontSize: 13 }}>
                      {selected.organization_type?.replaceAll("_", " ")} · {selected.country || "Country not set"} · {selected.time_zone} · {selected.member_count} member(s)
                    </p>

                    {/* Not a member yet */}
                    {!selected.membership_role && (
                      <div className="mt-2">
                        {selected.join_status === "pending" ? (
                          <span className="badge badge-blue">Membership request pending approval</span>
                        ) : (
                          <button className="btn btn-primary" onClick={requestMembership}>
                            {selected.join_status === "rejected" ? "Request membership again" : "Request to join"}
                          </button>
                        )}
                      </div>
                    )}

                    {/* Exam creator shortcut */}
                    {["owner", "manager", "exam_creator"].includes(selected.membership_role) && (
                      <button className="btn btn-primary mt-2" onClick={() => navigate("/examiner")}>
                        Open exam creator workspace
                      </button>
                    )}

                    {/* Owner / Manager tools */}
                    {["owner", "manager"].includes(selected.membership_role) && (
                      <>
                        {/* ── Invite Links Section ───────────────────────── */}
                        <div style={{ marginTop: 24, borderTop: "1px solid var(--border)", paddingTop: 20 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                            <h3 style={{ margin: 0 }}>📨 Invite Links</h3>
                            <button className="btn btn-primary btn-sm" onClick={() => setShowInviteForm((v) => !v)}>
                              {showInviteForm ? "Cancel" : "+ New Invite Link"}
                            </button>
                          </div>

                          <p className="text-muted" style={{ fontSize: 13, marginBottom: 12 }}>
                            Generate shareable links and distribute to students, employees, or candidates via
                            your own channels (email, WhatsApp, etc.). Only people whose email matches the
                            invite criteria can join.
                          </p>

                          {showInviteForm && (
                            <form onSubmit={createInvite} style={{ background: "var(--surface2)", padding: 16, borderRadius: "var(--radius)", marginBottom: 16 }}>
                              <div className="form-group">
                                <label>Invite title / label</label>
                                <input className="form-control" placeholder="e.g. Campus Placement 2026 – CS Dept"
                                  value={inviteForm.title} onChange={(e) => setInviteForm({ ...inviteForm, title: e.target.value })} />
                              </div>
                              <div className="form-grid-2">
                                <div className="form-group">
                                  <label>Role granted on join</label>
                                  <select className="form-control" value={inviteForm.role}
                                    onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}>
                                    <option value="member">Member (take exams)</option>
                                    <option value="manager">Manager</option>
                                  </select>
                                </div>
                                <div className="form-group">
                                  <label>Group label (optional)</label>
                                  <input className="form-control" placeholder="e.g. Batch 2024, CS-A"
                                    value={inviteForm.member_group} onChange={(e) => setInviteForm({ ...inviteForm, member_group: e.target.value })} />
                                </div>
                              </div>
                              <div className="form-group">
                                <label>Restrict to email domain (optional)</label>
                                <input className="form-control" placeholder="e.g. iitb.ac.in — only @iitb.ac.in emails can join"
                                  value={inviteForm.allowed_domain} onChange={(e) => setInviteForm({ ...inviteForm, allowed_domain: e.target.value })} />
                              </div>
                              <div className="form-group">
                                <label>Restrict to specific emails (optional)</label>
                                <textarea className="form-control" rows={3}
                                  placeholder={"candidate1@example.com\ncandidate2@example.com\n(one per line or comma-separated)"}
                                  value={inviteForm.allowed_emails} onChange={(e) => setInviteForm({ ...inviteForm, allowed_emails: e.target.value })} />
                                <div className="text-muted mt-1" style={{ fontSize: 12 }}>
                                  Leave blank to allow any email (or any matching the domain above).
                                </div>
                              </div>
                              <div className="form-grid-2">
                                <div className="form-group">
                                  <label>Max uses (optional)</label>
                                  <input className="form-control" type="number" min={1} placeholder="Unlimited"
                                    value={inviteForm.max_uses} onChange={(e) => setInviteForm({ ...inviteForm, max_uses: e.target.value })} />
                                </div>
                                <div className="form-group">
                                  <label>Expires at (optional)</label>
                                  <input className="form-control" type="datetime-local"
                                    value={inviteForm.expires_at} onChange={(e) => setInviteForm({ ...inviteForm, expires_at: e.target.value })} />
                                </div>
                              </div>
                              <button className="btn btn-primary" type="submit" disabled={saving}>
                                {saving ? "Creating…" : "Generate Invite Link"}
                              </button>
                            </form>
                          )}

                          {invites.length === 0 ? (
                            <p className="text-muted" style={{ fontSize: 13 }}>No invite links yet. Create one above.</p>
                          ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                              {invites.map((inv) => {
                                const url = `${FRONTEND_BASE}/join/${inv.token}`;
                                return (
                                  <div key={inv.id} style={{
                                    background: "var(--surface2)",
                                    border: "1px solid var(--border)",
                                    borderRadius: "var(--radius)",
                                    padding: "12px 14px",
                                  }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                                      <div>
                                        <strong style={{ fontSize: 14 }}>{inv.title || "Untitled invite"}</strong>
                                        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>
                                          Role: <span className="badge badge-blue" style={{ textTransform: "capitalize" }}>{inv.role}</span>
                                          {inv.member_group && <> · Group: {inv.member_group}</>}
                                          {inv.allowed_domain && <> · Domain: @{inv.allowed_domain}</>}
                                          <> · Used: {inv.uses_count}{inv.max_uses ? `/${inv.max_uses}` : ""}</>
                                          {inv.expires_at && <> · Expires: {new Date(inv.expires_at).toLocaleDateString()}</>}
                                        </div>
                                        <div style={{
                                          fontFamily: "monospace",
                                          fontSize: 12,
                                          background: "var(--surface3, var(--surface))",
                                          padding: "4px 8px",
                                          borderRadius: 4,
                                          marginTop: 6,
                                          wordBreak: "break-all",
                                          color: "var(--accent-light)",
                                        }}>{url}</div>
                                      </div>
                                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                                        <button
                                          className="btn btn-secondary btn-sm"
                                          onClick={() => copyInviteLink(inv.token)}
                                        >
                                          {copiedToken === inv.token ? "✓ Copied!" : "Copy link"}
                                        </button>
                                        <button
                                          className="btn btn-ghost btn-sm"
                                          style={{ color: "var(--danger)" }}
                                          onClick={() => deactivateInvite(inv.id)}
                                        >
                                          Deactivate
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* ── Add member by email ───────────────────────── */}
                        <div style={{ marginTop: 24, borderTop: "1px solid var(--border)", paddingTop: 20 }}>
                          <h3>Add member by email</h3>
                          <p className="text-muted" style={{ fontSize: 13 }}>
                            Directly approve a user who already has a verified account on ExMint.
                          </p>
                          <form onSubmit={addMember}>
                            <div className="form-group">
                              <label htmlFor="member-email">Member email</label>
                              <input id="member-email" type="email" className="form-control" required value={memberForm.email}
                                onChange={(e) => setMemberForm({ ...memberForm, email: e.target.value })} />
                            </div>
                            <div className="form-group">
                              <label htmlFor="member-role">Community access</label>
                              <select id="member-role" className="form-control" value={memberForm.role}
                                onChange={(e) => setMemberForm({
                                  ...memberForm,
                                  role: e.target.value,
                                  creator_exam_types: e.target.value === "exam_creator" ? memberForm.creator_exam_types : [],
                                })}>
                                <option value="member">Member — take exams</option>
                                <option value="manager">Manager — approve members and manage assessments</option>
                                <option value="exam_creator">Exam creator — create and manage exams</option>
                              </select>
                            </div>
                            {memberForm.role === "exam_creator" && (
                              <>
                                <div className="form-group">
                                  <label htmlFor="member-group">Authorized group</label>
                                  <input id="member-group" className="form-control" value={memberForm.member_group}
                                    placeholder="e.g. TnP Cell, Faculty - CS"
                                    onChange={(e) => setMemberForm({ ...memberForm, member_group: e.target.value })} />
                                </div>
                                <fieldset className="form-group">
                                  <legend>Assessment types this creator may author</legend>
                                  {[
                                    ["practice", "Practice"],
                                    ["placement", "Placement / entry-level jobs"],
                                    ["internal", "Internal assessment"],
                                    ["member_selection", "Member selection"],
                                    ["other", "Other"],
                                  ].map(([value, label]) => (
                                    <label className="form-check" key={value}>
                                      <input type="checkbox" checked={memberForm.creator_exam_types.includes(value)}
                                        onChange={() => toggleCreatorType(value)} />
                                      <span>{label}</span>
                                    </label>
                                  ))}
                                </fieldset>
                              </>
                            )}
                            <button className="btn btn-primary" disabled={saving}>Add member</button>
                          </form>
                        </div>

                        {/* ── Pending join requests ─────────────────────── */}
                        <div style={{ marginTop: 24, borderTop: "1px solid var(--border)", paddingTop: 20 }}>
                          <h3>Join requests awaiting approval</h3>
                          <div className="member-list">
                            {joinRequests.map((r) => (
                              <div className="member-row" key={r.id}>
                                <span>
                                  <strong>{r.user_name}</strong>
                                  <small>{r.user_email}</small>
                                </span>
                                <span style={{ display: "flex", gap: 8 }}>
                                  <button className="btn btn-primary btn-sm" onClick={() => reviewRequest(r.id, "approve")}>Approve</button>
                                  <button className="btn btn-ghost btn-sm" onClick={() => reviewRequest(r.id, "reject")}>Reject</button>
                                </span>
                              </div>
                            ))}
                            {joinRequests.length === 0 && <p className="text-muted">No pending join requests.</p>}
                          </div>
                        </div>

                        {/* ── Active members ────────────────────────────── */}
                        <div style={{ marginTop: 24, borderTop: "1px solid var(--border)", paddingTop: 20 }}>
                          <h3>Active members ({members.length})</h3>
                          <div className="member-list">
                            {members.map((m) => (
                              <div className="member-row" key={m.id}>
                                <span>
                                  <strong>{m.full_name}</strong>
                                  <small>{m.email}{m.member_group ? ` · ${m.member_group}` : ""}</small>
                                </span>
                                <span className="badge badge-green">
                                  {m.role.replace("_", " ")}
                                  {m.creator_exam_types?.length ? ` · ${m.creator_exam_types.join(", ").replaceAll("_", " ")}` : ""}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </>
                )}
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
