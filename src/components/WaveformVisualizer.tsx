import { useEffect, useRef } from 'react';

/* ─────────────────────────────────────────────
   TYPES
───────────────────────────────────────────── */
interface WaveformVisualizerProps {
  isActive: boolean;
  mode: 'speaking' | 'listening' | 'idle';
  height?: number;
  barCount?: number;
}

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */
const COLOR_START = '#6366f1'; // indigo
const COLOR_END = '#8b5cf6';   // purple
const GLOW_COLOR = 'rgba(139, 92, 246, 0.55)';

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */
function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

function lerpColor(a: [number, number, number], b: [number, number, number], t: number): string {
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return `rgb(${r},${g},${bl})`;
}

/* Smooth step for interpolation */
function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/* ─────────────────────────────────────────────
   COMPONENT
───────────────────────────────────────────── */
export default function WaveformVisualizer({
  isActive,
  mode,
  height = 120,
  barCount = 48,
}: WaveformVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef<number | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const startRgb = hexToRgb(COLOR_START);
  const endRgb = hexToRgb(COLOR_END);

  /* Per-bar state for smooth interpolation */
  const barHeightsRef = useRef<Float32Array>(new Float32Array(barCount));
  const barTargetsRef = useRef<Float32Array>(new Float32Array(barCount));
  const timeRef = useRef<number>(0);
  const modeRef = useRef<'speaking' | 'listening' | 'idle'>(mode);
  const isActiveRef = useRef<boolean>(isActive);

  /* Sync refs so animation loop always sees latest props without re-creating */
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    /* ── Setup context ── */
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctxRef.current = ctx;

    /* ── DPR-aware resize ── */
    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };

    resize();

    const ro = new ResizeObserver(() => {
      resize();
    });
    ro.observe(canvas);

    /* ── Target generators ── */
    const generateTargets = (t: number) => {
      const m = modeRef.current;
      const active = isActiveRef.current;

      for (let i = 0; i < barCount; i++) {
        const norm = i / (barCount - 1); // 0..1

        if (!active || m === 'idle') {
          /* Gentle sine undulation — no randomness */
          const phase = norm * Math.PI * 2 + t * 0.9;
          const secondary = norm * Math.PI * 4.5 + t * 1.4;
          barTargetsRef.current[i] =
            0.08 + 0.13 * (0.6 * Math.sin(phase) + 0.4 * Math.sin(secondary)) * 0.5 + 0.06;
        } else if (m === 'listening') {
          /* Subtle responsive movement */
          const phase = norm * Math.PI * 3 + t * 2.2;
          const noise = (Math.random() - 0.5) * 0.12;
          barTargetsRef.current[i] = 0.1 + 0.22 * (0.5 + 0.5 * Math.sin(phase)) + noise;
        } else {
          /* speaking — energetic, bouncy bars */
          const phase = norm * Math.PI * 2.5 + t * 6.5;
          const noise = (Math.random() - 0.5) * 0.45;
          const base = 0.3 + 0.55 * Math.abs(Math.sin(phase + Math.random() * 0.8));
          barTargetsRef.current[i] = Math.max(0.06, Math.min(0.97, base + noise));
        }
      }
    };

    /* ── Target update cadence (ms) ── */
    let lastTargetUpdate = 0;
    const TARGET_INTERVAL_SPEAKING = 55;
    const TARGET_INTERVAL_LISTENING = 90;
    const TARGET_INTERVAL_IDLE = 40;

    /* ── Draw rounded rect helper ── */
    const roundedTopRect = (
      x: number,
      y: number,
      w: number,
      h: number,
      r: number,
    ) => {
      const rad = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + rad, y);
      ctx.lineTo(x + w - rad, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x, y + h);
      ctx.lineTo(x, y + rad);
      ctx.quadraticCurveTo(x, y, x + rad, y);
      ctx.closePath();
    };

    /* ── Main draw loop ── */
    const draw = (timestamp: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const cssW = canvas.getBoundingClientRect().width;
      const cssH = canvas.getBoundingClientRect().height;

      timeRef.current = timestamp / 1000;
      const t = timeRef.current;
      const m = modeRef.current;
      const active = isActiveRef.current;

      /* Update targets at a mode-specific cadence */
      const interval =
        m === 'speaking'
          ? TARGET_INTERVAL_SPEAKING
          : m === 'listening'
            ? TARGET_INTERVAL_LISTENING
            : TARGET_INTERVAL_IDLE;

      if (timestamp - lastTargetUpdate > interval) {
        generateTargets(t);
        lastTargetUpdate = timestamp;
      }

      /* Lerp current heights toward targets */
      const lerpSpeed =
        m === 'speaking' ? 0.18 : m === 'listening' ? 0.09 : 0.04;

      for (let i = 0; i < barCount; i++) {
        barHeightsRef.current[i] +=
          (barTargetsRef.current[i] - barHeightsRef.current[i]) * lerpSpeed;
      }

      /* Clear */
      ctx.clearRect(0, 0, cssW, cssH);

      const totalBarW = cssW;
      const gap = cssW * 0.012;
      const barW = Math.max(2, (totalBarW - gap * (barCount - 1)) / barCount);
      const centerY = cssH / 2;
      const maxHalfH = centerY * 0.88;

      /* Glow on active modes */
      if (active && m !== 'idle') {
        ctx.shadowBlur = m === 'speaking' ? 18 : 10;
        ctx.shadowColor = GLOW_COLOR;
      } else {
        ctx.shadowBlur = 6;
        ctx.shadowColor = 'rgba(99, 102, 241, 0.3)';
      }

      for (let i = 0; i < barCount; i++) {
        const norm = i / (barCount - 1);
        const x = i * (barW + gap);
        const h = barHeightsRef.current[i];
        const barH = Math.max(2, h * maxHalfH);
        const color = lerpColor(startRgb, endRgb, smoothstep(norm));

        /* ── Top bar (above center) ── */
        const yTop = centerY - barH;
        ctx.fillStyle = color;
        roundedTopRect(x, yTop, barW, barH, barW / 2);
        ctx.fill();

        /* ── Mirrored reflection below center ── */
        const reflectionH = barH * 0.35;
        const grad = ctx.createLinearGradient(x, centerY, x, centerY + reflectionH);
        grad.addColorStop(0, color.replace('rgb', 'rgba').replace(')', ',0.38)'));
        grad.addColorStop(1, color.replace('rgb', 'rgba').replace(')', ',0)'));
        ctx.fillStyle = grad;

        /* Reflection: bottom rect (no rounded bottom) */
        ctx.beginPath();
        ctx.rect(x, centerY, barW, reflectionH);
        ctx.fill();
      }

      /* Reset shadow */
      ctx.shadowBlur = 0;

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);

    return () => {
      ro.disconnect();
      if (animRef.current !== null) cancelAnimationFrame(animRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barCount]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: 'block',
        width: '100%',
        height: `${height}px`,
        background: 'transparent',
        borderRadius: '8px',
      }}
    />
  );
}
