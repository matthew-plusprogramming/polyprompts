import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInterview } from '../context/InterviewContext';
import WaveformVisualizer from '../components/WaveformVisualizer';
import microphoneOnIcon from '../icons/microphoneOn.png';
import microphoneOffIcon from '../icons/microphoneOff.png';
import cameraOnIcon from '../icons/cameraOn.png';
import cameraOffIcon from '../icons/cameraOff.png';
import starlyIcon from '../icons/StarlyLogo.png';

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
        padding: '0.7rem 0.45rem',
        boxSizing: 'border-box',
        width: '100vw',
        maxWidth: 'none',
        margin: 0,
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '26px',
        border: '1px solid rgba(255, 255, 255, 0.14)',
        color: '#eef8ff',
        backgroundColor: '#050a14',
        background:
          'radial-gradient(circle at 12% -5%, rgba(255, 255, 255, 0.14), transparent 34%), radial-gradient(circle at 88% 8%, rgba(220, 220, 220, 0.12), transparent 32%), linear-gradient(145deg, rgba(8, 12, 18, 0.98), rgba(10, 10, 10, 0.96) 48%, rgba(14, 16, 20, 0.98)), repeating-linear-gradient(135deg, rgba(148, 163, 184, 0.04) 0px, rgba(148, 163, 184, 0.04) 1px, transparent 1px, transparent 15px)',
        boxShadow: '0 20px 80px rgba(2, 8, 22, 0.7), inset 0 0 45px rgba(255, 255, 255, 0.05)',
        fontFamily: "'Space Grotesk', 'Segoe UI', sans-serif",
      }}
    >
      <style>
        {`
          @import url('https://fonts.googleapis.com/css2?family=Unbounded:wght@500;700&display=swap');
          .transcript-scroll {
            scrollbar-width: thin;
            scrollbar-color: rgba(230, 230, 230, 0.9) rgba(20, 28, 40, 0.55);
          }
          .transcript-scroll::-webkit-scrollbar {
            width: 11px;
          }
          .transcript-scroll::-webkit-scrollbar-track {
            background: rgba(17, 24, 39, 0.75);
            border-radius: 999px;
          }
          .transcript-scroll::-webkit-scrollbar-thumb {
            background: linear-gradient(180deg, rgba(250, 250, 250, 0.95), rgba(214, 214, 214, 0.86) 55%, rgba(165, 165, 165, 0.82));
            border-radius: 999px;
            border: 2px solid rgba(10, 15, 26, 0.8);
          }
          .transcript-scroll::-webkit-scrollbar-thumb:hover {
            background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(228, 228, 228, 0.9) 50%, rgba(182, 182, 182, 0.9));
          }
          @keyframes floatBlobA {
            0%, 100% { transform: translateY(0px) rotate(0deg); }
            50% { transform: translateY(-14px) rotate(8deg); }
          }
          @keyframes floatBlobB {
            0%, 100% { transform: translateY(0px) rotate(0deg); }
            50% { transform: translateY(12px) rotate(-10deg); }
          }
        `}
      </style>

      <div
        style={{
          position: 'absolute',
          top: '-80px',
          right: '-90px',
          width: '280px',
          height: '280px',
          borderRadius: '34% 66% 61% 39% / 37% 43% 57% 63%',
          background: 'radial-gradient(circle, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0))',
          pointerEvents: 'none',
          filter: 'blur(1px)',
          animation: 'floatBlobA 7s ease-in-out infinite',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '-100px',
          left: '-80px',
          width: '300px',
          height: '300px',
          borderRadius: '56% 44% 30% 70% / 41% 52% 48% 59%',
          background: 'radial-gradient(circle, rgba(210, 210, 210, 0.2), rgba(210, 210, 210, 0))',
          pointerEvents: 'none',
          animation: 'floatBlobB 8s ease-in-out infinite',
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
          <img
            src={starlyIcon}
            alt="Starly"
            style={{
              height: '60px',
              width: 'auto',
              objectFit: 'contain',
              marginLeft: '0.25rem',
            }}
          />
        </div>

        <div
          style={{
            justifySelf: 'center',
            fontSize: '1.08rem',
            fontWeight: 700,
            color: '#041018',
            fontFamily: "'Unbounded', 'Space Grotesk', sans-serif",
            background: 'linear-gradient(135deg, #f3f3f3 5%, #dcdcdc 52%, #b8b8b8 100%)',
            border: '1px solid rgba(255, 255, 255, 0.45)',
            borderRadius: '14px',
            padding: '0.52rem 1rem',
            boxShadow: '0 0 24px rgba(255, 255, 255, 0.25), inset 0 -6px 14px rgba(0, 0, 0, 0.18)',
            letterSpacing: '0.08em',
          }}
        >
          {answerTimeLabel}
        </div>

        <div style={{ justifySelf: 'end', display: 'flex', gap: '0.6rem' }}>
          <button
            type="button"
            style={{
              padding: '0.55rem 0.95rem',
              borderRadius: '12px',
              border: '1px solid rgba(255, 255, 255, 0.28)',
              background: 'linear-gradient(145deg, rgba(8, 18, 34, 0.92), rgba(9, 20, 37, 0.8))',
              color: '#f1f1f1',
              fontSize: '0.9rem',
              letterSpacing: '0.06em',
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
              border: '1px solid rgba(255, 255, 255, 0.45)',
              background: 'linear-gradient(130deg, #ffffff, #dcdcdc 45%, #bdbdbd)',
              color: '#111111',
              fontSize: '0.9rem',
              fontWeight: 700,
              letterSpacing: '0.08em',
              boxShadow: '0 0 18px rgba(255, 255, 255, 0.22)',
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
            border: '1px solid rgba(255, 255, 255, 0.14)',
            borderRadius: '22px 10px 22px 10px',
            overflow: 'hidden',
            background: 'linear-gradient(165deg, rgba(10, 20, 37, 0.88), rgba(6, 12, 23, 0.95))',
            color: '#f7f7f7',
            position: 'relative',
            boxShadow: 'inset 0 0 26px rgba(255, 255, 255, 0.05), 0 10px 24px rgba(0, 0, 0, 0.35)',
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
                      border: '1px solid rgba(255, 255, 255, 0.22)',
                      background: 'rgba(255, 255, 255, 0.06)',
                      color: '#f2f2f2',
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
                border: micEnabled ? '1px solid rgba(255, 255, 255, 0.28)' : '1px solid rgba(190, 190, 190, 0.35)',
                background: micEnabled ? 'rgba(18, 18, 18, 0.9)' : 'rgba(42, 42, 42, 0.9)',
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
                border: cameraEnabled ? '1px solid rgba(255, 255, 255, 0.28)' : '1px solid rgba(190, 190, 190, 0.35)',
                background: cameraEnabled ? 'rgba(18, 18, 18, 0.9)' : 'rgba(42, 42, 42, 0.9)',
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
            border: '1px solid rgba(255, 255, 255, 0.14)',
            borderRadius: '10px 22px 10px 22px',
            background: 'linear-gradient(160deg, rgba(12, 22, 34, 0.95), rgba(8, 16, 27, 0.98))',
            color: '#f0f0f0',
            padding: '1.15rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.95rem',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            boxShadow: 'inset 0 0 26px rgba(255, 255, 255, 0.05), 0 10px 24px rgba(0, 0, 0, 0.35)',
          }}
        >
          <div style={{ width: 'calc(100% + 2.3rem)', marginLeft: '-1.15rem', marginRight: '-1.15rem' }}>
            <WaveformVisualizer height={285} micEnabled={micEnabled} />
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
          border: '1px solid rgba(255, 255, 255, 0.14)',
          borderRadius: '22px',
          background: 'linear-gradient(165deg, rgba(10, 19, 31, 0.94), rgba(6, 13, 23, 0.98))',
          color: '#ecfffb',
          boxShadow: 'inset 0 0 22px rgba(255, 255, 255, 0.05), 0 10px 24px rgba(0, 0, 0, 0.35)',
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
            padding: '0.18rem 0.7rem 0.35rem',
            marginBottom: '0.7rem',
          }}
        >
          <strong
            style={{
              fontFamily: "'Unbounded', 'Space Grotesk', sans-serif",
              fontSize: '0.85rem',
              textAlign: 'center',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: '#ececec',
            }}
          >
            Live Transcript
          </strong>
        </div>
        <div
          ref={transcriptBodyRef}
          className="transcript-scroll"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'scroll',
            paddingRight: '0.2rem',
          }}
        >
          <p style={{ marginTop: 0, lineHeight: 1.54, color: '#d7d7d7' }}>
            {state.liveTranscript || demoTranscript}
          </p>
        </div>
      </section>
    </div>
  );
}
