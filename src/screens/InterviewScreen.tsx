import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import WaveformVisualizer from '../components/WaveformVisualizer';
import { useInterview } from '../context/InterviewContext';
import microphoneOnIcon from '../icons/microphoneOn.png';
import microphoneOffIcon from '../icons/microphoneOff.png';
import cameraOnIcon from '../icons/cameraOn.png';
import cameraOffIcon from '../icons/cameraOff.png';

export default function InterviewScreen() {
  const { state } = useInterview();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraStatus, setCameraStatus] = useState<'loading' | 'ready' | 'unsupported' | 'error'>('loading');
  const [cameraError, setCameraError] = useState('');
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [micEnabled, setMicEnabled] = useState(true);
  const [currentTime, setCurrentTime] = useState(() =>
    new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  );

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
    if (cameraEnabled && !streamRef.current && cameraStatus !== 'loading') {
      void requestCamera();
    }
  }, [cameraEnabled, cameraStatus, requestCamera]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div style={{ padding: '0.9rem', width: '100%', maxWidth: '1480px', margin: '0 auto' }}>
      <header
        style={{
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
              width: '150px',
              height: '42px',
              border: '1px dashed #4b5563',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#9ca3af',
              fontSize: '0.8rem',
              fontWeight: 600,
              background: '#0f172a',
            }}
          >
            LOGO
          </div>
        </div>

        <div
          style={{
            justifySelf: 'center',
            fontSize: '1.05rem',
            fontWeight: 700,
            color: '#e5e7eb',
            background: '#111827',
            border: '1px solid #334155',
            borderRadius: '10px',
            padding: '0.45rem 0.85rem',
          }}
        >
          {currentTime}
        </div>

        <div style={{ justifySelf: 'end', display: 'flex', gap: '0.6rem' }}>
          <button
            type="button"
            style={{
              padding: '0.55rem 0.95rem',
              borderRadius: '10px',
              border: '1px solid #475569',
              background: '#0f172a',
              color: '#e2e8f0',
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
              borderRadius: '10px',
              border: '1px solid #7f1d1d',
              background: '#991b1b',
              color: '#fff',
              fontSize: '0.9rem',
              fontWeight: 700,
            }}
          >
            End
          </button>
        </div>
      </header>

      <div
        style={{
          padding: '1rem',
          background: '#0f172a',
          borderRadius: '10px',
          border: '1px solid #334155',
          color: '#e2e8f0',
          marginBottom: '1rem',
        }}
      >
        <strong>Question:</strong>{' '}
        {state.currentQuestion?.text ?? 'No question loaded - go back to Setup.'}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '0.75rem',
          marginBottom: '1rem',
        }}
      >
        <section
          style={{
            minHeight: '460px',
            border: '1px solid #334155',
            borderRadius: '12px',
            overflow: 'hidden',
            background: '#020617',
            color: '#fff',
            position: 'relative',
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
              minHeight: '460px',
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
                      border: '1px solid #334155',
                      background: '#0f172a',
                      color: '#e2e8f0',
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
                border: micEnabled ? '1px solid #334155' : '1px solid #475569',
                background: micEnabled ? 'rgba(15,23,42,0.82)' : 'rgba(30,41,59,0.9)',
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
              onClick={() => setCameraEnabled((prev) => !prev)}
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '999px',
                border: cameraEnabled ? '1px solid #334155' : '1px solid #475569',
                background: cameraEnabled ? 'rgba(15,23,42,0.82)' : 'rgba(30,41,59,0.9)',
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
            minHeight: '460px',
            border: '1px solid #334155',
            borderRadius: '12px',
            background: '#0f1626',
            color: '#dbeafe',
            padding: '1.15rem',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <strong>Voice Waveform</strong>
          <p style={{ marginTop: '0.4rem', marginBottom: '0.85rem', fontSize: '0.85rem', color: '#93c5fd' }}>
            Center line with live spikes as you speak.
          </p>
          <WaveformVisualizer
            height={360}
            micEnabled={micEnabled}
            requestMic={cameraStatus !== 'loading'}
          />
        </section>
      </div>

      <section
        style={{
          minHeight: '220px',
          padding: '1.1rem',
          border: '1px solid #334155',
          borderRadius: '12px',
          background: '#f8fafc',
          marginBottom: '1rem',
        }}
      >
        <strong>Live Transcript</strong>
        <p style={{ marginTop: '0.75rem', lineHeight: 1.5 }}>
          {state.liveTranscript || 'Transcript will appear here as you speak...'}
        </p>
      </section>

      <details style={{ margin: '1rem 0' }}>
        <summary>Coaching Metrics</summary>
        <p>
          Filler words: {state.fillerCount} | WPM: {state.wordsPerMinute} | Duration:{' '}
          {state.speakingDurationSeconds}s
        </p>
      </details>
    </div>
  );
}
