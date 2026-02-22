import { useNavigate } from 'react-router-dom';
import starlyIcon from '../Icons/StarlyLogo.png';
import homePageBg from '../Icons/HomePage.png';

export default function HomeScreen() {
  const navigate = useNavigate();

  return (
    <div
      style={{
        height: '100dvh',
        minHeight: '100dvh',
        color: '#f5f7ff',
        backgroundImage: `linear-gradient(180deg, rgba(0, 0, 0, 0.96) 0%, rgba(0, 0, 0, 0.86) 30%, rgba(0, 0, 0, 0.52) 52%, rgba(0, 0, 0, 0.16) 70%, rgba(0, 0, 0, 0) 82%), url(${homePageBg})`,
        backgroundColor: '#04050b',
        backgroundSize: '100% 100%, 100% auto',
        backgroundPosition: 'center top, center calc(100% + 15vh + 15px)',
        backgroundRepeat: 'no-repeat',
        overflow: 'hidden',
        position: 'relative',
        fontFamily: "'Josefin Sans', sans-serif",
      }}
    >
      <style>{`
        @keyframes floatGlow {
          0%, 100% { transform: translateY(0px) scale(1); opacity: 0.55; }
          50% { transform: translateY(-10px) scale(1.03); opacity: 0.78; }
        }
        @keyframes drift {
          0%, 100% { transform: translateX(0px); }
          50% { transform: translateX(16px); }
        }
      `}</style>

      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: 'rgba(4, 7, 18, 0.22)',
          animation: 'floatGlow 8s ease-in-out infinite',
        }}
      />

      <img
        src={starlyIcon}
        alt="Starly"
        style={{
          position: 'absolute',
          top: '16px',
          left: '18px',
          width: '156px',
          height: 'auto',
          objectFit: 'contain',
          zIndex: 3,
        }}
      />

      <button
        type="button"
        onClick={() => navigate('/info')}
        aria-label="Learn more"
        style={{
          position: 'absolute',
          top: '22px',
          right: '20px',
          zIndex: 3,
          background: 'none',
          border: '1.5px solid rgba(255,255,255,0.25)',
          borderRadius: '50%',
          width: '32px',
          height: '32px',
          color: 'rgba(255,255,255,0.7)',
          cursor: 'pointer',
          fontSize: '16px',
          fontWeight: 700,
          fontFamily: "'Josefin Sans', serif",
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        i
      </button>

      <div
        style={{
          maxWidth: '1120px',
          margin: '0 auto',
          padding: '42px 20px 28px',
          position: 'relative',
          zIndex: 2,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-start',
        }}
      >

        <section
          style={{
            textAlign: 'center',
            marginTop: '100px',
            flex: '0 0 auto',
            width: 'min(760px, 82vw)',
            marginLeft: 'auto',
            marginRight: 'auto',
          }}
        >
          <h1
            style={{
              margin: 0,
              fontFamily: "'Josefin Sans', sans-serif",
              fontSize: 'clamp(1.45rem, 2.9vw, 2.45rem)',
              lineHeight: 1.22,
              letterSpacing: '0.035em',
              color: '#f3f6ff',
              fontWeight: 700,
            }}
          >
            Introducing <span style={{ color: '#c9f36b' }}>STARLY</span>, the
            <br />
            Live AI Mock Interviewer
          </h1>
          <p
            style={{
              margin: '18px auto 0',
              maxWidth: '640px',
              fontSize: 'clamp(0.82rem, 1.05vw, 1.15rem)',
              fontWeight: 600,
              lineHeight: 1.34,
              letterSpacing: '0.02em',
              color: 'rgba(245, 250, 255, 0.92)',
              fontFamily: "'Josefin Sans', sans-serif",
            }}
          >
            Sharpen your Interview Performance
            <br />
            <span style={{ display: 'inline-block', paddingLeft: '0.7em' }}>with Real-Time Feedback</span>
          </p>

          <button
            type="button"
            onClick={() => navigate('/job-description')}
            style={{
              marginTop: '22px',
              border: 'none',
              borderRadius: '14px',
              background: '#c9f36b',
              color: '#101317',
              fontWeight: 700,
              fontSize: '0.9rem',
              padding: '0.72rem 1.5rem',
              letterSpacing: '0.02em',
              boxShadow: '0 10px 30px rgba(174, 243, 86, 0.32)',
            }}
          >
            Start Interview
          </button>
        </section>
      </div>
    </div>
  );
}
