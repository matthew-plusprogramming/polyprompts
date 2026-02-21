import { useEffect, useRef, useState } from 'react';
import starlyIcon from '../icons/STARLY.png';

type WaveformStatus = 'loading' | 'ready' | 'unsupported' | 'error';

interface PulseNode {
  angle: number;
  radius: number;
  size: number;
  life: number;
  hue: number;
  drift: number;
  swirl: number;
}

interface WaveformVisualizerProps {
  height?: number;
  micEnabled?: boolean;
  requestMic?: boolean;
}

export default function WaveformVisualizer({
  height = 96,
  micEnabled = true,
  requestMic = true,
}: WaveformVisualizerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState<WaveformStatus>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let rafId = 0;
    let stream: MediaStream | null = null;
    let audioContext: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let cancelled = false;

    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    if (!navigator.mediaDevices?.getUserMedia || typeof window.AudioContext === 'undefined') {
      setStatus('unsupported');
      return;
    }

    const context = canvas.getContext('2d');
    if (!context) {
      setStatus('error');
      setErrorMessage('Unable to initialize canvas rendering.');
      return;
    }

    let cssWidth = 0;
    let cssHeight = height;
    let smoothedEnergy = 0;
    let lastPulseTime = 0;
    let pulseNodes: PulseNode[] = [];

    const resizeCanvas = () => {
      const nextWidth = Math.max(1, container.clientWidth);
      const nextHeight = Math.max(1, container.clientHeight || height);
      const dpr = window.devicePixelRatio || 1;

      cssWidth = nextWidth;
      cssHeight = nextHeight;

      canvas.width = Math.floor(nextWidth * dpr);
      canvas.height = Math.floor(nextHeight * dpr);
      canvas.style.width = `${nextWidth}px`;
      canvas.style.height = `${nextHeight}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const logoImage = new Image();
    logoImage.src = starlyIcon;

    const drawLogo = (x: number, y: number, size: number, alpha: number, rotation = 0) => {
      if (!logoImage.complete) return false;
      context.save();
      context.globalAlpha = alpha;
      context.translate(x, y);
      context.rotate(rotation);
      context.filter = 'brightness(0) invert(1)';
      context.drawImage(logoImage, -size / 2, -size / 2, size, size);
      context.filter = 'none';
      context.restore();
      return true;
    };

    const drawBackdrop = () => {
      const base = context.createLinearGradient(0, 0, cssWidth, cssHeight);
      base.addColorStop(0, '#05070f');
      base.addColorStop(0.55, '#090f1f');
      base.addColorStop(1, '#060916');
      context.fillStyle = base;
      context.fillRect(0, 0, cssWidth, cssHeight);
    };

    const drawIdle = (message: string) => {
      drawBackdrop();
      const centerX = cssWidth / 2;
      const centerY = cssHeight / 2;
      const idleRadius = Math.max(32, Math.min(cssWidth, cssHeight) * 0.2);
      const idleGlow = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, idleRadius * 2.2);
      idleGlow.addColorStop(0, 'rgba(170, 235, 255, 0.55)');
      idleGlow.addColorStop(0.5, 'rgba(96, 184, 255, 0.28)');
      idleGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      context.fillStyle = idleGlow;
      context.beginPath();
      context.arc(centerX, centerY, idleRadius * 2.2, 0, Math.PI * 2);
      context.fill();

      const drewLogo = drawLogo(centerX, centerY, idleRadius * 2.05, 0.9);
      if (!drewLogo) {
        context.fillStyle = 'rgba(218, 247, 255, 0.88)';
        context.beginPath();
        context.arc(centerX, centerY, idleRadius * 0.7, 0, Math.PI * 2);
        context.fill();
      }

      context.fillStyle = '#d5ddf0';
      context.font = '14px sans-serif';
      context.textAlign = 'center';
      context.fillText(message, cssWidth / 2, cssHeight / 2 - 12);
    };

    const start = async () => {
      resizeCanvas();
      if (!requestMic) {
        setStatus('ready');
        drawIdle('Waiting for camera permission...');
        return;
      }
      if (!micEnabled) {
        setStatus('ready');
        drawIdle('Microphone is off');
        return;
      }
      drawIdle('Requesting microphone access...');

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        audioContext = new AudioContext();
        if (audioContext.state === 'suspended') {
          await audioContext.resume();
        }

        analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.85;
        analyser.minDecibels = -90;
        analyser.maxDecibels = -10;

        source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        setStatus('ready');

        const draw = () => {
          if (!analyser) return;

          analyser.getByteFrequencyData(dataArray);

          const now = performance.now();
          drawBackdrop();

          let lowSum = 0;
          let lowCount = 0;
          let midSum = 0;
          let midCount = 0;
          let highSum = 0;
          let highCount = 0;
          const startBin = 6;
          const endBin = Math.min(dataArray.length - 1, 180);

          for (let i = startBin; i <= endBin; i += 1) {
            const value = (dataArray[i] ?? 0) / 255;
            const ratio = (i - startBin) / Math.max(1, endBin - startBin);
            if (ratio < 0.33) {
              lowSum += value;
              lowCount += 1;
            } else if (ratio < 0.7) {
              midSum += value;
              midCount += 1;
            } else {
              highSum += value;
              highCount += 1;
            }
          }

          const low = lowCount > 0 ? lowSum / lowCount : 0;
          const mid = midCount > 0 ? midSum / midCount : 0;
          const high = highCount > 0 ? highSum / highCount : 0;
          const rawEnergy = low * 0.5 + mid * 0.35 + high * 0.15;
          const gatedEnergy = rawEnergy < 0.05 ? 0 : (rawEnergy - 0.05) / 0.95;

          smoothedEnergy += (gatedEnergy - smoothedEnergy) * (gatedEnergy > smoothedEnergy ? 0.3 : 0.08);
          const energy = Math.min(1, Math.max(0, smoothedEnergy));

          const centerX = cssWidth / 2;
          const centerY = cssHeight / 2;
          const baseRadius = Math.max(34, Math.min(cssWidth, cssHeight) * 0.22);
          const pulseRadius = baseRadius * (1 + energy * 0.38 + Math.sin(now * 0.005) * 0.03);
          const rotation = -Math.PI / 2 + Math.sin(now * 0.0012) * 0.08;

          const centerGlow = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, pulseRadius * 2.25);
          centerGlow.addColorStop(0, `rgba(198, 245, 255, ${0.62 + energy * 0.2})`);
          centerGlow.addColorStop(0.38, `rgba(109, 194, 255, ${0.45 + energy * 0.22})`);
          centerGlow.addColorStop(0.72, `rgba(46, 128, 255, ${0.18 + energy * 0.2})`);
          centerGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
          context.fillStyle = centerGlow;
          context.beginPath();
          context.arc(centerX, centerY, pulseRadius * 2.25, 0, Math.PI * 2);
          context.fill();

          const logoSize = pulseRadius * 2.12;
          const drewMainLogo = drawLogo(centerX, centerY, logoSize, 0.82 + energy * 0.16, rotation);

          if (!drewMainLogo) {
            context.fillStyle = `rgba(225, 250, 255, ${0.72 + energy * 0.2})`;
            context.beginPath();
            context.arc(centerX, centerY, pulseRadius * 0.55, 0, Math.PI * 2);
            context.fill();
          }

          context.fillStyle = `rgba(236, 252, 255, ${0.72 + energy * 0.2})`;
          context.beginPath();
          context.arc(centerX, centerY, pulseRadius * 0.1, 0, Math.PI * 2);
          context.fill();

          if (energy > 0.1 && now - lastPulseTime > Math.max(65, 240 - energy * 170)) {
            lastPulseTime = now;
            const extra = energy > 0.45 ? 1 : 0;
            for (let i = 0; i <= extra; i += 1) {
              pulseNodes.push({
                angle: Math.random() * Math.PI * 2,
                radius: pulseRadius * (0.7 + Math.random() * 0.7),
                size: Math.max(8, pulseRadius * (0.16 + Math.random() * 0.14)),
                life: 1,
                hue: 185 + Math.random() * 35,
                drift: 0.8 + Math.random() * 1.6,
                swirl: (Math.random() - 0.5) * 0.016,
              });
            }
          }

          pulseNodes = pulseNodes
            .map((node) => ({
              ...node,
              life: node.life - (0.018 + (1 - energy) * 0.004),
              radius: node.radius + node.drift * (1 + energy * 1.6),
              angle: node.angle + node.swirl,
            }))
            .filter((node) => node.life > 0);

          for (const node of pulseNodes) {
            const x = centerX + Math.cos(node.angle) * node.radius;
            const y = centerY + Math.sin(node.angle) * node.radius;
            const alpha = node.life * (0.2 + energy * 0.35);
            const glow = context.createRadialGradient(x, y, 0, x, y, node.size * 2.6);
            glow.addColorStop(0, `hsla(${node.hue}, 95%, 72%, ${alpha * 1.3})`);
            glow.addColorStop(0.45, `hsla(${node.hue + 10}, 92%, 60%, ${alpha})`);
            glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
            context.fillStyle = glow;
            context.beginPath();
            context.arc(x, y, node.size * 2.6, 0, Math.PI * 2);
            context.fill();
          }

          rafId = window.requestAnimationFrame(draw);
        };

        draw();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to access microphone.';
        setStatus('error');
        setErrorMessage(message);
        drawIdle(`Microphone unavailable: ${message}`);
      }
    };

    start();

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => resizeCanvas());
      resizeObserver.observe(container);
    } else {
      window.addEventListener('resize', resizeCanvas);
    }

    return () => {
      cancelled = true;
      if (rafId) window.cancelAnimationFrame(rafId);
      if (resizeObserver) resizeObserver.disconnect();
      if (!resizeObserver) window.removeEventListener('resize', resizeCanvas);
      if (source) source.disconnect();
      if (analyser) analyser.disconnect();
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      if (audioContext) {
        void audioContext.close();
      }
    };
  }, [height, micEnabled, requestMic]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        height: `${height}px`,
        width: '100%',
        borderRadius: '14px',
        overflow: 'hidden',
        border: '1px solid rgba(92, 146, 255, 0.32)',
        background: 'linear-gradient(160deg, rgba(9, 14, 31, 0.95), rgba(6, 10, 22, 0.96))',
        boxShadow: 'inset 0 0 24px rgba(45, 109, 255, 0.15), 0 6px 24px rgba(4, 8, 20, 0.55)',
      }}
      aria-live="polite"
    >
      <canvas ref={canvasRef} />

      {status !== 'ready' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#d5ddf0',
            fontSize: '0.9rem',
            textAlign: 'center',
            padding: '0.75rem',
          }}
        >
          {status === 'loading' && 'Requesting microphone access...'}
          {status === 'unsupported' && 'Microphone waveform is not supported in this browser.'}
          {status === 'error' && `Microphone unavailable: ${errorMessage}`}
        </div>
      )}
    </div>
  );
}
