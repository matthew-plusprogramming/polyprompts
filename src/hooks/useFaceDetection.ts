import { useCallback, useRef, useState } from 'react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { createLogger } from '../utils/logger';
import type { FaceMetrics } from '../types/faceDetection';

const log = createLogger('FaceDetection');

const VISION_WASM_URL =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

// ─── Landmark type ───────────────────────────────────────────────────────────
type Landmark = { x: number; y: number; z: number };

// ─── Landmark indices ────────────────────────────────────────────────────────
const EYE_LANDMARKS = {
  leftEye: { top: 159, bottom: 145, left: 33, right: 133, center: 468 },
  rightEye: { top: 386, bottom: 374, left: 362, right: 263, center: 473 },
};
const NOSE_TIP = 1;
const CHIN = 152;
const LEFT_EAR = 234;
const RIGHT_EAR = 454;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function dist3(a: Landmark, b: Landmark): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function estimateHeadPose(lm: Landmark[]) {
  const noseTip = lm[NOSE_TIP];
  const chin = lm[CHIN];
  const leftEar = lm[LEFT_EAR];
  const rightEar = lm[RIGHT_EAR];

  const leftDist = dist3(noseTip, leftEar);
  const rightDist = dist3(noseTip, rightEar);
  const yaw = (rightDist - leftDist) / (rightDist + leftDist);

  const earMidY = (leftEar.y + rightEar.y) / 2;
  const pitch = (noseTip.y - earMidY) / Math.abs(chin.y - earMidY);

  return { yaw, pitch };
}

function eyeOpenness(lm: Landmark[], eye: { top: number; bottom: number; left: number; right: number }): number {
  const h = Math.abs(lm[eye.top].y - lm[eye.bottom].y);
  const w = Math.abs(lm[eye.right].x - lm[eye.left].x);
  return w > 0 ? h / w : 0;
}

function gazeScore(lm: Landmark[]): number {
  const le = EYE_LANDMARKS.leftEye;
  const re = EYE_LANDMARKS.rightEye;
  const leftIrisX = lm[le.center]?.x ?? (lm[le.left].x + lm[le.right].x) / 2;
  const rightIrisX = lm[re.center]?.x ?? (lm[re.left].x + lm[re.right].x) / 2;

  const leftNorm = (leftIrisX - lm[le.left].x) / (lm[le.right].x - lm[le.left].x + 1e-6);
  const rightNorm = (rightIrisX - lm[re.left].x) / (lm[re.right].x - lm[re.left].x + 1e-6);

  return Math.abs(leftNorm - 0.5) + Math.abs(rightNorm - 0.5);
}

// ─── Ring buffer ─────────────────────────────────────────────────────────────
class RingBuffer {
  buf: number[] = [];
  size: number;
  constructor(size: number) {
    this.size = size;
  }
  push(v: number) {
    this.buf.push(v);
    if (this.buf.length > this.size) this.buf.shift();
  }
  avg(): number {
    return this.buf.length ? this.buf.reduce((a, b) => a + b, 0) / this.buf.length : 0;
  }
  clear() {
    this.buf = [];
  }
}

// ─── Hook types ──────────────────────────────────────────────────────────────
type FaceDetectionStatus = 'idle' | 'loading' | 'active' | 'error';

interface UseFaceDetectionOptions {
  videoElement: React.RefObject<HTMLVideoElement | null>;
  enabled: boolean;
}

export function useFaceDetection({ videoElement, enabled }: UseFaceDetectionOptions) {
  const [status, setStatus] = useState<FaceDetectionStatus>('idle');
  const [isActive, setIsActive] = useState(false);

  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const activeRef = useRef(false);
  const lastVideoTimeRef = useRef(-1);

  // ── EMA-smoothed values ──
  const gazeSmooth = useRef(0);
  const yawSmooth = useRef(0);
  const pitchSmooth = useRef(0);

  // ── Ring buffers (history windows) ──
  const eyeHistory = useRef(new RingBuffer(90));    // ~3s at 30fps
  const blinkHistory = useRef(new RingBuffer(300)); // ~10s
  const yawHistory = useRef(new RingBuffer(60));
  const pitchHistory = useRef(new RingBuffer(60));

  // ── Blink detection ──
  const blinkCooldown = useRef(0);

  // ── Session-level accumulators ──
  const sessionFrames = useRef(0);
  const eyeContactFrames = useRef(0);
  const headStabilitySum = useRef(0);
  const nervousnessSum = useRef(0);
  const confidenceSum = useRef(0);

  const resetAccumulators = useCallback(() => {
    sessionFrames.current = 0;
    eyeContactFrames.current = 0;
    headStabilitySum.current = 0;
    nervousnessSum.current = 0;
    confidenceSum.current = 0;
    gazeSmooth.current = 0;
    yawSmooth.current = 0;
    pitchSmooth.current = 0;
    eyeHistory.current.clear();
    blinkHistory.current.clear();
    yawHistory.current.clear();
    pitchHistory.current.clear();
    blinkCooldown.current = 0;
  }, []);

  const noFaceFrames = useRef(0);

  const processLandmarks = useCallback((lm: Landmark[]) => {
    sessionFrames.current++;

    // Gaze / eye contact
    const rawGaze = gazeScore(lm);
    gazeSmooth.current = gazeSmooth.current * 0.85 + rawGaze * 0.15;
    const hasEyeContact = gazeSmooth.current < 0.18;
    eyeHistory.current.push(hasEyeContact ? 1 : 0);
    if (hasEyeContact) eyeContactFrames.current++;

    // Blink detection
    const leftOpen = eyeOpenness(lm, EYE_LANDMARKS.leftEye);
    const rightOpen = eyeOpenness(lm, EYE_LANDMARKS.rightEye);
    const avgOpen = (leftOpen + rightOpen) / 2;
    blinkCooldown.current = Math.max(0, blinkCooldown.current - 1);
    if (avgOpen < 0.15 && blinkCooldown.current === 0) {
      blinkCooldown.current = 8;
    }
    blinkHistory.current.push(avgOpen < 0.15 ? 1 : 0);
    const blinkRate = blinkHistory.current.avg() > 0
      ? blinkHistory.current.avg() * 30 * 60 // convert fraction to per-minute estimate
      : 0;

    // Head pose
    const { yaw, pitch } = estimateHeadPose(lm);
    yawSmooth.current = yawSmooth.current * 0.8 + yaw * 0.2;
    pitchSmooth.current = pitchSmooth.current * 0.8 + pitch * 0.2;
    yawHistory.current.push(Math.abs(yawSmooth.current));
    pitchHistory.current.push(Math.abs(pitchSmooth.current));

    const yawVariance = yawHistory.current.avg();
    const pitchVariance = pitchHistory.current.avg();
    const headStability = clamp(100 - (yawVariance + pitchVariance) * 300, 0, 100);

    // Nervousness proxy
    const nervousnessSignal = clamp(
      (blinkRate > 25 ? (blinkRate - 25) * 2 : 0) +
        (yawVariance > 0.05 ? yawVariance * 200 : 0) +
        (pitchVariance > 0.05 ? pitchVariance * 150 : 0),
      0,
      100,
    );

    // Confidence composite
    const recentEyePct = eyeHistory.current.avg() * 100;
    const confidence = clamp(
      recentEyePct * 0.5 + headStability * 0.3 + (100 - nervousnessSignal) * 0.2,
      0,
      100,
    );

    // Accumulate session averages
    headStabilitySum.current += headStability;
    nervousnessSum.current += nervousnessSignal;
    confidenceSum.current += confidence;

    // Periodic logging (~every 3s at 30fps)
    if (sessionFrames.current === 1 || sessionFrames.current % 90 === 0) {
      log.info('Metrics snapshot', {
        frames: sessionFrames.current,
        eyeContact: Math.round((eyeContactFrames.current / sessionFrames.current) * 100),
        headStability: Math.round(headStabilitySum.current / sessionFrames.current),
        confidence: Math.round(confidenceSum.current / sessionFrames.current),
        rawGaze: +gazeSmooth.current.toFixed(3),
      });
    }
  }, []);

  const sendFrameCount = useRef(0);
  const sendErrorCount = useRef(0);
  const skipCount = useRef(0);

  const runLoop = useCallback(() => {
    if (!activeRef.current) return;
    const video = videoElement.current;
    const landmarker = faceLandmarkerRef.current;
    if (video && landmarker && video.readyState >= 2) {
      // Only process new video frames (rAF may fire faster than video framerate)
      if (video.currentTime !== lastVideoTimeRef.current) {
        lastVideoTimeRef.current = video.currentTime;
        sendFrameCount.current++;
        try {
          const result = landmarker.detectForVideo(video, performance.now());
          if (result.faceLandmarks?.length) {
            if (noFaceFrames.current > 0) {
              log.info('Face re-detected', { missedFrames: noFaceFrames.current });
              noFaceFrames.current = 0;
            }
            processLandmarks(result.faceLandmarks[0] as Landmark[]);
          } else {
            noFaceFrames.current++;
            if (noFaceFrames.current === 1 || noFaceFrames.current % 90 === 0) {
              log.warn('No face detected', { consecutiveFrames: noFaceFrames.current });
            }
          }
        } catch (err) {
          sendErrorCount.current++;
          if (sendErrorCount.current === 1 || sendErrorCount.current % 30 === 0) {
            log.warn('FaceLandmarker detect failed', { errorCount: sendErrorCount.current, error: String(err) });
          }
        }
        if (sendFrameCount.current === 1 || sendFrameCount.current % 150 === 0) {
          log.info('rAF loop status', {
            framesSent: sendFrameCount.current,
            sendErrors: sendErrorCount.current,
            skipped: skipCount.current,
            processedFrames: sessionFrames.current,
          });
        }
      }
    } else {
      skipCount.current++;
      if (skipCount.current === 1 || skipCount.current % 60 === 0) {
        log.warn('rAF skipping frame', {
          hasVideo: !!video,
          hasLandmarker: !!landmarker,
          videoReady: video?.readyState,
          skipped: skipCount.current,
        });
      }
    }
    rafIdRef.current = requestAnimationFrame(runLoop);
  }, [videoElement, processLandmarks]);

  const start = useCallback(async () => {
    if (!enabled) return;
    if (activeRef.current) return;

    setStatus('loading');
    log.info('Loading MediaPipe FaceLandmarker (tasks-vision)...');

    try {
      const vision = await FilesetResolver.forVisionTasks(VISION_WASM_URL);
      const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MODEL_URL,
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false,
      });

      faceLandmarkerRef.current = faceLandmarker;

      activeRef.current = true;
      setIsActive(true);
      setStatus('active');

      resetAccumulators();
      sendFrameCount.current = 0;
      sendErrorCount.current = 0;
      skipCount.current = 0;
      noFaceFrames.current = 0;
      lastVideoTimeRef.current = -1;
      log.info('FaceLandmarker active, starting rAF loop', {
        videoReady: videoElement.current?.readyState,
        videoWidth: videoElement.current?.videoWidth,
        videoHeight: videoElement.current?.videoHeight,
      });
      runLoop();
    } catch (err) {
      log.warn('Face detection failed to start — interview continues without it', { error: String(err) });
      setStatus('error');
    }
  }, [enabled, resetAccumulators, runLoop, videoElement]);

  const stop = useCallback(() => {
    log.info('Face detection stopping', {
      wasActive: activeRef.current,
      sessionFrames: sessionFrames.current,
      framesSent: sendFrameCount.current,
      sendErrors: sendErrorCount.current,
      skippedFrames: skipCount.current,
    });
    activeRef.current = false;
    setIsActive(false);
    if (rafIdRef.current != null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (faceLandmarkerRef.current) {
      faceLandmarkerRef.current.close();
      faceLandmarkerRef.current = null;
    }
    setStatus('idle');
  }, []);

  const reset = useCallback(() => {
    resetAccumulators();
    log.info('Face detection session reset');
  }, [resetAccumulators]);

  const getSessionAverages = useCallback((): FaceMetrics => {
    const frames = sessionFrames.current;
    if (frames === 0) {
      log.warn('getSessionAverages called with 0 frames', {
        framesSent: sendFrameCount.current,
        sendErrors: sendErrorCount.current,
        skippedFrames: skipCount.current,
      });
      return { eyeContactPercent: 0, headStability: 0, nervousnessScore: 0, confidenceScore: 0 };
    }
    const result = {
      eyeContactPercent: Math.round((eyeContactFrames.current / frames) * 100),
      headStability: Math.round(headStabilitySum.current / frames),
      nervousnessScore: Math.round(nervousnessSum.current / frames),
      confidenceScore: Math.round(confidenceSum.current / frames),
    };
    log.info('getSessionAverages', { frames, ...result });
    return result;
  }, []);

  return { start, stop, reset, isActive, status, getSessionAverages };
}
