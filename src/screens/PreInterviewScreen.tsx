import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInterview } from '../context/InterviewContext';
import { useTTS } from '../hooks/useTTS';
import { useDeepgramTranscription } from '../hooks/useDeepgramTranscription';
import { prefetchTTS, generateScriptResponse } from '../services/openai';
import { defaultScript, getPreInterviewPrefetchTexts } from '../config/preInterviewScript';
import { fuzzyMatchTrigger } from '../utils/fuzzyMatch';
import ParticleVisualizer from '../components/ParticleVisualizer';
import starlyIcon from '../Icons/StarlyLogo.png';
import starlyWordmark from '../Icons/STARLY.png';
import { createLogger } from '../utils/logger';

const log = createLogger('PreInterview');

type Phase = 'initializing' | 'listening' | 'responding';

export default function PreInterviewScreen() {
  const { state } = useInterview();
  const navigate = useNavigate();
  const { speak, speakChunks, isPlaying: ttsPlaying, stopPlayback, analyserNode: ttsAnalyserNode } = useTTS();
  const deepgram = useDeepgramTranscription();

  const [phase, setPhase] = useState<Phase>('initializing');
  const [stepIndex, setStepIndex] = useState(0);
  const [subtitle, setSubtitle] = useState('');
  const [mounted, setMounted] = useState(false);

  const lastCheckedIndexRef = useRef(0);
  const micStreamRef = useRef<MediaStream | null>(null);
  const phaseRef = useRef<Phase>('initializing');
  phaseRef.current = phase;
  const stepIndexRef = useRef(0);
  stepIndexRef.current = stepIndex;

  const script = defaultScript;

  // Guard: redirect to /setup if no questions in context
  useEffect(() => {
    if (state.questions.length === 0) {
      log.warn('No questions loaded, redirecting to setup');
      navigate('/setup', { replace: true });
    }
  }, [state.questions.length, navigate]);

  // Mount animation
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 60);
    return () => clearTimeout(t);
  }, []);

  // Prefetch TTS for all hardcoded responses on mount
  useEffect(() => {
    prefetchTTS(getPreInterviewPrefetchTexts(script), 'marin', 1.0);
  }, []);

  // Initialize mic + Deepgram
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        micStreamRef.current = stream;
        await deepgram.start(stream);
        log.info('Mic + Deepgram initialized');
        setPhase('listening');
      } catch (err) {
        log.error('Mic initialization failed', { error: String(err) });
        // Skip pre-interview if mic fails
        navigate('/interview', { replace: true });
      }
    }

    init();

    return () => {
      cancelled = true;
      deepgram.stop();
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
        micStreamRef.current = null;
      }
      stopPlayback();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle trigger detection
  const handleTriggerDetected = useCallback(
    async (currentStepIndex: number) => {
      const step = script.steps[currentStepIndex];
      if (!step) return;

      setPhase('responding');
      log.info('Trigger detected', { stepIndex: currentStepIndex, trigger: step.trigger });

      // Build response chunks (string[] for chunked TTS, or single string from AI)
      let chunks: string[];
      const rawResponse = step.response ?? '';

      // Try AI-generated response if directive is set
      if (step.aiDirective) {
        try {
          const transcriptContext = deepgram.getFullTranscript();
          const aiResponse = await generateScriptResponse(
            script.systemPrompt,
            step.aiDirective,
            transcriptContext,
          );
          chunks = [aiResponse];
          log.info('AI response generated', { length: aiResponse.length });
        } catch (err) {
          log.warn('AI response failed, using fallback', { error: String(err) });
          chunks = Array.isArray(rawResponse) ? rawResponse : [rawResponse];
        }
      } else {
        chunks = Array.isArray(rawResponse) ? rawResponse : [rawResponse];
      }

      const fullText = chunks.join(' ');

      // Play chunks as separate TTS calls (pre-fetched in parallel, played sequentially)
      try {
        await speakChunks(chunks, { onStart: () => setSubtitle(fullText) });
      } catch (err) {
        log.warn('TTS playback failed', { error: String(err) });
        setSubtitle(fullText);
      }

      // Advance past any echo text
      const currentTranscript = deepgram.getFullTranscript();
      lastCheckedIndexRef.current = currentTranscript.length;

      // Move to next step or complete
      const nextIndex = currentStepIndex + 1;
      if (nextIndex >= script.steps.length) {
        // All steps done — go straight to interview
        navigate('/interview', { replace: true, state: { autoStart: true } });
      } else {
        setStepIndex(nextIndex);
        setPhase('listening');
      }
    },
    [deepgram, navigate, script, speak],
  );

  // Watch transcript for trigger matches
  useEffect(() => {
    if (phase !== 'listening') return;

    const currentStep = script.steps[stepIndex];
    if (!currentStep) return;

    const fullTranscript = deepgram.transcript;
    const newText = fullTranscript.slice(lastCheckedIndexRef.current);
    if (!newText.trim()) return;

    const matched = fuzzyMatchTrigger(
      currentStep.trigger,
      currentStep.triggerAliases ?? [],
      newText,
      currentStep.threshold ?? 0.7,
    );

    if (matched) {
      void handleTriggerDetected(stepIndex);
    }
  }, [deepgram.transcript, phase, stepIndex, script.steps, handleTriggerDetected]);

  // Skip handler
  const handleSkip = useCallback(() => {
    log.info('Skipping pre-interview');
    stopPlayback();
    deepgram.stop();
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    navigate('/interview', { replace: true });
  }, [navigate, stopPlayback, deepgram]);

  // Particle energy for visualizer
  const [particleEnergy, setParticleEnergy] = useState(0);
  const lastEnergyRef = useRef(0);
  const normalizedEnergy = Math.min(1, Math.max(0, particleEnergy * 2.4));
  const activeEnergy = ttsPlaying ? normalizedEnergy : 0;

  const handleParticleEnergy = useCallback((energy: number) => {
    const now = performance.now();
    if (now - lastEnergyRef.current < 70) return;
    lastEnergyRef.current = now;
    setParticleEnergy(energy);
  }, []);

  const stagger = (i: number) => ({
    opacity: mounted ? 1 : 0,
    transform: mounted ? 'translateY(0)' : 'translateY(22px)',
    transition: `opacity 0.5s ease ${i * 0.08}s, transform 0.55s cubic-bezier(0.34,1.56,0.64,1) ${i * 0.08}s`,
  });

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#05050a',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
        fontFamily: "'Josefin Sans', sans-serif",
      }}
    >
      <style>{`
        @keyframes pulse-ring {
          0%   { transform: scale(1); opacity: 0.7; }
          100% { transform: scale(1.7); opacity: 0; }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes logoPulse {
          0%, 100% { transform: scale(1.08); }
          50% { transform: scale(1.18); }
        }
        @keyframes starlyFlow {
          0%, 100% { transform: translate(-50%, -50%) scale(1); }
          50% { transform: translate(-50%, -50%) scale(1.06); }
        }
        @keyframes starlyGlow {
          0%, 100% { filter: invert(1) brightness(1.25) drop-shadow(0 0 12px rgba(255, 255, 255, 0.4)) drop-shadow(0 0 26px rgba(180, 210, 255, 0.25)); }
          50% { filter: invert(1) brightness(1.45) drop-shadow(0 0 15px rgba(255, 255, 255, 0.62)) drop-shadow(0 0 36px rgba(190, 220, 255, 0.42)); }
        }
        .skip-btn {
          background: rgba(255,255,255,0.04);
          border: 1px solid #1c1c1c;
          border-radius: 10px;
          color: #4b5563;
          cursor: pointer;
          font-family: 'Josefin Sans', sans-serif;
          font-size: 12px;
          padding: 8px 20px;
          transition: all 0.18s;
        }
        .skip-btn:hover {
          background: rgba(255,255,255,0.08);
          color: #818cf8;
          border-color: #6366f140;
        }
      `}</style>

      {/* Background glows */}
      <div
        style={{
          position: 'fixed',
          top: '-10%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '600px',
          height: '600px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(99,102,241,0.06) 0%, transparent 65%)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* Starly logo */}
      <div style={{ ...stagger(0), marginBottom: '16px', zIndex: 1 }}>
        <img
          src={starlyIcon}
          alt="Starly"
          style={{
            height: '80px',
            width: 'auto',
            objectFit: 'contain',
            opacity: ttsPlaying ? 1 : 0.55,
            filter: ttsPlaying
              ? 'brightness(1.25) drop-shadow(0 0 8px rgba(255,255,255,0.5))'
              : 'brightness(0.7)',
            transform: ttsPlaying ? 'scale(1.12)' : 'scale(1)',
            transition: 'opacity 0.4s ease, filter 0.4s ease, transform 0.4s ease',
            animation: ttsPlaying ? 'logoPulse 2s ease-in-out infinite' : 'none',
          }}
        />
      </div>

      {/* Visualizer */}
      <div
        style={{
          ...stagger(1),
          width: '320px',
          height: '320px',
          position: 'relative',
          zIndex: 1,
          marginBottom: '24px',
        }}
      >
        <ParticleVisualizer
          analyserNode={ttsAnalyserNode}
          isSpeaking={ttsPlaying}
          onEnergyChange={handleParticleEnergy}
        />
        <img
          src={starlyWordmark}
          alt="STARLY"
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            zIndex: 5,
            width: '80px',
            height: 'auto',
            objectFit: 'contain',
            pointerEvents: 'none',
            opacity: 0.54 + activeEnergy * 0.2,
            filter: `invert(1) brightness(${(1.2 + activeEnergy * 0.36).toFixed(3)}) drop-shadow(0 0 ${Math.round(8 + activeEnergy * 12)}px rgba(255, 255, 255, 0.52)) drop-shadow(0 0 ${Math.round(20 + activeEnergy * 30)}px rgba(180, 210, 255, 0.34))`,
            mixBlendMode: 'screen',
            transformOrigin: '50% 50%',
            transition: 'opacity 160ms linear, filter 180ms linear',
            animation: 'starlyFlow 3s ease-in-out infinite, starlyGlow 1.8s ease-in-out infinite',
            animationFillMode: 'both',
          }}
        />
      </div>

      {/* Subtitle / response text */}
      <div
        style={{
          ...stagger(2),
          zIndex: 1,
          maxWidth: '520px',
          minHeight: '60px',
          textAlign: 'center',
          marginBottom: '32px',
          padding: '0 24px',
        }}
      >
        {subtitle && (
          <p
            key={subtitle.slice(0, 30)}
            style={{
              fontFamily: "'Josefin Sans', sans-serif",
              fontSize: '16px',
              color: '#d1d5db',
              lineHeight: 1.6,
              margin: 0,
              animation: 'fadeUp 0.35s ease forwards',
            }}
          >
            {subtitle}
          </p>
        )}
      </div>

      {/* Listening indicator */}
      <div style={{ ...stagger(3), zIndex: 1, marginBottom: '24px' }}>
        {phase === 'listening' && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '10px',
              padding: '8px 20px',
              background: 'rgba(209,213,219,0.06)',
              border: '1px solid rgba(209,213,219,0.18)',
              borderRadius: '999px',
            }}
          >
            <div style={{ position: 'relative', width: '10px', height: '10px' }}>
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: '50%',
                  background: '#d1d5db',
                  animation: 'pulse-ring 1.6s ease-out infinite',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: '50%',
                  background: '#d1d5db',
                }}
              />
            </div>
            <span
              style={{
                fontFamily: "'Josefin Sans', sans-serif",
                fontSize: '12px',
                fontWeight: '600',
                color: '#d1d5db',
                letterSpacing: '0.1em',
              }}
            >
              Listening...
            </span>
          </div>
        )}
        {phase === 'responding' && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '10px',
              padding: '8px 20px',
              background: 'rgba(163,230,53,0.06)',
              border: '1px solid rgba(163,230,53,0.18)',
              borderRadius: '999px',
            }}
          >
            <div
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: '#a3e635',
              }}
            />
            <span
              style={{
                fontFamily: "'Josefin Sans', sans-serif",
                fontSize: '12px',
                fontWeight: '600',
                color: '#a3e635',
                letterSpacing: '0.1em',
              }}
            >
              Speaking...
            </span>
          </div>
        )}
        {phase === 'initializing' && (
          <div
            style={{
              fontFamily: "'Josefin Sans', sans-serif",
              fontSize: '12px',
              color: '#4b5563',
              letterSpacing: '0.08em',
            }}
          >
            Initializing microphone...
          </div>
        )}
      </div>

      {/* Trigger hint */}
      {phase === 'listening' && script.steps[stepIndex] && (
        <div
          style={{
            ...stagger(4),
            zIndex: 1,
            marginBottom: '20px',
            fontFamily: "'Josefin Sans', sans-serif",
            fontSize: '11px',
            color: '#2d2d40',
          }}
        >
          Try saying: &ldquo;
          <span style={{ color: '#4b5563' }}>{script.steps[stepIndex].trigger}</span>
          &rdquo;
        </div>
      )}

      {/* Skip button */}
      <div style={{ ...stagger(5), zIndex: 1 }}>
        <button className="skip-btn" onClick={handleSkip}>
          Skip to interview &rarr;
        </button>
      </div>
    </div>
  );
}
