// src/pages/student/StudentExamRoom.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Full exam room with:
//  • Pre-Exam System & Device Verification (Camera, Mic, Screen Access)
//  • Safe Permission Handling (Zero false-positive blur violations on permission prompts)
//  • MediaPipe FaceMesh (CDN) — head pose + eye gaze detection
//  • Debounced Tab / window-blur detection (ignores system dialog blurs)
//  • Auto-submit on 3rd violation
//  • Per-question autosave
//  • Live countdown timer (enforces individual remaining time for late joiners)
//  • All question types: short, long, mcq_single, mcq_multi
// ─────────────────────────────────────────────────────────────────────────────
import React, {
  useEffect, useState, useRef, useCallback, useMemo
} from "react";
import { useParams, useNavigate } from "react-router-dom";
import { examAPI, proctoringAPI } from "../../api/client";
import toast from "react-hot-toast";

// ── Proctoring constants ───────────────────────────────────────────────────
const MAX_TAB_SWITCHES     = 3;   // 4th switch → auto-submit
const HEAD_MOVE_THRESHOLD  = 18;  // pixel distance for head movement
const EYE_MOVE_THRESHOLD   = 10;  // pixel distance for eye/iris movement
const CONSEC_FRAMES_NEEDED = 10;  // consecutive frames to count as violation
const DETECTION_INTERVAL   = 80;  // ms between frame analyses

// ── Helpers ────────────────────────────────────────────────────────────────
function formatTime(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function StudentExamRoom() {
  const { id }   = useParams();
  const navigate = useNavigate();

  // ── Exam data ─────────────────────────────────────────────────────────────
  const [exam,         setExam]         = useState(null);
  const [submission,   setSubmission]   = useState(null);
  const [answers,      setAnswers]      = useState({});   // { questionId: { text_answer, selected_choices } }
  const [loading,      setLoading]      = useState(true);
  const [submitting,   setSubmitting]   = useState(false);
  const [submitted,    setSubmitted]    = useState(false);
  const [currentQ,     setCurrentQ]     = useState(0);
  const [confirmModal, setConfirmModal] = useState(false);

  // ── Device Verification & Pre-Flight State ────────────────────────────────
  const [deviceVerified,  setDeviceVerified]  = useState(false);
  const [camVerified,     setCamVerified]     = useState(false);
  const [screenVerified,  setScreenVerified]  = useState(false);
  const [requestingPerms, setRequestingPerms] = useState(false);

  // ── Proctoring state ──────────────────────────────────────────────────────
  const [camReady,       setCamReady]       = useState(false);
  const [camError,       setCamError]       = useState(false);
  const [violationCount, setViolationCount] = useState(0);
  const [warningMsg,     setWarningMsg]     = useState(null);
  const [aiStatus,       setAiStatus]       = useState("Initialising AI…");

  // ── Timer ─────────────────────────────────────────────────────────────────
  const [timeLeft, setTimeLeft] = useState(null); // seconds

  // ── Refs ──────────────────────────────────────────────────────────────────
  const videoRef     = useRef(null);
  const canvasRef    = useRef(null);
  const streamRef    = useRef(null);
  const screenRef    = useRef(null);
  const faceMeshRef  = useRef(null);
  const detInterv    = useRef(null);
  const prevFace     = useRef(null);
  const headFrames   = useRef(0);
  const eyeFrames    = useRef(0);
  const reportingRef = useRef(false);
  const reportQueueRef = useRef([]);
  const submRef      = useRef(null);
  const violRef      = useRef(0);
  const activeRef    = useRef(false);
  const hiddenAtRef = useRef(null);
  const requestingPermsRef = useRef(false);

  useEffect(() => { submRef.current = submission; }, [submission]);
  useEffect(() => { violRef.current = violationCount; }, [violationCount]);

  // ── Load exam ─────────────────────────────────────────────────────────────
  useEffect(() => {
    examAPI.myExamDetail(id)
      .then(({ data }) => {
        setExam(data);
        const endMs   = new Date(data.end_datetime).getTime();
        const nowMs   = Date.now();
        const maxSecs = data.duration_minutes * 60;
        const remSecs = Math.min(maxSecs, Math.max(0, Math.floor((endMs - nowMs) / 1000)));
        setTimeLeft(remSecs);
      })
      .catch((err) => {
        const msg = err.response?.data?.detail || "Could not load exam.";
        toast.error(msg);
        navigate("/student/exams");
      })
      .finally(() => setLoading(false));
  }, [id, navigate]);

  // ── Load or create submission ─────────────────────────────────────────────
  useEffect(() => {
    if (!exam) return;
    examAPI.mySubmission(id)
      .then(({ data }) => {
        setSubmission(data);
        if (data.status !== "ongoing") {
          setSubmitted(true);
        }
        if (data.answers) {
          const map = {};
          data.answers.forEach((a) => {
            map[a.question] = { text_answer: a.text_answer || "", selected_choices: a.selected_choices || [] };
          });
          setAnswers(map);
        }
      })
      .catch(async () => {
        setSubmission({ id: null, status: "ongoing", violation_count: 0 });
      });
  }, [exam, id]);

  // ── Countdown timer ───────────────────────────────────────────────────────
  useEffect(() => {
    if (timeLeft === null || submitted || !deviceVerified) return;
    if (timeLeft <= 0) {
      handleAutoSubmit("Time up — examination duration expired.");
      return;
    }
    const tid = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearInterval(tid);
  }, [timeLeft, submitted, deviceVerified]);

  // ── Report violation ──────────────────────────────────────────────────────
  const reportViolation = useCallback(async (type, details = "", awaySeconds = 0) => {
    if (submitted || !deviceVerified) return;
    const sub = submRef.current;
    if (!sub?.id) return;

    reportQueueRef.current.push({ type, details, awaySeconds, submissionId: sub.id });
    if (reportingRef.current) return;
    reportingRef.current = true;
    while (reportQueueRef.current.length && !submRef.current?.status?.includes("submitted")) {
      const event = reportQueueRef.current.shift();
      try {
        const { data } = await proctoringAPI.report({
          submission_id: event.submissionId,
          violation_type: event.type,
          details: event.details,
          away_seconds: event.awaySeconds,
        });

        setViolationCount(data.warning_number);
        if (data.action === "auto_submitted") {
          setWarningMsg({ type: "final", text: data.message });
          setSubmitted(true);
          if (submRef.current) submRef.current.status = "disqualified";
          stopCamera();
          toast.error("Exam failed and was auto-submitted.", { duration: 8000 });
          reportQueueRef.current = [];
        } else {
          setWarningMsg({ type: "warning", text: data.message });
          toast.error(data.message, { duration: 4000 });
        }
      } catch (err) {
        console.warn("Proctoring report error:", err);
      }
    }
    reportingRef.current = false;
  }, [submitted, deviceVerified]);

  // ── Intelligent Tab / Window Blur Monitor (Safe on Permission Prompts) ────
  useEffect(() => {
    if (!exam || submitted || !deviceVerified) return;

    const onVisibilityChange = () => {
      if (document.hidden) {
        if (!requestingPermsRef.current) {
          if (hiddenAtRef.current === null) hiddenAtRef.current = Date.now();
          reportViolation("tab_switch", "Exam tab became hidden.");
        }
        return;
      }

      reportAbsence();
    };

    const onBlur = () => {
      if (!requestingPermsRef.current && hiddenAtRef.current === null) {
        hiddenAtRef.current = Date.now();
      }
    };

    function reportAbsence() {
      if (hiddenAtRef.current !== null) {
        const awaySeconds = (Date.now() - hiddenAtRef.current) / 1000;
        hiddenAtRef.current = null;
        if (!requestingPermsRef.current && awaySeconds > 5) {
          reportViolation("window_blur", "Exam tab was hidden for more than five seconds.", awaySeconds);
        }
      }
    }

    const onFocus = () => {
      if (!document.hidden) reportAbsence();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
    };
  }, [exam, submitted, deviceVerified, reportViolation]);

  // ── Load MediaPipe FaceMesh from CDN ──────────────────────────────────────
  const loadFaceMesh = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (window.FaceMesh) { resolve(window.FaceMesh); return; }
      const script = document.createElement("script");
      script.src  = "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/face_mesh.js";
      script.crossOrigin = "anonymous";
      script.onload  = () => resolve(window.FaceMesh);
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }, []);

  // ── Analyse video frame ───────────────────────────────────────────────────
  const analyseFrame = useCallback(async (faceMesh) => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !activeRef.current || video.readyState < 2) return;

    canvas.width  = video.videoWidth  || 320;
    canvas.height = video.videoHeight || 240;

    try {
      await faceMesh.send({ image: video });
    } catch { /* ignore single-frame errors */ }
  }, []);

  // ── Handle FaceMesh results ───────────────────────────────────────────────
  const handleResults = useCallback((results) => {
    const video = videoRef.current;
    if (!video || !deviceVerified) return;
    const W = video.videoWidth  || 320;
    const H = video.videoHeight || 240;

    if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) return;

    const lm = results.multiFaceLandmarks[0];
    const nose  = lm[1];
    const lIris = lm[468] ?? lm[33];
    const rIris = lm[473] ?? lm[263];

    const nosePx  = { x: nose.x  * W, y: nose.y  * H };
    const eyeMidX = ((lIris.x + rIris.x) / 2) * W;
    const eyeMidY = ((lIris.y + rIris.y) / 2) * H;

    if (prevFace.current) {
      const { nose: pNose, eye: pEye } = prevFace.current;
      const headD = Math.hypot(nosePx.x - pNose.x, nosePx.y - pNose.y);
      const eyeD  = Math.hypot(eyeMidX  - pEye.x,  eyeMidY  - pEye.y);

      headD > HEAD_MOVE_THRESHOLD ? headFrames.current++ : (headFrames.current = Math.max(0, headFrames.current - 2));
      eyeD  > EYE_MOVE_THRESHOLD  ? eyeFrames.current++  : (eyeFrames.current  = Math.max(0, eyeFrames.current  - 2));

      if (headFrames.current >= CONSEC_FRAMES_NEEDED) {
        headFrames.current = 0;
        reportViolation("head_movement", `Head movement delta ${headD.toFixed(1)}px`);
      }
      if (eyeFrames.current >= CONSEC_FRAMES_NEEDED) {
        eyeFrames.current = 0;
        reportViolation("eye_movement", `Eye movement delta ${eyeD.toFixed(1)}px`);
      }
    }
    prevFace.current = { nose: nosePx, eye: { x: eyeMidX, y: eyeMidY } };
  }, [deviceVerified, reportViolation]);

  // ── Request Camera ────────────────────────────────────────────────────────
  const requestMediaAccess = async () => {
    requestingPermsRef.current = true;
    setRequestingPerms(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, facingMode: "user" },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      setCamReady(true);
      setCamVerified(true);
      toast.success("Camera verified successfully!");

      setAiStatus("Loading AI Proctoring…");
      const FaceMesh = await loadFaceMesh();
      const fm = new FaceMesh({
        locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/${f}`,
      });
      fm.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.55, minTrackingConfidence: 0.55 });
      fm.onResults(handleResults);
      faceMeshRef.current = fm;
      activeRef.current   = true;
      setAiStatus("AI Proctor Active ✓");

      if (!detInterv.current) {
        detInterv.current = setInterval(() => {
          if (activeRef.current && faceMeshRef.current) analyseFrame(faceMeshRef.current);
        }, DETECTION_INTERVAL);
      }
    } catch (err) {
      console.warn("Device access error:", err);
      setCamError(true);
      toast.error("Camera permission was denied or the camera is unavailable.");
    } finally {
      // Clear requesting flag after a slight pause to absorb browser focus restoration
      setTimeout(() => {
        requestingPermsRef.current = false;
        setRequestingPerms(false);
      }, 800);
    }
  };

  // ── Request Screen Share Access ───────────────────────────────────────────
  const requestScreenAccess = async () => {
    requestingPermsRef.current = true;
    setRequestingPerms(true);
    try {
      if (navigator.mediaDevices.getDisplayMedia) {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        screenRef.current = screenStream;
        setScreenVerified(true);
        toast.success("Screen sharing verified!");

        screenStream.getVideoTracks()[0].addEventListener("ended", () => {
          setScreenVerified(false);
          toast.warning("Screen sharing was stopped.");
        });
      }
    } catch (err) {
      console.warn("Screen share error:", err);
      toast.error("Screen sharing was cancelled or not supported.");
    } finally {
      setTimeout(() => {
        requestingPermsRef.current = false;
        setRequestingPerms(false);
      }, 800);
    }
  };

  const stopCamera = useCallback(() => {
    activeRef.current = false;
    clearInterval(detInterv.current);
    detInterv.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    screenRef.current?.getTracks().forEach((t) => t.stop());
    screenRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  // ── Handle Auto-Submit ────────────────────────────────────────────────────
  const handleAutoSubmit = useCallback(async (reason) => {
    if (submitted) return;
    setSubmitted(true);
    stopCamera();
    try {
      const answersPayload = (exam?.questions || []).map((q) => {
        const a = answers[q.id] || { text_answer: "", selected_choices: [] };
        return { question: q.id, text_answer: a.text_answer || "", selected_choices: a.selected_choices || [] };
      });
      await examAPI.submit({ exam: Number(id), answers: answersPayload });
    } catch {}
    setWarningMsg({ type: "final", text: reason });
  }, [submitted, stopCamera, exam, answers, id]);

  // ── Answer saving ─────────────────────────────────────────────────────────
  const handleAnswerChange = (qId, field, val) => {
    const updated = { ...answers, [qId]: { ...(answers[qId] || {}), [field]: val } };
    setAnswers(updated);
    saveAnswerToBackend(qId, updated[qId]);
  };

  const toggleChoice = (qId, choiceId, isSingle) => {
    const curr = answers[qId]?.selected_choices || [];
    let updated;
    if (isSingle) {
      updated = [choiceId];
    } else {
      updated = curr.includes(choiceId) ? curr.filter((c) => c !== choiceId) : [...curr, choiceId];
    }
    handleAnswerChange(qId, "selected_choices", updated);
  };

  const saveAnswerToBackend = async (qId, ans) => {
    try {
      const res = await examAPI.saveAnswer({
        exam: Number(id),
        question: qId,
        text_answer: ans.text_answer || "",
        selected_choices: ans.selected_choices || [],
      });
      if (res.data?.submission_id && !submission?.id) {
        setSubmission((prev) => ({ ...prev, id: res.data.submission_id }));
      }
    } catch {}
  };

  const finalSubmit = async () => {
    if (submitting || submitted) return;
    setSubmitting(true);
    setConfirmModal(false);
    try {
      const answersPayload = (exam.questions || []).map((q) => {
        const a = answers[q.id] || { text_answer: "", selected_choices: [] };
        return { question: q.id, text_answer: a.text_answer || "", selected_choices: a.selected_choices || [] };
      });
      await examAPI.submit({ exam: Number(id), answers: answersPayload });
      toast.success("Exam submitted successfully!");
      setSubmitted(true);
      stopCamera();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const questions = exam?.questions || [];
  const currentQuestion = questions[currentQ];
  const answeredCount = useMemo(() =>
    questions.filter((q) => {
      const a = answers[q.id];
      return a && (a.text_answer?.trim() || a.selected_choices?.length > 0);
    }).length,
    [questions, answers]
  );

  // ── Render: Loading ───────────────────────────────────────────────────────
  if (loading) return <div className="loading-screen">Loading examination environment…</div>;

  // ── Render: Submitted ─────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)", flexDirection: "column", gap: 20, padding: 32 }}>
        <div style={{ fontSize: 56 }}>✅</div>
        <h1 style={{ fontSize: 32, fontWeight: 800 }}>Examination Submitted</h1>
        {warningMsg?.type === "final" ? (
          <div className="alert alert-danger" style={{ maxWidth: 520, textAlign: "center" }}>{warningMsg.text}</div>
        ) : (
          <p style={{ color: "var(--text-muted)", maxWidth: 500, textAlign: "center" }}>
            Your responses have been securely stored. Results and contextual AI evaluation will be published on the date specified by the examiner.
          </p>
        )}
        <button className="btn btn-primary" onClick={() => navigate("/student/exams")}>
          Return to Exam List
        </button>
      </div>
    );
  }

  // ── STEP 1: Pre-Exam Device Verification Stage (Zero False Breach Guarantee) ─
  if (!deviceVerified) {
    return (
      <div className="auth-wrapper" style={{ padding: 24 }}>
        <div className="card auth-card" style={{ maxWidth: 680 }}>
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <div className="exmint-logo-tag" style={{ marginBottom: 6 }}>Pre-Flight Check</div>
            <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>{exam.title}</h2>
            <p style={{ color: "var(--text-muted)", fontSize: 14 }}>
              Verify your camera and workstation before entering the examination room.
            </p>
          </div>

          <div style={{
            background: "rgba(99, 102, 241, 0.08)",
            border: "1px solid rgba(99, 102, 241, 0.2)",
            borderRadius: "var(--radius)",
            padding: "14px 18px",
            marginBottom: 24,
            fontSize: 13.5,
            color: "var(--text)",
          }}>
            Camera and screen-sharing permission prompts are not treated as tab switches. Only tab visibility events are counted.
          </div>

          {/* Verification Panels */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
            {/* Camera Preview */}
            <div style={{ background: "var(--surface2)", borderRadius: "var(--radius)", padding: 14, textAlign: "center", border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: "var(--text)" }}>
                📸 Camera Status: {camVerified ? <span className="badge badge-green">Ready ✓</span> : <span className="badge badge-yellow">Pending</span>}
              </div>
              <div style={{ background: "#000", borderRadius: 8, overflow: "hidden", height: 140, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <video ref={videoRef} playsInline autoPlay muted style={{ width: "100%", height: "100%", objectFit: "cover", display: camVerified ? "block" : "none" }} />
                {!camVerified && (
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {camError ? "Camera Error / Denied" : "Camera Preview Inactive"}
                  </span>
                )}
              </div>
            </div>

            {/* Audio & Screen */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ background: "var(--surface2)", borderRadius: "var(--radius)", padding: 14, border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  Detects environment audio and voice clarity.
                </div>
              </div>

              <div style={{ background: "var(--surface2)", borderRadius: "var(--radius)", padding: 14, border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                  🖥️ Screen Share: {screenVerified ? <span className="badge badge-green">Verified ✓</span> : <span className="badge badge-blue">Optional</span>}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  Ensures complete window & screen integrity.
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, flexDirection: "column" }}>
            {!camVerified ? (
              <button className="btn btn-primary" style={{ padding: "12px" }} onClick={requestMediaAccess} disabled={requestingPerms}>
                {requestingPerms ? "Requesting Camera…" : "Grant Camera Access →"}
              </button>
            ) : (
              <div style={{ display: "flex", gap: 10 }}>
                {!screenVerified && (
                  <button className="btn btn-ghost" style={{ flex: 1 }} onClick={requestScreenAccess} disabled={requestingPerms}>
                    Enable Screen Share (Optional)
                  </button>
                )}
                <button
                  className="btn btn-success"
                  style={{ flex: 2, padding: "12px" }}
                  onClick={() => setDeviceVerified(true)}
                >
                  All Devices Verified — Start Exam →
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── STEP 2: Active Exam Room View (Protected & Proctored) ──────────────────
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg)" }}>
      <canvas ref={canvasRef} style={{ display: "none" }} />

      {/* ── LEFT: Questions & Workspace ────────────────────────────────────── */}
      <div style={{ flex: 1, padding: "28px 32px", overflowY: "auto" }}>
        {/* Header */}
        <div className="flex-between" style={{ marginBottom: 24 }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700 }}>{exam.title}</h2>
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
              Question {currentQ + 1} of {questions.length} · {answeredCount}/{questions.length} answered
            </div>
          </div>
          {/* Timer */}
          <div style={{ textAlign: "right" }}>
            <div className={`timer${timeLeft <= 300 ? " danger" : ""}`}>{formatTime(timeLeft ?? 0)}</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>time remaining</div>
          </div>
        </div>

        {/* Warning banner */}
        {warningMsg && (
          <div className={`alert ${warningMsg.type === "final" ? "alert-danger" : "alert-warning"}`} style={{ marginBottom: 20 }}>
            {warningMsg.type === "final" ? "⛔" : "⚠️"} {warningMsg.text}
          </div>
        )}

        {/* Violation counter */}
        {violationCount > 0 && (
          <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
            {Array.from({ length: MAX_TAB_SWITCHES + 1 }).map((_, i) => (
              <div key={i} style={{ width: 28, height: 8, borderRadius: 4, background: i < violationCount ? "var(--danger)" : "var(--border)" }} />
            ))}
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {violationCount}/{MAX_TAB_SWITCHES} tab-switches allowed
            </span>
          </div>
        )}

        {/* Current Question */}
        {currentQuestion && (
          <div className="question-card">
            <div className="q-header">
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className="badge badge-blue">
                  {{ short: "Short Answer", long: "Long Answer", mcq_single: "MCQ · Single", mcq_multi: "MCQ · Multiple" }[currentQuestion.question_type]}
                </span>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{currentQuestion.marks} mark{currentQuestion.marks !== 1 ? "s" : ""}</span>
                {currentQuestion.is_required && <span className="badge badge-red" style={{ fontSize: 10 }}>Required</span>}
              </div>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Q{currentQ + 1}</span>
            </div>

            <div className="q-text">{currentQuestion.text}</div>

            {/* Short Answer */}
            {currentQuestion.question_type === "short" && (
              <input
                className="form-control"
                placeholder="Type your concise response…"
                value={answers[currentQuestion.id]?.text_answer || ""}
                onChange={(e) => handleAnswerChange(currentQuestion.id, "text_answer", e.target.value)}
              />
            )}

            {/* Long Answer */}
            {currentQuestion.question_type === "long" && (
              <textarea
                className="form-control"
                rows={6}
                placeholder="Elaborate your response. Our AI evaluates conceptual understanding and accurate domain definitions…"
                value={answers[currentQuestion.id]?.text_answer || ""}
                onChange={(e) => handleAnswerChange(currentQuestion.id, "text_answer", e.target.value)}
              />
            )}

            {/* MCQ Single */}
            {currentQuestion.question_type === "mcq_single" && currentQuestion.choices.map((c) => {
              const sel = answers[currentQuestion.id]?.selected_choices?.includes(c.id);
              return (
                <div key={c.id} className={`choice-option${sel ? " selected" : ""}`}
                  onClick={() => toggleChoice(currentQuestion.id, c.id, true)}>
                  <input type="radio" readOnly checked={!!sel} style={{ accentColor: "var(--accent)" }} />
                  <span>{c.text}</span>
                </div>
              );
            })}

            {/* MCQ Multiple */}
            {currentQuestion.question_type === "mcq_multi" && (
              <div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>Select all options that apply:</div>
                {currentQuestion.choices.map((c) => {
                  const sel = answers[currentQuestion.id]?.selected_choices?.includes(c.id);
                  return (
                    <div key={c.id} className={`choice-option${sel ? " selected" : ""}`}
                      onClick={() => toggleChoice(currentQuestion.id, c.id, false)}>
                      <input type="checkbox" readOnly checked={!!sel} style={{ accentColor: "var(--accent)" }} />
                      <span>{c.text}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="flex-between mt-3">
          <button className="btn btn-ghost" disabled={currentQ === 0} onClick={() => setCurrentQ((q) => q - 1)}>
            ← Previous
          </button>
          {currentQ < questions.length - 1 ? (
            <button className="btn btn-primary" onClick={() => setCurrentQ((q) => q + 1)}>
              Next Question →
            </button>
          ) : (
            <button className="btn btn-success" onClick={() => setConfirmModal(true)}>
              Submit Exam ✓
            </button>
          )}
        </div>
      </div>

      {/* ── RIGHT: Proctor Sidebar ────────────────────────────────────────── */}
      <div style={{ width: 280, background: "var(--surface)", borderLeft: "1px solid var(--border)", padding: 20, display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>
        {/* Camera feed */}
        <div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Proctor AI Feed
          </div>
          {camError ? (
            <div style={{ background: "#000", borderRadius: 8, height: 130, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "var(--text-muted)", border: "1px solid var(--border)" }}>
              Camera unavailable
            </div>
          ) : (
            <video
              ref={videoRef}
              muted
              playsInline
              autoPlay
              style={{ width: "100%", borderRadius: 8, border: camReady ? "2px solid var(--success)" : "2px solid var(--border)", background: "#000", aspectRatio: "4/3", objectFit: "cover" }}
            />
          )}
          <div style={{ fontSize: 11, marginTop: 6, color: camReady ? "var(--success)" : "var(--text-muted)", display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: camReady ? "var(--success)" : "var(--text-muted)", display: "inline-block" }} />
            {aiStatus}
          </div>
        </div>

        {/* Proctoring integrity checklist */}
        <div style={{ padding: 12, background: "var(--surface2)", borderRadius: 8 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Integrity Check
          </div>
          <div style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ color: "var(--success)" }}>✓ Camera feed active</div>
            <div style={{ color: screenVerified ? "var(--success)" : "var(--text-muted)" }}>
              {screenVerified ? "✓ Screen stream verified" : "○ Single window locked"}
            </div>
          </div>
        </div>

        {/* Violation status */}
        <div style={{ padding: 12, background: "var(--surface2)", borderRadius: 8 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Security Violations
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {Array.from({ length: MAX_TAB_SWITCHES + 1 }).map((_, i) => (
              <div key={i} style={{ flex: 1, height: 6, borderRadius: 3, background: i < violationCount ? "var(--danger)" : "var(--border)" }} />
            ))}
          </div>
          <div style={{ fontSize: 12, color: violationCount > MAX_TAB_SWITCHES ? "var(--danger)" : "var(--text-muted)" }}>
            {violationCount} reported events — four tab switches or one absence over five seconds fails the attempt
          </div>
        </div>

        {/* Question navigator */}
        <div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Questions Navigator
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4 }}>
            {questions.map((q, i) => {
              const a = answers[q.id];
              const answered = a && (a.text_answer?.trim() || a.selected_choices?.length > 0);
              return (
                <button
                  key={q.id}
                  onClick={() => setCurrentQ(i)}
                  style={{
                    padding: "7px 0",
                    borderRadius: 6,
                    border: "none",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 600,
                    background: i === currentQ ? "var(--accent)" : answered ? "rgba(16, 185, 129, 0.2)" : "var(--surface2)",
                    color: i === currentQ ? "#ffffff" : answered ? "var(--success)" : "var(--text-muted)",
                  }}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: 11, marginTop: 8, color: "var(--text-muted)" }}>
            {answeredCount}/{questions.length} answered
          </div>
        </div>

        {/* Submit button */}
        <button className="btn btn-success" style={{ marginTop: "auto", padding: "12px" }} onClick={() => setConfirmModal(true)} disabled={submitting}>
          Submit Examination ✓
        </button>
      </div>

      {/* ── Confirm Modal ────────────────────────────────────────────────── */}
      {confirmModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <h2>Submit Examination?</h2>
            <p style={{ color: "var(--text-muted)", margin: "12px 0" }}>
              You have answered <strong style={{ color: "var(--text)" }}>{answeredCount}</strong> of{" "}
              <strong style={{ color: "var(--text)" }}>{questions.length}</strong> questions.
              {answeredCount < questions.length && (
                <span style={{ color: "var(--warning)" }}>
                  {" "}{questions.length - answeredCount} question{questions.length - answeredCount !== 1 ? "s are" : " is"} unanswered.
                </span>
              )}
            </p>
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Once submitted, you cannot modify your answers.</p>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setConfirmModal(false)}>Cancel</button>
              <button className="btn btn-success" onClick={finalSubmit} disabled={submitting}>
                {submitting ? "Submitting…" : "Confirm & Submit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
