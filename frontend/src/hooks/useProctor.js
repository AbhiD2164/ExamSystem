// src/hooks/useProctor.js
/**
 * useProctor — Detects violations during an active exam:
 *   1. Tab/window switch (visibilitychange + blur)
 *   2. Head movement (face landmark y-axis delta threshold via face-api / canvas)
 *   3. Eye movement (iris landmarks left-right rapid shift)
 *
 * Violations are reported to the backend. The hook returns:
 *   { violationCount, lastWarning, cameraRef, canvasRef, startProctoring, stopProctoring }
 *
 * NOTE: For head/eye detection we use a lightweight heuristic on top of the
 * browser's MediaDevices API + canvas drawing — no heavy ML library needed at runtime.
 * We use @mediapipe/face_mesh loaded from CDN to stay bundle-light.
 */
import { useRef, useState, useCallback, useEffect } from "react";
import { proctoringAPI } from "../api/client";

const HEAD_MOVEMENT_THRESHOLD = 20;   // pixels
const EYE_MOVEMENT_THRESHOLD  = 12;   // pixels
const REPEATED_MOVEMENT_FRAMES = 8;    // consecutive frames needed to fire

export function useProctor({ submissionId, onAutoSubmit, onWarning, enabled = true }) {
  const [violationCount, setViolationCount] = useState(0);
  const [lastWarning, setLastWarning] = useState(null);

  const videoRef    = useRef(null);
  const canvasRef   = useRef(null);
  const streamRef   = useRef(null);
  const faceMeshRef = useRef(null);
  const rafRef      = useRef(null);
  const activeRef   = useRef(false);

  // Track consecutive movement frames
  const movementFrames = useRef({ head: 0, eye: 0 });
  const prevLandmarks  = useRef(null);

  // ── Report violation to backend ───────────────────────────────────────────
  const reportViolation = useCallback(async (violation_type, details = "") => {
    if (!submissionId) return;
    try {
      const { data } = await proctoringAPI.report({ submission_id: submissionId, violation_type, details });
      const newCount = data.warning_number;
      setViolationCount(newCount);

      if (data.action === "auto_submitted") {
        setLastWarning({ type: "final", message: data.message });
        onAutoSubmit?.(data.message);
        stopProctoring();
      } else {
        setLastWarning({ type: "warning", message: data.message, number: newCount });
        onWarning?.(data);
      }
    } catch (err) {
      console.error("Proctor report error:", err);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissionId]);

  // ── Tab/window visibility with Permission & Dialog Safe Guards ────────────
  useEffect(() => {
    if (!enabled || !submissionId) return;

    let blurTimer = null;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        reportViolation("tab_switch", "User switched tab or minimized window.");
      }
    };

    const handleBlur = () => {
      // Inhibit instant blur breach: permission prompts (camera, mic, screen share)
      // cause brief blur events while user clicks 'Allow'. Wait 2.5s and verify.
      if (blurTimer) clearTimeout(blurTimer);
      blurTimer = setTimeout(() => {
        if (!document.hasFocus() && document.visibilityState === "hidden") {
          reportViolation("window_blur", "Browser window lost focus for extended duration.");
        }
      }, 2500);
    };

    const handleFocus = () => {
      if (blurTimer) {
        clearTimeout(blurTimer);
        blurTimer = null;
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);
    return () => {
      if (blurTimer) clearTimeout(blurTimer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
    };
  }, [enabled, submissionId, reportViolation]);

  // ── Load FaceMesh from CDN ────────────────────────────────────────────────
  const loadFaceMesh = useCallback(async () => {
    // Dynamically load mediapipe face_mesh from CDN to avoid huge bundle
    if (window.FaceMesh) return window.FaceMesh;
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js";
      s.crossOrigin = "anonymous";
      s.onload = () => resolve(window.FaceMesh);
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }, []);

  // ── Process each camera frame ─────────────────────────────────────────────
  const processFrame = useCallback((faceMesh) => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !activeRef.current) return;

    const ctx = canvas.getContext("2d");
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    faceMesh.send({ image: video }).catch(() => {});
    rafRef.current = requestAnimationFrame(() => processFrame(faceMesh));
  }, []);

  // ── Landmark analysis ─────────────────────────────────────────────────────
  const analyzeLandmarks = useCallback((results) => {
    if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) return;

    const landmarks = results.multiFaceLandmarks[0];
    const video = videoRef.current;
    if (!video) return;

    const W = video.videoWidth;
    const H = video.videoHeight;

    // Nose tip = landmark 1
    const nose = landmarks[1];
    const nosePx = { x: nose.x * W, y: nose.y * H };

    // Iris centres: left ~468, right ~473
    const leftIris  = landmarks[468] ?? landmarks[33];
    const rightIris = landmarks[473] ?? landmarks[263];
    const eyeMidX = ((leftIris.x + rightIris.x) / 2) * W;
    const eyeMidY = ((leftIris.y + rightIris.y) / 2) * H;

    if (prevLandmarks.current) {
      const { nose: pNose, eyeMid: pEye } = prevLandmarks.current;

      const headDelta = Math.hypot(nosePx.x - pNose.x, nosePx.y - pNose.y);
      const eyeDelta  = Math.hypot(eyeMidX - pEye.x, eyeMidY - pEye.y);

      if (headDelta > HEAD_MOVEMENT_THRESHOLD) {
        movementFrames.current.head += 1;
      } else {
        movementFrames.current.head = Math.max(0, movementFrames.current.head - 1);
      }

      if (eyeDelta > EYE_MOVEMENT_THRESHOLD) {
        movementFrames.current.eye += 1;
      } else {
        movementFrames.current.eye = Math.max(0, movementFrames.current.eye - 1);
      }

      if (movementFrames.current.head >= REPEATED_MOVEMENT_FRAMES) {
        movementFrames.current.head = 0;
        reportViolation("head_movement", `Head movement delta: ${headDelta.toFixed(1)}px`);
      }
      if (movementFrames.current.eye >= REPEATED_MOVEMENT_FRAMES) {
        movementFrames.current.eye = 0;
        reportViolation("eye_movement", `Eye movement delta: ${eyeDelta.toFixed(1)}px`);
      }
    }

    prevLandmarks.current = { nose: nosePx, eyeMid: { x: eyeMidX, y: eyeMidY } };
  }, [reportViolation]);

  // ── Start proctoring ──────────────────────────────────────────────────────
  const startProctoring = useCallback(async () => {
    if (!enabled) return;
    activeRef.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const FaceMesh = await loadFaceMesh();
      if (!FaceMesh) return;

      const faceMesh = new FaceMesh({
        locateFile: (file) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
      });
      faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.5 });
      faceMesh.onResults(analyzeLandmarks);
      faceMeshRef.current = faceMesh;

      processFrame(faceMesh);
    } catch (err) {
      console.warn("Camera access denied or FaceMesh failed:", err);
    }
  }, [enabled, loadFaceMesh, analyzeLandmarks, processFrame]);

  // ── Stop proctoring ───────────────────────────────────────────────────────
  const stopProctoring = useCallback(() => {
    activeRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  // Cleanup on unmount
  useEffect(() => () => stopProctoring(), [stopProctoring]);

  return { violationCount, lastWarning, videoRef, canvasRef, startProctoring, stopProctoring };
}
