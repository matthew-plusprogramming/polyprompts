import { useEffect, useRef, useState } from 'react';
import starlyLogo from '../Icons/StarlyLogo.png';

export default function InfoPage() {
  const [graphVisible, setGraphVisible] = useState(false);
  const [barsVisible, setBarsVisible] = useState(false);
  const [trailPhase, setTrailPhase] = useState<'hidden' | 'forward' | 'reverse' | 'done'>('hidden');
  const [peakLabelsVisible, setPeakLabelsVisible] = useState(false);
  const [peakNumbers, setPeakNumbers] = useState<number[]>([0, 0, 0]);
  const [headlineVisible, setHeadlineVisible] = useState(false);
  const [graphSequenceStarted, setGraphSequenceStarted] = useState(false);
  const graphSectionRef = useRef<HTMLElement | null>(null);
  const pageRef = useRef<HTMLElement | null>(null);
  const peakSpinRef = useRef<number | null>(null);

  const finalPercents = [4.5, 6.1, 7.5];
  const barHeights = [45, 61, 75];

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;

          if (entry.target === graphSectionRef.current) {
            setGraphSequenceStarted(true);
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.35 }
    );

    if (graphSectionRef.current) {
      observer.observe(graphSectionRef.current);
    }

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!graphSequenceStarted) return;

    setHeadlineVisible(true);

    const startGraphTimer = window.setTimeout(() => {
      setGraphVisible(true);
      setTrailPhase('forward');
    }, 900);

    const showPeakLabelsTimer = window.setTimeout(() => {
      setPeakLabelsVisible(true);
      let ticks = 0;
      peakSpinRef.current = window.setInterval(() => {
        ticks += 1;
        if (ticks < 20) {
          setPeakNumbers(finalPercents.map(() => Number((Math.random() * 9).toFixed(1))));
          return;
        }
        if (peakSpinRef.current !== null) {
          clearInterval(peakSpinRef.current);
          peakSpinRef.current = null;
        }
        setPeakNumbers(finalPercents);
      }, 45);
    }, 1500);

    const reverseTrailTimer = window.setTimeout(() => {
      setTrailPhase('reverse');
    }, 2800);

    const hideTrailTimer = window.setTimeout(() => {
      setTrailPhase('done');
    }, 3900);

    const startBarsTimer = window.setTimeout(() => {
      setBarsVisible(true);
    }, 4050);

    return () => {
      clearTimeout(startGraphTimer);
      clearTimeout(showPeakLabelsTimer);
      clearTimeout(reverseTrailTimer);
      clearTimeout(hideTrailTimer);
      clearTimeout(startBarsTimer);
      if (peakSpinRef.current !== null) {
        clearInterval(peakSpinRef.current);
        peakSpinRef.current = null;
      }
    };
  }, [graphSequenceStarted]);

  const scrollToGraph = () => {
    graphSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <main ref={pageRef} className="info-page snap-on">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Josefin+Sans:wght@400;500;600;700&display=swap');

        .info-page {
          height: 100vh;
          color: #f7f7f7;
          font-family: 'Josefin Sans', 'Segoe UI', sans-serif;
          background: black;
          position: relative;
          overflow-x: hidden;
          overflow-y: auto;
          isolation: isolate;
        }

        .info-page.snap-on {
          scroll-snap-type: y mandatory;
          scroll-behavior: smooth;
        }

        .info-page::before,
        .info-page::after {
          content: '';
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 0;
          background-image:
            radial-gradient(2.4px 2.4px at 18px 24px, rgba(255, 255, 255, 0.95), transparent 70%),
            radial-gradient(1.6px 1.6px at 62px 96px, rgba(255, 255, 255, 0.85), transparent 70%),
            radial-gradient(2px 2px at 120px 44px, rgba(255, 255, 255, 0.9), transparent 70%),
            radial-gradient(1.4px 1.4px at 176px 120px, rgba(255, 255, 255, 0.75), transparent 70%),
            radial-gradient(2.8px 2.8px at 216px 34px, rgba(255, 255, 255, 0.95), transparent 70%),
            radial-gradient(1.8px 1.8px at 260px 168px, rgba(255, 255, 255, 0.85), transparent 70%),
            radial-gradient(1.6px 1.6px at 310px 78px, rgba(255, 255, 255, 0.8), transparent 70%),
            radial-gradient(2.2px 2.2px at 356px 210px, rgba(255, 255, 255, 0.9), transparent 70%),
            radial-gradient(1.6px 1.6px at 402px 144px, rgba(255, 255, 255, 0.8), transparent 70%);
          background-size: 200px 150px;
          opacity: 0.95;
          filter: drop-shadow(0 0 6px rgba(255, 255, 255, 0.4));
          animation: starTwinkle 2s ease-in-out infinite;
        }

        .info-page::after {
          background-size: 280px 220px;
          opacity: 0;
          animation-duration: 6s;
          animation-delay: -2.5s;
        }

        @keyframes starTwinkle {
          0%, 100% { opacity: 0.45; }
          50% { opacity: 0.95; }
        }

        .content {
          position: relative;
          z-index: 1;
          width: min(1220px, 98vw);
          margin: 0 auto;
          padding: 0 0 96px;
        }

        .brand-logo {
          position: fixed;
          top: 16px;
          left: 18px;
          width: 156px;
          height: auto;
          object-fit: contain;
          z-index: 4;
          pointer-events: none;
        }

        .hero {
          min-height: 100vh;
          display: grid;
          place-items: start center;
          text-align: center;
          position: relative;
          padding: clamp(180px, 34vh, 340px) 0 32px;
          scroll-snap-align: start;
          scroll-snap-stop: always;
        }

        .hero-title {
          margin: 0;
          font-size: clamp(2rem, 7.8vw, 5.2rem);
          line-height: 0.98;
          font-weight: 700;
          color: #f7f7f7;
          text-wrap: balance;
        }

        .hero-sub {
          margin: 18px 0 0;
          font-size: clamp(0.95rem, 2.1vw, 1.3rem);
          line-height: 1.25;
          color: #d9d9d9;
          text-wrap: balance;
        }

        .hero-highlight {
          color: #cbff70;
        }

        .hero-copy {
          display: grid;
          justify-items: center;
        }

        .scroll-btn {
          margin-top: 18px;
          width: 52px;
          height: 52px;
          border: none;
          border-radius: 999px;
          background: #cbff70;
          color: #0d1012;
          font-size: 1.5rem;
          display: grid;
          place-items: center;
          cursor: pointer;
          box-shadow: 0 10px 30px rgba(203, 255, 112, 0.34);
        }

        .scroll-btn span {
          display: inline-grid;
          place-items: center;
          transform: rotate(90deg);
          line-height: 1;
        }

        .scroll-btn svg {
          width: 23px;
          height: 23px;
          display: block;
        }

        .graph-section {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          justify-content: center;
          text-align: center;
          padding: 36px 0 24px;
          scroll-snap-align: start;
          scroll-snap-stop: always;
        }

        .headline {
          margin: 0;
          min-height: 2.4em;
          font-size: clamp(1.8rem, 5vw, 3.2rem);
          line-height: 1.12;
          font-weight: 700;
          color: #f3f3f3;
          text-wrap: balance;
          opacity: 0;
          transform: translateY(-20px);
          transition: opacity 520ms ease, transform 520ms ease;
        }

        .headline.visible {
          opacity: 1;
          transform: translateY(0);
        }

        .highlight {
          color: #cbff70;
        }

        .chart-shell {
          margin: 24px auto 0;
          width: min(1160px, 99vw);
          padding: 20px 14px 12px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.03);
          opacity: 0;
          transform: translateY(14px);
          transition: opacity 500ms ease, transform 500ms ease;
        }

        .chart-shell.visible {
          opacity: 1;
          transform: translateY(0);
        }

        .chart-title {
          margin: 0 0 16px;
          text-align: center;
          color: rgba(245, 245, 245, 0.95);
          font-size: clamp(1.1rem, 2.6vw, 1.5rem);
          font-weight: 700;
          opacity: 0;
          transform: translateY(8px);
          transition: opacity 520ms ease, transform 520ms ease;
        }

        .chart-shell.visible .chart-title {
          opacity: 1;
          transform: translateY(0);
          transition-delay: 120ms;
        }

        .plot-area {
          position: relative;
          height: 560px;
          border-left: 1px solid rgba(255, 255, 255, 0.4);
          border-bottom: 1px solid rgba(255, 255, 255, 0.4);
          padding: 10px 0 0;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          align-items: flex-end;
          justify-items: center;
          gap: 0;
          overflow: hidden;
        }

        .constellation {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
          z-index: 2;
          overflow: visible;
          opacity: 0;
        }

        .constellation-path {
          fill: none;
          stroke: #ffffff;
          stroke-width: 0.45;
          stroke-linecap: round;
          stroke-linejoin: round;
          opacity: 0;
          filter: drop-shadow(0 0 10px rgba(255, 255, 255, 0.6));
          stroke-dasharray: 240;
          stroke-dashoffset: 240;
        }

        .constellation.forward,
        .constellation.reverse {
          opacity: 1;
        }

        .constellation.forward .constellation-path {
          opacity: 1;
          animation: drawConstellation 1800ms ease-out forwards;
        }

        .constellation.reverse .constellation-path {
          opacity: 1;
          animation: eraseConstellation 900ms ease-in forwards;
        }

        .constellation-head {
          filter: drop-shadow(0 0 10px rgba(255, 255, 255, 0.9));
          opacity: 0;
        }

        .constellation.forward .constellation-head {
          opacity: 1;
        }

        .constellation-head-dot {
          fill: #ffffff;
        }

        .constellation-head-star {
          stroke: #ffffff;
          stroke-width: 0.22;
          stroke-linecap: round;
          opacity: 0.95;
        }

        .peak-spark {
          position: absolute;
          width: 16px;
          height: 16px;
          border-radius: 999px;
          background: rgba(203, 255, 112, 0.95);
          box-shadow: 0 0 28px rgba(203, 255, 112, 0.98), 0 0 52px rgba(203, 255, 112, 0.62);
          opacity: 0;
          transform: translate(-50%, 50%) scale(0.7);
          z-index: 3;
          pointer-events: none;
        }

        .peak-spark.s1 { left: 16.67%; bottom: 45%; }
        .peak-spark.s2 { left: 50%; bottom: 61%; }
        .peak-spark.s3 { left: 83.33%; bottom: 75%; }

        .peak-spark.active.s1 { animation: sparkFlash 700ms ease-out 500ms forwards; }
        .peak-spark.active.s2 { animation: sparkFlash 700ms ease-out 960ms forwards; }
        .peak-spark.active.s3 { animation: sparkFlash 700ms ease-out 1320ms forwards; }

        .peak-number {
          position: absolute;
          transform: translate(-50%, 50%);
          color: #f4f4f4;
          font-size: clamp(1.2rem, 2.8vw, 1.9rem);
          font-weight: 700;
          opacity: 0;
          z-index: 3;
          text-shadow: 0 0 12px rgba(255, 255, 255, 0.18);
          transition: opacity 280ms ease, transform 280ms ease;
          pointer-events: none;
        }

        .peak-number.n1 { left: 16.67%; bottom: 51.5%; }
        .peak-number.n2 { left: 50%; bottom: 67.5%; }
        .peak-number.n3 { left: 83.33%; bottom: 81.5%; }

        .peak-number.visible {
          opacity: 1;
          transform: translate(-50%, 48%);
        }

        @keyframes drawConstellation {
          to {
            stroke-dashoffset: 0;
          }
        }

        @keyframes eraseConstellation {
          from {
            stroke-dashoffset: 0;
            opacity: 1;
          }
          to {
            stroke-dashoffset: -240;
            opacity: 0;
          }
        }

        @keyframes sparkFlash {
          0% { opacity: 0; transform: translate(-50%, 50%) scale(0.65); }
          20% { opacity: 1; transform: translate(-50%, 50%) scale(1.05); }
          55% { opacity: 0.55; transform: translate(-50%, 50%) scale(0.9); }
          100% { opacity: 0; transform: translate(-50%, 50%) scale(0.75); }
        }

        .chart-grid {
          display: grid;
          grid-template-columns: 52px 1fr;
          gap: 10px;
          align-items: stretch;
          position: relative;
        }

        .chart-main {
          display: grid;
          grid-template-rows: auto auto;
          align-items: start;
        }

        .y-percent {
          justify-self: end;
          align-self: end;
          margin: 0 6px 2px 0;
          font-size: 0.88rem;
          line-height: 1;
          color: rgba(240, 240, 240, 0.8);
          opacity: 0;
          transition: opacity 520ms ease;
          pointer-events: none;
        }

        .chart-shell.visible .y-percent {
          opacity: 1;
          transition-delay: 220ms;
        }

        .y-axis {
          height: 560px;
          display: grid;
          grid-template-rows: auto repeat(10, 1fr);
          align-items: end;
          justify-items: end;
          color: rgba(240, 240, 240, 0.8);
          font-size: 0.88rem;
          line-height: 1;
          padding-right: 6px;
        }

        .y-axis span {
          opacity: 0;
          transition: opacity 520ms ease;
        }

        .chart-shell.visible .y-axis span {
          opacity: 1;
          transition-delay: 220ms;
        }

        .gridline {
          position: absolute;
          left: 0;
          right: 0;
          height: 1px;
          background: rgba(255, 255, 255, 0.16);
          pointer-events: none;
          opacity: 0;
          transition: opacity 520ms ease;
        }

        .chart-shell.visible .gridline {
          opacity: 1;
          transition-delay: 260ms;
        }

        .bar-item {
          position: relative;
          width: min(100%, 56px);
          min-width: 36px;
          height: 100%;
          display: flex;
          align-items: flex-end;
          z-index: 1;
        }

        .bar-column {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: flex-end;
        }

        .bar-fill {
          width: 100%;
          border-radius: 8px 8px 0 0;
          transition: height 1800ms cubic-bezier(0.2, 1, 0.3, 1);
          box-shadow: 0 0 16px rgba(255, 255, 255, 0.2);
        }

        .x-label-row {
          margin-top: 10px;
          padding: 0;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          justify-items: center;
          align-items: start;
          gap: 0;
        }

        .x-label {
          margin: 0;
          width: 100%;
          max-width: none;
          display: block;
          color: #dfdfdf;
          font-size: 0.96rem;
          text-align: center;
          line-height: 1.1;
          opacity: 0;
          transform: translateY(8px);
          transition: opacity 520ms ease, transform 520ms ease;
        }

        .chart-shell.bars-active .x-label {
          opacity: 1;
          transform: translateY(0);
          transition-delay: 120ms;
        }

        .x-axis-title {
          margin: 10px 0 0;
          text-align: center;
          color: rgba(245, 245, 245, 0.86);
          font-size: 1.02rem;
          font-weight: 600;
          opacity: 0;
          transform: translateY(8px);
          transition: opacity 520ms ease, transform 520ms ease;
        }

        .chart-shell.visible .x-axis-title {
          opacity: 1;
          transform: translateY(0);
          transition-delay: 420ms;
        }

        @media (max-width: 760px) {
          .chart-grid {
            grid-template-columns: 42px 1fr;
          }

          .plot-area {
            height: 430px;
          }

          .y-axis {
            height: 430px;
          }

          .x-label {
            font-size: 0.84rem;
          }
        }
      `}</style>

      <div className="content">
        <img src={starlyLogo} alt="Starly" className="brand-logo" />
        <section className="hero">
          <div className="hero-copy">
            <h1 className="hero-title">
              You might only get <span className="hero-highlight">one shot.</span>
            </h1>
            <p className="hero-sub">The job market is competitive, especially in tech.</p>
            <button type="button" className="scroll-btn" onClick={scrollToGraph} aria-label="Scroll to graph">
              <span aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <path
                    d="M5 3 L19 12 L5 21 Z"
                    stroke="#1b1d20"
                    strokeWidth="1.7"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </button>
          </div>
        </section>

        <section className="graph-section" ref={graphSectionRef}>
          <h2 className={`headline${headlineVisible ? ' visible' : ''}`}>
            CS Majors face some of the <span className="highlight">highest unemployment rates</span> among all majors.
          </h2>

          <div className={`chart-shell${graphVisible ? ' visible' : ''}${barsVisible ? ' bars-active' : ''}`} aria-label="Unemployment rates for majors">
            <h3 className="chart-title">Unemployment Rate by Major (%)</h3>
            <div className="chart-grid">
              <div className="y-axis">
                <span className="y-percent">%</span>
                <span>10</span>
                <span>9</span>
                <span>8</span>
                <span>7</span>
                <span>6</span>
                <span>5</span>
                <span>4</span>
                <span>3</span>
                <span>2</span>
                <span>1</span>
              </div>
              <div className="chart-main">
                <div className="plot-area">
                  {Array.from({ length: 10 }).map((_, idx) => (
                    <div
                      key={`grid-${idx}`}
                      className="gridline"
                      style={{ bottom: `${(idx + 1) * 10}%` }}
                    />
                  ))}
                  <article className="bar-item">
                    <div className="bar-column">
                      <div
                        className="bar-fill"
                        style={{
                          height: barsVisible ? `${barHeights[0]}%` : '0%',
                          background: '#cfcfcf',
                        }}
                      />
                    </div>
                  </article>
                  <article className="bar-item">
                    <div className="bar-column">
                      <div
                        className="bar-fill"
                        style={{
                          height: barsVisible ? `${barHeights[1]}%` : '0%',
                          background: '#cbff70',
                        }}
                      />
                    </div>
                  </article>
                  <article className="bar-item">
                    <div className="bar-column">
                      <div
                        className="bar-fill"
                        style={{
                          height: barsVisible ? `${barHeights[2]}%` : '0%',
                          background: '#cbff70',
                        }}
                      />
                    </div>
                  </article>
                  <svg
                    className={`constellation ${trailPhase}`}
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                  >
                    <path
                      id="constellation-route"
                      className="constellation-path"
                      d="M 1 99 L 16.67 55 L 24 61 L 50 39 L 58 45 L 83.33 25 L 90 31 L 108 9"
                    />
                    {trailPhase === 'forward' && (
                      <g className="constellation-head">
                        <circle className="constellation-head-dot" r="0.9" cx="1" cy="99" />
                        <path className="constellation-head-star" d="M 1 97.9 L 1 100.1 M -0.1 99 L 2.1 99 M 0.25 98.25 L 1.75 99.75 M 1.75 98.25 L 0.25 99.75" />
                        <animateMotion dur="1800ms" fill="freeze" path="M 1 99 L 16.67 55 L 24 61 L 50 39 L 58 45 L 83.33 25 L 90 31 L 108 9" />
                      </g>
                    )}
                  </svg>
                  <span className={`peak-spark s1${trailPhase === 'forward' ? ' active' : ''}`} aria-hidden="true" />
                  <span className={`peak-spark s2${trailPhase === 'forward' ? ' active' : ''}`} aria-hidden="true" />
                  <span className={`peak-spark s3${trailPhase === 'forward' ? ' active' : ''}`} aria-hidden="true" />
                  <span className={`peak-number n1${peakLabelsVisible ? ' visible' : ''}`}>{peakNumbers[0].toFixed(1)}%</span>
                  <span className={`peak-number n2${peakLabelsVisible ? ' visible' : ''}`}>{peakNumbers[1].toFixed(1)}%</span>
                  <span className={`peak-number n3${peakLabelsVisible ? ' visible' : ''}`}>{peakNumbers[2].toFixed(1)}%</span>
                </div>
                <div className="x-label-row">
                  <p className="x-label">Recent Graduate Average</p>
                  <p className="x-label">Computer Science</p>
                  <p className="x-label">Computer Engineering</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
