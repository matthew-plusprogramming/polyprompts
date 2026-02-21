import { useEffect, useRef, useState } from 'react';

type WaveformStatus = 'loading' | 'ready' | 'unsupported' | 'error';

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
  const levelsRef = useRef<number[]>([]);
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
    const barWidth = 4;
    const barGap = 3;

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

    const drawIdle = (message: string) => {
      context.fillStyle = '#131a2a';
      context.fillRect(0, 0, cssWidth, cssHeight);

      context.strokeStyle = 'rgba(125, 214, 255, 0.35)';
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(0, cssHeight / 2);
      context.lineTo(cssWidth, cssHeight / 2);
      context.stroke();

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

          context.fillStyle = '#131a2a';
          context.fillRect(0, 0, cssWidth, cssHeight);

          const centerY = cssHeight / 2;
          context.strokeStyle = 'rgba(125, 214, 255, 0.25)';
          context.lineWidth = 1;
          context.beginPath();
          context.moveTo(0, centerY);
          context.lineTo(cssWidth, centerY);
          context.stroke();

          const bars = Math.max(8, Math.floor(cssWidth / (barWidth + barGap)));
          const startBin = 10;
          const endBin = Math.min(dataArray.length - 1, 120);
          const usableBins = Math.max(1, endBin - startBin + 1);
          const usableWidth = bars * (barWidth + barGap) - barGap;
          const startX = Math.max(0, (cssWidth - usableWidth) / 2);
          const noiseGate = 0.08;
          const leftGuardBars = 4;

          if (levelsRef.current.length !== bars) {
            levelsRef.current = Array.from({ length: bars }, () => 0);
          }

          for (let i = 0; i < bars; i += 1) {
            const rangeStart = startBin + Math.floor((i / bars) * usableBins);
            const rangeEnd = startBin + Math.floor(((i + 1) / bars) * usableBins);
            let sum = 0;
            let count = 0;
            for (let j = rangeStart; j <= rangeEnd; j += 1) {
              sum += dataArray[Math.min(j, endBin)] ?? 0;
              count += 1;
            }

            const raw = count > 0 ? sum / count : 0;
            const normalized = Math.min(1, Math.max(0, raw / 255));
            const gated = normalized < noiseGate ? 0 : (normalized - noiseGate) / (1 - noiseGate);
            const boostedTarget = Math.min(1, Math.pow(gated, 0.9) * 1.12);
            const previous = levelsRef.current[i] ?? 0;
            const smoothAmp = boostedTarget > previous
              ? previous + (boostedTarget - previous) * 0.52
              : previous + (boostedTarget - previous) * 0.1;
            levelsRef.current[i] = smoothAmp;

            let amp = smoothAmp;
            if (i < leftGuardBars) {
              const guard = 0.18 + (i / leftGuardBars) * 0.82;
              amp *= guard;
            }
            const halfHeight = amp * (cssHeight * 0.38);
            const x = startX + i * (barWidth + barGap);
            const y = centerY - halfHeight;
            const h = halfHeight * 2;
            const intensity = 0.22 + amp * 0.72;

            context.fillStyle = `rgba(83, 206, 255, ${intensity})`;
            context.fillRect(x, y, barWidth, h);
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
        borderRadius: '10px',
        overflow: 'hidden',
        border: '1px solid #28324a',
        background: '#131a2a',
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
