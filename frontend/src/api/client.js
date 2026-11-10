// src/api/client.js
// Axios instance with automatic JWT Bearer token injection and refresh on 401.

import axios from "axios";

const BASE_URL =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_URL) ||
  (typeof process !== "undefined" && process.env && process.env.REACT_APP_API_URL) ||
  "/api";

const client = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
});

// Attach access token to every request
client.interceptors.request.use((config) => {
  const token = localStorage.getItem("access");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Refresh token on 401
client.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refresh = localStorage.getItem("refresh");
      if (refresh) {
        try {
          const { data } = await axios.post(`${BASE_URL}/auth/token/refresh/`, { refresh });
          localStorage.setItem("access", data.access);
          original.headers.Authorization = `Bearer ${data.access}`;
          return client(original);
        } catch {
          localStorage.removeItem("access");
          localStorage.removeItem("refresh");
          window.location.href = "/login";
        }
      }
    }
    return Promise.reject(error);
  }
);

export default client;


// ── Auth ─────────────────────────────────────────────────────────────────────
export const authAPI = {
  register: (data) => client.post("/auth/register/", data),
  verifyEmail: (data) => client.post("/auth/verify-email/", data),
  resendVerification: (data) => client.post("/auth/resend-verification/", data),
  requestEmailChange: (data) => client.post("/auth/request-email-change/", data),
  confirmEmailChange: (data) => client.post("/auth/confirm-email-change/", data),
  login: (data) => client.post("/auth/login/", data),
  logout: (refresh) => client.post("/auth/logout/", { refresh }),
  me: () => client.get("/auth/me/"),
  changePassword: (data) => client.post("/auth/change-password/", data),
  listUsers: (role) => client.get("/auth/users/", { params: role ? { role } : {} }),
  getUser: (id) => client.get(`/auth/users/${id}/`),
  updateUser: (id, data) => client.patch(`/auth/users/${id}/`, data),
  deleteUser: (id) => client.delete(`/auth/users/${id}/`),
  communities: () => client.get("/auth/communities/"),
  createCommunity: (data) => client.post("/auth/communities/", data),
  communityMembers: (id) => client.get(`/auth/communities/${id}/members/`),
  addCommunityMember: (id, data) => client.post(`/auth/communities/${id}/members/`, data),
  requestCommunityMembership: (id) => client.post(`/auth/communities/${id}/join/`),
  communityJoinRequests: (id) => client.get(`/auth/communities/${id}/join-requests/`),
  reviewCommunityJoinRequest: (id, membershipId, action) =>
    client.patch(`/auth/communities/${id}/join-requests/${membershipId}/`, { action }),
  // Community Invite Links
  communityInvites: (communityId) => client.get(`/auth/communities/${communityId}/invites/`),
  createCommunityInvite: (communityId, data) => client.post(`/auth/communities/${communityId}/invites/`, data),
  deactivateCommunityInvite: (communityId, inviteId) => client.delete(`/auth/communities/${communityId}/invites/${inviteId}/`),
  getInviteInfo: (token) => client.get(`/auth/communities/invite-info/${token}/`),
  joinByInvite: (token) => client.post("/auth/communities/join-by-invite/", { token }),
  requestPasswordReset: (data) => client.post("/auth/password-reset/request/", data),
  confirmPasswordReset: (data) => client.post("/auth/password-reset/confirm/", data),
};


// ── Exams ─────────────────────────────────────────────────────────────────────
export const examAPI = {
  // Examiner
  list: () => client.get("/exams/"),
  create: (data) => client.post("/exams/", data),
  get: (id) => client.get(`/exams/${id}/`),
  update: (id, data) => client.patch(`/exams/${id}/`, data),
  delete: (id) => client.delete(`/exams/${id}/`),

  // Questions
  listQuestions: (examId) => client.get(`/exams/${examId}/questions/`),
  createQuestion: (examId, data) => client.post(`/exams/${examId}/questions/`, data),
  updateQuestion: (examId, qId, data) => client.patch(`/exams/${examId}/questions/${qId}/`, data),
  deleteQuestion: (examId, qId) => client.delete(`/exams/${examId}/questions/${qId}/`),

  // Submissions (examiner)
  listSubmissions: (examId) => client.get(`/exams/${examId}/submissions/`),
  gradeSubmission: (subId, data) => client.patch(`/exams/submissions/${subId}/grade/`, data),

  // Student
  myExams: () => client.get("/exams/my-exams/"),
  myExamDetail: (id) => client.get(`/exams/my-exams/${id}/`),
  mySubmission: (examId) => client.get(`/exams/my-exams/${examId}/submission/`),
  submit: (data) => client.post("/exams/submit/", data),
  saveAnswer: (data) => client.post("/exams/save-answer/", data),
};


// ── Proctoring ────────────────────────────────────────────────────────────────
export const proctoringAPI = {
  report: (data) => client.post("/proctoring/violations/", data),
  list: (submissionId) =>
    client.get("/proctoring/violations/list/", {
      params: submissionId ? { submission_id: submissionId } : {},
    }),
};


// ── Results ───────────────────────────────────────────────────────────────────
export const resultsAPI = {
  myResults: () => client.get("/results/my-results/"),
  myResultDetail: (examId) => client.get(`/results/my-results/${examId}/`),
  examResults: (examId) => client.get(`/results/exam/${examId}/`),
};
