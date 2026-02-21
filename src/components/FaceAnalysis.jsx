import { useEffect, useRef, useState, useCallback } from "react";

// ─── Constants ───────────────────────────────────────────────────────────────
const EYE_LANDMARKS = {
  leftIris: [468, 469, 470, 471, 472],
  rightIris: [473, 474, 475, 476, 477],
  leftEye: { top: 159, bottom: 145, left: 33, right: 133, center: 468 },
  rightEye: { top: 386, bottom: 374, left: 362, right: 263, center: 473 },
};
const NOSE_TIP = 1;
const CHIN = 152;
const LEFT_EAR = 234;
const RIGHT_EAR = 454;
const LEFT_MOUTH = 61;
const RIGHT_MOUTH = 291;
const WRIST_L = 15; // hand landmarks (if using holistic) – for now we use face only
const UPPER_LIP = 13;
const LOWER_LIP = 14;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function dist3(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + ((a.z || 0) - (b.z || 0)) ** 2);
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// Head pose estimation from 6 landmarks
function estimateHeadPose(lm) {
  const noseTip = lm[NOSE_TIP];
  const chin = lm[CHIN];
  const leftEar = lm[LEFT_EAR];
  const rightEar = lm[RIGHT_EAR];

  // Yaw: left/right turn — ratio of ear-nose distances
  const leftDist = dist3(noseTip, leftEar);
  const rightDist = dist3(noseTip, rightEar);
  const yaw = (rightDist - leftDist) / (rightDist + leftDist); // -1 to 1

  // Pitch: up/down nod — nose y relative to chin/ear midpoint
  const earMidY = (leftEar.y + rightEar.y) / 2;
  const pitch = (noseTip.y - earMidY) / Math.abs(chin.y - earMidY); // approx

  return { yaw, pitch };
}

// Eye openness for blink detection
function eyeOpenness(lm, eye) {
  const h = Math.abs(lm[eye.top].y - lm[eye.bottom].y);
  const w = Math.abs(lm[eye.right].x - lm[eye.left].x);
  return w > 0 ? h / w : 0;
}

// Gaze direction: iris center relative to eye bounding box
function gazeScore(lm) {
  const le = EYE_LANDMARKS.leftEye;
  const re = EYE_LANDMARKS.rightEye;
  const leftIrisX = lm[le.center]?.x ?? (lm[le.left].x + lm[le.right].x) / 2;
  const rightIrisX = lm[re.center]?.x ?? (lm[re.left].x + lm[re.right].x) / 2;

  const leftNorm = (leftIrisX - lm[le.left].x) / (lm[le.right].x - lm[le.left].x + 1e-6);
  const rightNorm = (rightIrisX - lm[re.left].x) / (lm[re.right].x - lm[re.left].x + 1e-6);

  // 0.5 = looking straight. deviation = looking away
  const deviation = Math.abs(leftNorm - 0.5) + Math.abs(rightNorm - 0.5);
  return deviation; // higher = more off-camera
}

// ─── Smoothed Metric Hook ─────────────────────────────────────────────────────
function useSmoothValue(initial, alpha = 0.1) {
  const ref = useRef(initial);
  const set = (v) => { ref.current = ref.current * (1 - alpha) + v * alpha; };
  return [ref, set];
}

// ─── Ring Buffer for history ──────────────────────────────────────────────────
class RingBuffer {
  constructor(size) { this.buf = []; this.size = size; }
  push(v) { this.buf.push(v); if (this.buf.length > this.size) this.buf.shift(); }
  avg() { return this.buf.length ? this.buf.reduce((a, b) => a + b, 0) / this.buf.length : 0; }
  last() { return this.buf[this.buf.length - 1] ?? 0; }
}

// ─── Circular Score Display ───────────────────────────────────────────────────
function CircleScore({ value, label, color, icon }) {
  const r = 30;
  const circ = 2 * Math.PI * r;
  const pct = clamp(value, 0, 100);
  const dash = (pct / 100) * circ;

  return (
    <div className="circle-metric">
      <svg width="76" height="76" viewBox="0 0 76 76">
        <circle cx="38" cy="38" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="6" />
        <circle
          cx="38" cy="38" r={r}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeDasharray={`${dash} ${circ}`}
          strokeDashoffset={circ * 0.25}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.3s ease", filter: `drop-shadow(0 0 6px ${color})` }}
        />
        <text x="38" y="43" textAnchor="middle" fill="white" fontSize="13" fontWeight="700" fontFamily="'DM Mono', monospace">
          {Math.round(pct)}
        </text>
      </svg>
      <span className="circle-icon">{icon}</span>
      <span className="circle-label">{label}</span>
    </div>
  );
}

// ─── Horizontal Bar ───────────────────────────────────────────────────────────
function Bar({ label, value, color, suffix = "" }) {
  return (
    <div className="bar-row">
      <span className="bar-label">{label}</span>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${clamp(value, 0, 100)}%`, background: color }} />
      </div>
      <span className="bar-value" style={{ color }}>{typeof value === "number" ? Math.round(value) : value}{suffix}</span>
    </div>
  );
}

// ─── Live Pulse Dot ───────────────────────────────────────────────────────────
function PulseDot({ active, color }) {
  return (
    <span className={`pulse-dot ${active ? "pulse-active" : ""}`} style={{ "--dot-color": color }} />
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function FaceAnalysis({ isRecording = false, onMetricsUpdate }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const faceMeshRef = useRef(null);
  const cameraRef = useRef(null);
  const frameCountRef = useRef(0);
  const sessionStartRef = useRef(null);

  // Live metrics state
  const [metrics, setMetrics] = useState({
    eyeContact: 100,
    headStability: 100,
    nervousGestures: 0,
    confidence: 100,
    eyeContactPct: 100,
    blinkRate: 0,
    yawDeg: 0,
    pitchDeg: 0,
    nodCount: 0,
    shakeCount: 0,
    status: "idle", // idle | loading | active | error
    alertMsg: "",
  });

  // Smoothed raw values
  const gazeSmooth = useRef(0);
  const yawSmooth = useRef(0);
  const pitchSmooth = useRef(0);

  // History buffers (30 frames ~1s at 30fps)
  const eyeHistory = useRef(new RingBuffer(90));      // 3s
  const blinkHistory = useRef(new RingBuffer(300));   // 10s for blink rate
  const yawHistory = useRef(new RingBuffer(60));
  const pitchHistory = useRef(new RingBuffer(60));

  // Blink detection
  const blinkCooldown = useRef(0);
  const blinkCount = useRef(0);

  // Head gesture counters
  const nodCooldown = useRef(0);
  const shakeCooldown = useRef(0);
  const nodCount = useRef(0);
  const shakeCount = useRef(0);
  const prevPitch = useRef(0);
  const prevYaw = useRef(0);

  // Session stats
  const sessionFrames = useRef(0);
  const eyeContactFrames = useRef(0);

  const processResults = useCallback((results) => {
    if (!results.multiFaceLandmarks?.length) return;
    const lm = results.multiFaceLandmarks[0];
    frameCountRef.current++;
    sessionFrames.current++;

    // ── Gaze / Eye Contact ──────────────────────────────
    const rawGaze = gazeScore(lm);
    gazeSmooth.current = gazeSmooth.current * 0.85 + rawGaze * 0.15;
    const gazeDeviation = gazeSmooth.current;
    // deviation < 0.15 = good eye contact
    const hasEyeContact = gazeDeviation < 0.18;
    eyeHistory.current.push(hasEyeContact ? 1 : 0);
    if (hasEyeContact) eyeContactFrames.current++;
    const eyeContactPct = (eyeContactFrames.current / sessionFrames.current) * 100;
    const recentEyePct = eyeHistory.current.avg() * 100;

    // ── Blink Detection ──────────────────────────────────
    const leftOpen = eyeOpenness(lm, EYE_LANDMARKS.leftEye);
    const rightOpen = eyeOpenness(lm, EYE_LANDMARKS.rightEye);
    const avgOpen = (leftOpen + rightOpen) / 2;
    blinkCooldown.current = Math.max(0, blinkCooldown.current - 1);
    if (avgOpen < 0.15 && blinkCooldown.current === 0) {
      blinkCount.current++;
      blinkCooldown.current = 8;
    }
    blinkHistory.current.push(avgOpen < 0.15 ? 1 : 0);
    // Blink rate: blinks per minute (estimate from last 300 frames ≈10s)
    const blinkRate = blinkHistory.current.buf.filter(Boolean).length * 6; // per minute approx

    // ── Head Pose ────────────────────────────────────────
    const { yaw, pitch } = estimateHeadPose(lm);
    yawSmooth.current = yawSmooth.current * 0.8 + yaw * 0.2;
    pitchSmooth.current = pitchSmooth.current * 0.8 + pitch * 0.2;
    yawHistory.current.push(Math.abs(yawSmooth.current));
    pitchHistory.current.push(Math.abs(pitchSmooth.current));

    const yawDeg = yawSmooth.current * 45; // approximate degrees
    const pitchDeg = pitchSmooth.current * 30;

    // Head stability: variance in movement
    const yawVariance = yawHistory.current.avg();
    const pitchVariance = pitchHistory.current.avg();
    const headStability = clamp(100 - (yawVariance + pitchVariance) * 300, 0, 100);

    // ── Nod Detection (pitch oscillation) ──────────────────
    const dp = pitchSmooth.current - prevPitch.current;
    nodCooldown.current = Math.max(0, nodCooldown.current - 1);
    if (Math.abs(dp) > 0.03 && nodCooldown.current === 0) {
      nodCount.current++;
      nodCooldown.current = 20;
    }
    prevPitch.current = pitchSmooth.current;

    // ── Shake Detection (yaw oscillation) ─────────────────
    const dy = yawSmooth.current - prevYaw.current;
    shakeCooldown.current = Math.max(0, shakeCooldown.current - 1);
    if (Math.abs(dy) > 0.03 && shakeCooldown.current === 0) {
      shakeCount.current++;
      shakeCooldown.current = 20;
    }
    prevYaw.current = yawSmooth.current;

    // ── Nervous Gesture Proxy ─────────────────────────────
    // Without hand tracking we use: high blink rate + significant yaw + mouth openness
    const mouthOpen = Math.abs(lm[UPPER_LIP].y - lm[LOWER_LIP].y);
    const nervousnessSignal = clamp(
      (blinkRate > 25 ? (blinkRate - 25) * 2 : 0) +
      (yawVariance > 0.05 ? yawVariance * 200 : 0) +
      (pitchVariance > 0.05 ? pitchVariance * 150 : 0),
      0, 100
    );

    // ── Confidence Score (composite) ─────────────────────
    const confidence = clamp(
      recentEyePct * 0.5 +
      headStability * 0.3 +
      (100 - nervousnessSignal) * 0.2,
      0, 100
    );

    // ── Alert Message ─────────────────────────────────────
    let alertMsg = "";
    if (recentEyePct < 40) alertMsg = "👀 Look at the camera";
    else if (Math.abs(yawDeg) > 15) alertMsg = "↩ Center your head";
    else if (blinkRate > 30) alertMsg = "😌 Slow down, you're nervous";

    const newMetrics = {
      eyeContact: recentEyePct,
      headStability,
      nervousGestures: nervousnessSignal,
      confidence,
      eyeContactPct,
      blinkRate,
      yawDeg,
      pitchDeg,
      nodCount: nodCount.current,
      shakeCount: shakeCount.current,
      status: "active",
      alertMsg,
    };

    setMetrics(newMetrics);
    onMetricsUpdate?.(newMetrics);
  }, [onMetricsUpdate]);

  // ── MediaPipe Setup ────────────────────────────────────────────────────────
  useEffect(() => {
    let active = true;

    async function init() {
      setMetrics(m => ({ ...m, status: "loading" }));

      try {
        // Load MediaPipe scripts dynamically
        await loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js");
        await loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js");

        if (!active) return;

        const FaceMesh = window.FaceMesh;
        const Camera = window.Camera;

        const faceMesh = new FaceMesh({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
        });

        faceMesh.setOptions({
          maxNumFaces: 1,
          refineLandmarks: true,   // enables iris landmarks 468-477
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        faceMesh.onResults(processResults);
        faceMeshRef.current = faceMesh;

        const camera = new Camera(videoRef.current, {
          onFrame: async () => {
            if (faceMeshRef.current && videoRef.current) {
              await faceMeshRef.current.send({ image: videoRef.current });
            }
          },
          width: 640,
          height: 480,
        });

        await camera.start();
        cameraRef.current = camera;
        sessionStartRef.current = Date.now();

        if (active) setMetrics(m => ({ ...m, status: "active" }));
      } catch (err) {
        console.error("FaceMesh init error:", err);
        if (active) setMetrics(m => ({ ...m, status: "error", alertMsg: "Camera or model failed to load" }));
      }
    }

    init();

    return () => {
      active = false;
      cameraRef.current?.stop?.();
      faceMeshRef.current?.close?.();
    };
  }, [processResults]);

  const { eyeContact, headStability, nervousGestures, confidence, blinkRate, yawDeg, pitchDeg, nodCount: nod, shakeCount: shake, status, alertMsg, eyeContactPct } = metrics;

  const confColor = confidence > 70 ? "#4ade80" : confidence > 40 ? "#facc15" : "#f87171";
  const eyeColor = eyeContact > 65 ? "#34d399" : eyeContact > 35 ? "#fbbf24" : "#f87171";
  const headColor = headStability > 70 ? "#60a5fa" : headStability > 40 ? "#fbbf24" : "#f87171";
  const nervColor = nervousGestures < 25 ? "#34d399" : nervousGestures < 55 ? "#fbbf24" : "#f87171";

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@600;700;800&display=swap');

        .face-root {
          font-family: 'Syne', sans-serif;
          background: #0b0f1a;
          color: white;
          border-radius: 16px;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,0.08);
          box-shadow: 0 24px 64px rgba(0,0,0,0.5);
          width: 100%;
          max-width: 780px;
        }

        .face-header {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 14px 20px;
          background: rgba(255,255,255,0.03);
          border-bottom: 1px solid rgba(255,255,255,0.06);
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.6);
        }

        .face-body {
          display: grid;
          grid-template-columns: 260px 1fr;
          gap: 0;
        }

        .video-col {
          position: relative;
          background: #060912;
          border-right: 1px solid rgba(255,255,255,0.05);
        }

        video {
          width: 100%;
          display: block;
          transform: scaleX(-1);
          opacity: ${status === "active" ? 1 : 0.4};
          transition: opacity 0.5s;
        }

        .video-overlay {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }

        .corner {
          position: absolute;
          width: 16px; height: 16px;
          border-color: rgba(99,252,177,0.6);
          border-style: solid;
          border-width: 0;
        }
        .corner.tl { top: 10px; left: 10px; border-top-width: 2px; border-left-width: 2px; }
        .corner.tr { top: 10px; right: 10px; border-top-width: 2px; border-right-width: 2px; }
        .corner.bl { bottom: 10px; left: 10px; border-bottom-width: 2px; border-left-width: 2px; }
        .corner.br { bottom: 10px; right: 10px; border-bottom-width: 2px; border-right-width: 2px; }

        .status-badge {
          position: absolute;
          bottom: 10px;
          left: 50%;
          transform: translateX(-50%);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          padding: 3px 10px;
          border-radius: 20px;
          white-space: nowrap;
        }
        .status-active { background: rgba(52,211,153,0.15); color: #34d399; border: 1px solid rgba(52,211,153,0.3); }
        .status-loading { background: rgba(251,191,36,0.15); color: #fbbf24; border: 1px solid rgba(251,191,36,0.3); }
        .status-error { background: rgba(248,113,113,0.15); color: #f87171; border: 1px solid rgba(248,113,113,0.3); }
        .status-idle { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.4); border: 1px solid rgba(255,255,255,0.1); }

        .metrics-col {
          padding: 18px 20px;
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        .circles-row {
          display: flex;
          justify-content: space-around;
          gap: 4px;
        }

        .circle-metric {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 3px;
          position: relative;
        }
        .circle-icon {
          font-size: 12px;
          position: absolute;
          top: -2px;
          right: -2px;
        }
        .circle-label {
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.4);
          text-align: center;
        }

        .divider {
          height: 1px;
          background: rgba(255,255,255,0.06);
        }

        .section-title {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.3);
          margin-bottom: 8px;
        }

        .bar-row {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 7px;
        }
        .bar-label {
          font-family: 'DM Mono', monospace;
          font-size: 10px;
          color: rgba(255,255,255,0.45);
          width: 72px;
          flex-shrink: 0;
        }
        .bar-track {
          flex: 1;
          height: 4px;
          background: rgba(255,255,255,0.07);
          border-radius: 4px;
          overflow: hidden;
        }
        .bar-fill {
          height: 100%;
          border-radius: 4px;
          transition: width 0.3s ease;
        }
        .bar-value {
          font-family: 'DM Mono', monospace;
          font-size: 10px;
          font-weight: 500;
          width: 32px;
          text-align: right;
          flex-shrink: 0;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }
        .stat-cell {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 8px;
          padding: 8px 10px;
        }
        .stat-cell .val {
          font-family: 'DM Mono', monospace;
          font-size: 18px;
          font-weight: 500;
          line-height: 1;
        }
        .stat-cell .lbl {
          font-size: 9px;
          color: rgba(255,255,255,0.35);
          letter-spacing: 0.1em;
          text-transform: uppercase;
          margin-top: 3px;
        }

        .alert-bar {
          min-height: 30px;
          background: rgba(251,191,36,0.08);
          border: 1px solid rgba(251,191,36,0.2);
          border-radius: 8px;
          padding: 6px 12px;
          font-size: 12px;
          color: #fbbf24;
          font-weight: 600;
          display: flex;
          align-items: center;
          transition: opacity 0.3s;
          opacity: ${alertMsg ? 1 : 0};
        }

        /* Pulse dot */
        .pulse-dot {
          display: inline-block;
          width: 6px; height: 6px;
          border-radius: 50%;
          background: rgba(255,255,255,0.2);
          flex-shrink: 0;
        }
        .pulse-active {
          background: var(--dot-color, #34d399);
          animation: pulse-ring 1.4s ease infinite;
          box-shadow: 0 0 0 0 var(--dot-color, #34d399);
        }
        @keyframes pulse-ring {
          0% { box-shadow: 0 0 0 0 var(--dot-color); }
          70% { box-shadow: 0 0 0 5px rgba(0,0,0,0); }
          100% { box-shadow: 0 0 0 0 rgba(0,0,0,0); }
        }

        .head-pose {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 24px;
          font-family: 'DM Mono', monospace;
          font-size: 11px;
        }
        .pose-val {
          text-align: center;
        }
        .pose-val .num {
          font-size: 20px;
          font-weight: 500;
          line-height: 1;
        }
        .pose-val .axis {
          font-size: 9px;
          color: rgba(255,255,255,0.3);
          letter-spacing: 0.1em;
          text-transform: uppercase;
          margin-top: 2px;
        }

        @media (max-width: 600px) {
          .face-body { grid-template-columns: 1fr; }
          .video-col { border-right: none; border-bottom: 1px solid rgba(255,255,255,0.05); }
        }
      `}</style>

      <div className="face-root">
        <div className="face-header">
          <PulseDot active={status === "active"} color="#34d399" />
          Face Analysis
          <span style={{ marginLeft: "auto", fontWeight: 400, color: "rgba(255,255,255,0.3)" }}>
            MediaPipe Face Mesh
          </span>
        </div>

        <div className="face-body">
          {/* ── Video Feed ── */}
          <div className="video-col">
            <video ref={videoRef} playsInline muted autoPlay />
            <canvas ref={canvasRef} style={{ display: "none" }} />
            <div className="video-overlay">
              <div className="corner tl" /><div className="corner tr" />
              <div className="corner bl" /><div className="corner br" />
            </div>
            <div className={`status-badge status-${status}`}>
              {status === "active" ? "● Tracking" : status === "loading" ? "Loading model…" : status === "error" ? "Error" : "Standby"}
            </div>
          </div>

          {/* ── Metrics Panel ── */}
          <div className="metrics-col">
            {/* Circle scores */}
            <div className="circles-row">
              <CircleScore value={eyeContact} label="Eye Contact" color={eyeColor} icon="👁" />
              <CircleScore value={headStability} label="Head Stable" color={headColor} icon="🧭" />
              <CircleScore value={100 - nervousGestures} label="Composure" color={nervColor} icon="🫀" />
              <CircleScore value={confidence} label="Confidence" color={confColor} icon="⚡" />
            </div>

            <div className="divider" />

            {/* Bars */}
            <div>
              <div className="section-title">Detail Breakdown</div>
              <Bar label="Eye Contact" value={eyeContact} color={eyeColor} suffix="%" />
              <Bar label="Head Stable" value={headStability} color={headColor} suffix="%" />
              <Bar label="Composure" value={100 - nervousGestures} color={nervColor} suffix="%" />
            </div>

            <div className="divider" />

            {/* Head pose + blink */}
            <div>
              <div className="section-title">Head Movement</div>
              <div className="head-pose">
                <div className="pose-val">
                  <div className="num" style={{ color: Math.abs(yawDeg) > 15 ? "#f87171" : "#60a5fa" }}>
                    {yawDeg > 0 ? "+" : ""}{Math.round(yawDeg)}°
                  </div>
                  <div className="axis">Yaw (L/R)</div>
                </div>
                <div className="pose-val">
                  <div className="num" style={{ color: Math.abs(pitchDeg) > 12 ? "#f87171" : "#a78bfa" }}>
                    {pitchDeg > 0 ? "+" : ""}{Math.round(pitchDeg)}°
                  </div>
                  <div className="axis">Pitch (U/D)</div>
                </div>
              </div>

              <div style={{ marginTop: 10 }}>
                <div className="stats-grid">
                  <div className="stat-cell">
                    <div className="val" style={{ color: "#fbbf24" }}>{nod}</div>
                    <div className="lbl">Nods detected</div>
                  </div>
                  <div className="stat-cell">
                    <div className="val" style={{ color: "#f87171" }}>{shake}</div>
                    <div className="lbl">Head shakes</div>
                  </div>
                  <div className="stat-cell">
                    <div className="val" style={{ color: blinkRate > 28 ? "#f87171" : "#34d399" }}>
                      {Math.round(blinkRate)}
                    </div>
                    <div className="lbl">Blinks/min</div>
                  </div>
                  <div className="stat-cell">
                    <div className="val" style={{ color: "#60a5fa" }}>
                      {Math.round(eyeContactPct)}%
                    </div>
                    <div className="lbl">Session eye %</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Alert */}
            <div className="alert-bar">{alertMsg || " "}</div>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Script loader util ─────────────────────────────────────────────────────────
function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}
