import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInterview } from '../context/InterviewContext';
import WaveformVisualizer from '../components/WaveformVisualizer';
import microphoneOnIcon from '../icons/microphoneOn.png';
import microphoneOffIcon from '../icons/microphoneOff.png';
import cameraOnIcon from '../icons/cameraOn.png';
import cameraOffIcon from '../icons/cameraOff.png';

export default function InterviewScreen() {
  const { state } = useInterview();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const transcriptBodyRef = useRef<HTMLDivElement | null>(null);
  const [cameraStatus, setCameraStatus] = useState<'loading' | 'ready' | 'unsupported' | 'error'>('loading');
  const [cameraError, setCameraError] = useState('');
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [micEnabled, setMicEnabled] = useState(true);
  const [currentTime, setCurrentTime] = useState(() =>
    new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  );
  const [answerSeconds, setAnswerSeconds] = useState(0);

  const handleDone = () => {
    // TODO: Stop recording, send to Whisper, score, then navigate
    navigate('/feedback');
  };

  const requestCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraStatus('unsupported');
      return;
    }
    if (streamRef.current) {
      setCameraStatus('ready');
      return;
    }

    setCameraStatus('loading');
    setCameraError('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;
      stream.getVideoTracks().forEach((track) => {
        track.enabled = true;
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setCameraStatus('ready');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to access camera.';
      setCameraError(message);
      setCameraStatus('error');
    }
  }, []);

  useEffect(() => {
    void requestCamera();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [requestCamera]);

  useEffect(() => {
    if (!streamRef.current) return;
    streamRef.current.getVideoTracks().forEach((track) => {
      track.enabled = cameraEnabled;
    });
  }, [cameraEnabled]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!micEnabled) return;
    const id = window.setInterval(() => {
      setAnswerSeconds((seconds) => seconds + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [micEnabled]);

  const answerTimeLabel = useMemo(() => {
    const mins = Math.floor(answerSeconds / 60);
    const secs = answerSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }, [answerSeconds]);
  const demoTranscript = `
Interviewer: Tell me about a time you solved a complex problem under pressure.
Candidate: In my previous role, our release pipeline failed on launch day and blocked customer updates. I took ownership of triage, split the incident into build, test, and deploy tracks, and coordinated with engineering and QA in 15-minute checkpoints.
Candidate: I identified that a dependency version mismatch was causing non-deterministic test failures. I pinned versions, updated lockfiles, and added a validation step in CI so we could catch drift earlier.
Candidate: While the fix was rolling out, I communicated status every 20 minutes to stakeholders and documented risk with clear go/no-go criteria.
Candidate: We restored the pipeline in under two hours, shipped the release the same day, and reduced similar failures by about 60% over the next quarter.
Interviewer: What did you learn from that experience?
Candidate: I learned that speed comes from structure, not rushing. When I define owners, timelines, and fallback paths early, the team can move faster with less confusion.
Candidate: I also learned to pair technical debugging with communication discipline. Stakeholders stay aligned when updates are concise, timestamped, and action-focused.
Interviewer: How do you apply that learning today?
Candidate: I now run pre-release checklists, automate dependency checks, and rehearse rollback procedures. That preparation has made launches smoother and reduced emergency fixes.
Candidate: Another example was a customer analytics dashboard migration where I rewrote critical queries, improved load time from 9 seconds to 2.3 seconds, and created monitoring alerts for latency spikes.
Candidate: Across projects, I focus on measurable outcomes, clear ownership, and postmortems that produce concrete process changes.
`.trim();

  useEffect(() => {
    if (!transcriptBodyRef.current) return;
    transcriptBodyRef.current.scrollTop = transcriptBodyRef.current.scrollHeight;
  }, [state.liveTranscript]);

  return (
    <div
      style={{
        height: '100vh',
        padding: '1rem 1.4rem 1rem',
        boxSizing: 'border-box',
        width: '100%',
        maxWidth: '1480px',
        margin: '0 auto',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '24px',
        border: '1px solid rgba(125, 158, 255, 0.22)',
        color: '#e6efff',
        backgroundColor: '#030b1d',
        background:
          'radial-gradient(circle at 8% -10%, rgba(56, 189, 248, 0.25), transparent 35%), radial-gradient(circle at 90% 0%, rgba(59, 130, 246, 0.22), transparent 34%), linear-gradient(135deg, rgba(30, 64, 175, 0.18), rgba(3, 7, 18, 0.15) 45%, rgba(14, 165, 233, 0.1) 100%), repeating-linear-gradient(120deg, rgba(148, 163, 184, 0.05) 0px, rgba(148, 163, 184, 0.05) 1px, transparent 1px, transparent 14px), #020a1a',
        boxShadow: '0 20px 80px rgba(2, 6, 23, 0.6), inset 0 0 48px rgba(59, 130, 246, 0.12)',
        fontFamily: "'Space Grotesk', 'Segoe UI', sans-serif",
      }}
    >
      <style>
        {`
          .transcript-scroll {
            scrollbar-width: thin;
            scrollbar-color: rgba(125, 211, 252, 0.6) rgba(8, 23, 50, 0.35);
          }
          .transcript-scroll::-webkit-scrollbar {
            width: 10px;
          }
          .transcript-scroll::-webkit-scrollbar-track {
            background: rgba(8, 23, 50, 0.32);
            border-radius: 999px;
          }
          .transcript-scroll::-webkit-scrollbar-thumb {
            background: linear-gradient(180deg, rgba(186, 230, 253, 0.9), rgba(56, 189, 248, 0.75));
            border-radius: 999px;
            border: 2px solid rgba(8, 23, 50, 0.35);
          }
          .transcript-scroll::-webkit-scrollbar-thumb:hover {
            background: linear-gradient(180deg, rgba(224, 242, 254, 0.95), rgba(103, 232, 249, 0.85));
          }
        `}
      </style>
      <div
        style={{
          position: 'absolute',
          top: '-80px',
          right: '-120px',
          width: '320px',
          height: '320px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(125, 211, 252, 0.25), rgba(125, 211, 252, 0))',
          pointerEvents: 'none',
          filter: 'blur(2px)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '-120px',
          left: '-80px',
          width: '280px',
          height: '280px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(59, 130, 246, 0.22), rgba(59, 130, 246, 0))',
          pointerEvents: 'none',
        }}
      />
      <header
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          alignItems: 'center',
          marginBottom: '0.9rem',
          gap: '0.75rem',
        }}
      >
        <div style={{ justifySelf: 'start' }}>
          <div
            style={{
              color: '#bfdbfe',
              fontSize: '0.95rem',
              fontWeight: 800,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              marginLeft: '0.4rem',
            }}
          >
            STARLY
          </div>
        </div>

        <div
          style={{
            justifySelf: 'center',
            fontSize: '1.05rem',
            fontWeight: 700,
            color: '#dbeafe',
            background: 'linear-gradient(160deg, rgba(11, 27, 56, 0.94), rgba(14, 36, 76, 0.76))',
            border: '1px solid rgba(125, 158, 255, 0.35)',
            borderRadius: '12px',
            padding: '0.45rem 0.85rem',
            boxShadow: '0 0 24px rgba(59, 130, 246, 0.2), inset 0 0 12px rgba(125, 211, 252, 0.16)',
          }}
        >
          {currentTime}
        </div>

        <div style={{ justifySelf: 'end', display: 'flex', gap: '0.6rem' }}>
          <button
            type="button"
            style={{
              padding: '0.55rem 0.95rem',
              borderRadius: '12px',
              border: '1px solid rgba(125, 158, 255, 0.35)',
              background: 'linear-gradient(145deg, rgba(11, 27, 56, 0.95), rgba(8, 23, 50, 0.85))',
              color: '#dbeafe',
              fontSize: '0.9rem',
            }}
          >
            Settings
          </button>
          <button
            type="button"
            onClick={handleDone}
            style={{
              padding: '0.55rem 0.95rem',
              borderRadius: '12px',
              border: '1px solid rgba(125, 211, 252, 0.85)',
              background: 'linear-gradient(135deg, #0ea5e9, #2563eb 48%, #1e3a8a)',
              color: '#eff6ff',
              fontSize: '0.9rem',
              fontWeight: 700,
              boxShadow: '0 8px 20px rgba(14, 165, 233, 0.35)',
            }}
          >
            End
          </button>
        </div>
      </header>

      <div
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
          gridTemplateRows: 'minmax(0, 1fr)',
          alignItems: 'stretch',
          gap: '0.75rem',
          marginBottom: '0.75rem',
          flex: '1 1 auto',
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        <section
          style={{
            minHeight: 0,
            height: '100%',
            boxSizing: 'border-box',
            border: '1px solid rgba(125, 158, 255, 0.28)',
            borderRadius: '20px',
            overflow: 'hidden',
            background: 'rgba(3, 15, 34, 0.94)',
            color: '#eff6ff',
            position: 'relative',
            boxShadow: 'inset 0 0 28px rgba(37, 99, 235, 0.18), 0 10px 24px rgba(2, 6, 23, 0.35)',
          }}
        >
          <video
            ref={videoRef}
            muted
            playsInline
            autoPlay
            controls={false}
            disablePictureInPicture
            disableRemotePlayback
            onContextMenu={(e) => e.preventDefault()}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transform: 'scaleX(-1)',
              display: cameraStatus === 'ready' && cameraEnabled ? 'block' : 'none',
              pointerEvents: 'none',
            }}
          />

          {(cameraStatus !== 'ready' || !cameraEnabled) && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                padding: '1rem',
              }}
            >
              <div>
                <strong>Your Video</strong>
                <p style={{ marginTop: '0.5rem', color: '#d0d0d0' }}>
                  {!cameraEnabled && 'Camera is off.'}
                  {cameraStatus === 'loading' && 'Requesting camera access...'}
                  {cameraStatus === 'unsupported' && 'Camera is not supported in this browser.'}
                  {cameraStatus === 'error' && `Camera unavailable: ${cameraError}`}
                </p>
                {(cameraStatus === 'error' || cameraStatus === 'unsupported') && cameraEnabled && (
                  <button
                    type="button"
                    onClick={() => void requestCamera()}
                    style={{
                      marginTop: '0.65rem',
                      padding: '0.4rem 0.7rem',
                      borderRadius: '8px',
                      border: '1px solid rgba(125, 158, 255, 0.35)',
                      background: 'rgba(14, 36, 76, 0.88)',
                      color: '#dbeafe',
                      cursor: 'pointer',
                    }}
                  >
                    Retry Camera
                  </button>
                )}
              </div>
            </div>
          )}

          <div
            style={{
              position: 'absolute',
              left: '12px',
              bottom: '12px',
              display: 'flex',
              gap: '8px',
              zIndex: 2,
            }}
          >
            <button
              type="button"
              onClick={() => setMicEnabled((prev) => !prev)}
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '999px',
                border: micEnabled ? '1px solid rgba(125, 158, 255, 0.35)' : '1px solid rgba(147, 197, 253, 0.4)',
                background: micEnabled ? 'rgba(14, 36, 76, 0.9)' : 'rgba(25, 57, 112, 0.9)',
                color: '#fff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              aria-label={micEnabled ? 'Turn microphone off' : 'Turn microphone on'}
              title={micEnabled ? 'Turn microphone off' : 'Turn microphone on'}
            >
              <img
                src={micEnabled ? microphoneOnIcon : microphoneOffIcon}
                alt={micEnabled ? 'Microphone on' : 'Microphone off'}
                style={{
                  width: '20px',
                  height: '20px',
                  objectFit: 'contain',
                }}
              />
            </button>
            <button
              type="button"
              onClick={() => {
                const next = !cameraEnabled;
                setCameraEnabled(next);
                if (next && !streamRef.current) {
                  void requestCamera();
                }
              }}
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '999px',
                border: cameraEnabled ? '1px solid rgba(125, 158, 255, 0.35)' : '1px solid rgba(147, 197, 253, 0.4)',
                background: cameraEnabled ? 'rgba(14, 36, 76, 0.9)' : 'rgba(25, 57, 112, 0.9)',
                color: '#fff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              aria-label={cameraEnabled ? 'Turn camera off' : 'Turn camera on'}
              title={cameraEnabled ? 'Turn camera off' : 'Turn camera on'}
            >
              <img
                src={cameraEnabled ? cameraOnIcon : cameraOffIcon}
                alt={cameraEnabled ? 'Camera on' : 'Camera off'}
                style={{
                  width: '20px',
                  height: '20px',
                  objectFit: 'contain',
                }}
              />
            </button>
          </div>
        </section>

        <section
          style={{
            minHeight: 0,
            height: '100%',
            boxSizing: 'border-box',
            border: '1px solid rgba(125, 158, 255, 0.3)',
            borderRadius: '20px',
            background: 'linear-gradient(165deg, rgba(6, 22, 49, 0.95), rgba(4, 14, 31, 0.94))',
            color: '#e0ebff',
            padding: '1.15rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.95rem',
            overflow: 'hidden',
            boxShadow: 'inset 0 0 28px rgba(59, 130, 246, 0.17), 0 10px 24px rgba(2, 6, 23, 0.35)',
          }}
        >
          <strong>Live Audio Waveform</strong>
          <p style={{ marginTop: '0.4rem', marginBottom: '0.85rem', fontSize: '0.85rem', color: '#9dc6ff' }}>
            Real-time visual pulse when STARLY asks questions.
          </p>

          <WaveformVisualizer height={210} micEnabled={micEnabled} />

          <div style={{ marginTop: 'auto' }}>
            <p style={{ margin: 0, fontSize: '0.78rem', color: '#9dc6ff', letterSpacing: '0.05em' }}>
              QUICK METRICS
            </p>
            <div style={{ marginTop: '0.55rem', display: 'grid', gridTemplateColumns: '1fr', gap: '0.5rem' }}>
              <div style={{ border: '1px solid rgba(125, 158, 255, 0.3)', borderRadius: '10px', padding: '0.55rem', background: 'rgba(14,36,76,0.45)' }}>
                <div style={{ fontSize: '0.66rem', color: '#9dc6ff' }}>Timer</div>
                <div style={{ fontSize: '0.95rem', color: '#e2edff', fontWeight: 700 }}>{answerTimeLabel}</div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <section
        style={{
          position: 'relative',
          zIndex: 1,
          flex: '0 0 240px',
          minHeight: 0,
          padding: '0.65rem 1.1rem 1.1rem',
          border: '1px solid rgba(125, 158, 255, 0.32)',
          borderRadius: '20px',
          background: 'linear-gradient(160deg, rgba(7, 22, 47, 0.95), rgba(3, 12, 27, 0.9))',
          color: '#eaf2ff',
          boxShadow: 'inset 0 0 22px rgba(59, 130, 246, 0.15), 0 10px 24px rgba(2, 6, 23, 0.35)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0.2rem 0.7rem 0.35rem',
            marginBottom: '0.7rem',
          }}
        >
          <strong style={{ fontSize: '0.9rem', textAlign: 'center' }}>Live Transcript</strong>
        </div>
        <div
          ref={transcriptBodyRef}
          className="transcript-scroll"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'scroll',
            paddingRight: '0.25rem',
          }}
        >
          <p style={{ marginTop: 0, lineHeight: 1.5, color: '#cfe3ff' }}>
            {state.liveTranscript || demoTranscript}
          </p>
        </div>
      </section>

    </div>
  );
}
