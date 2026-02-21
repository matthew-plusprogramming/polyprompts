import { useState, useEffect, useRef, useCallback, type DragEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInterview } from '../context/InterviewContext';
import { loadQuestions } from '../services/questionLoader';
import type { Difficulty, Role } from '../types';
import { createLogger } from '../utils/logger';

const log = createLogger('Setup');

/* ─────────────────────────────────────────────
   DATA
───────────────────────────────────────────── */
const ROLES = [
  { id: 'swe', label: 'SWE Intern', icon: '⌨️', color: '#22d3ee', desc: 'Systems · Algorithms · Scale' },
  { id: 'pm', label: 'PM Intern', icon: '🧭', color: '#f59e0b', desc: 'Strategy · Roadmaps · Trade-offs' },
  { id: 'ml', label: 'Data / ML Intern', icon: '🧠', color: '#a78bfa', desc: 'Models · Experiments · Insights' },
  { id: 'custom', label: 'Custom', icon: '✦', color: '#34d399', desc: 'Map to your own role' },
] as const;

type UiRole = (typeof ROLES)[number]['id'];

type Mode = 'generic' | 'resume';

const DIFFICULTIES = [
  { id: 'easy', label: 'Easy', glyph: '○', color: '#34d399', hint: 'Entry-level prompts, light context required' },
  { id: 'medium', label: 'Medium', glyph: '◑', color: '#f59e0b', hint: 'Moderate complexity, clear STAR needed' },
  { id: 'hard', label: 'Hard', glyph: '●', color: '#f87171', hint: 'Nuanced scenarios, strong structure wins' },
] as const;

const CATEGORIES = [
  { id: 'random', label: 'Random', icon: '🎲' },
  { id: 'teamwork', label: 'Teamwork', icon: '🤝' },
  { id: 'leadership', label: 'Leadership', icon: '🔥' },
  { id: 'conflict', label: 'Conflict', icon: '⚡' },
  { id: 'failure', label: 'Failure / Mistake', icon: '🌀' },
] as const;

const STAR_ITEMS = [
  { letter: 'S', word: 'Situation', color: '#22d3ee', desc: 'Set the scene — time, place, stakes. Keep it tight.' },
  { letter: 'T', word: 'Task', color: '#f59e0b', desc: 'Your specific responsibility. What was expected of YOU?' },
  { letter: 'A', word: 'Action', color: '#a78bfa', desc: 'First-person, concrete steps. What did YOU do?' },
  { letter: 'R', word: 'Result', color: '#34d399', desc: 'Measurable outcomes. Bonus: what did you learn?' },
] as const;

/* ─────────────────────────────────────────────
   PARTICLE FIELD
───────────────────────────────────────────── */
function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef<number | null>(null);
  const ptsRef = useRef<
    Array<{ x: number; y: number; vx: number; vy: number; size: number; opacity: number; color: string }>
  >([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resize();
    window.addEventListener('resize', resize);

    const colors = ['#22d3ee', '#a78bfa', '#34d399', '#f59e0b', '#6366f1'];
    ptsRef.current = Array.from({ length: 55 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      size: Math.random() * 1.4 + 0.3,
      opacity: Math.random() * 0.35 + 0.05,
      color: colors[Math.floor(Math.random() * colors.length)],
    }));

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const pts = ptsRef.current;

      for (let i = 0; i < pts.length; i += 1) {
        for (let j = i + 1; j < pts.length; j += 1) {
          const dx = pts[i].x - pts[j].x;
          const dy = pts[i].y - pts[j].y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 130) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(99,102,241,${0.055 * (1 - d / 130)})`;
            ctx.lineWidth = 0.5;
            ctx.moveTo(pts[i].x, pts[i].y);
            ctx.lineTo(pts[j].x, pts[j].y);
            ctx.stroke();
          }
        }
      }

      pts.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `${p.color}${Math.floor(p.opacity * 255)
          .toString(16)
          .padStart(2, '0')}`;
        ctx.fill();
      });

      animRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener('resize', resize);
      if (animRef.current !== null) cancelAnimationFrame(animRef.current);
    };
  }, []);

  return <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }} />;
}

/* ─────────────────────────────────────────────
   ROLE CARD
───────────────────────────────────────────── */
function RoleCard({ role, selected, onClick }: { role: (typeof ROLES)[number]; selected: boolean; onClick: () => void }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        position: 'relative',
        background: selected
          ? `linear-gradient(145deg,${role.color}1a,${role.color}08)`
          : hov
            ? 'rgba(255,255,255,0.03)'
            : 'rgba(255,255,255,0.015)',
        border: `1.5px solid ${selected ? `${role.color}55` : hov ? `${role.color}28` : '#1c1c2a'}`,
        borderRadius: '14px',
        padding: '18px 16px',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all 0.22s cubic-bezier(0.34,1.56,0.64,1)',
        transform: selected ? 'scale(1.04)' : hov ? 'scale(1.02)' : 'scale(1)',
        boxShadow: selected
          ? `0 0 0 1px ${role.color}20,0 8px 28px ${role.color}18,inset 0 1px 0 ${role.color}18`
          : hov
            ? '0 4px 18px rgba(0,0,0,0.35)'
            : 'none',
        overflow: 'hidden',
      }}
    >
      {selected && (
        <div
          style={{
            position: 'absolute',
            top: '8px',
            right: '10px',
            width: '52px',
            height: '52px',
            borderRadius: '50%',
            background: `radial-gradient(circle,${role.color}28,transparent 70%)`,
            pointerEvents: 'none',
          }}
        />
      )}
      <div style={{ fontSize: '20px', marginBottom: '8px' }}>{role.icon}</div>
      <div
        style={{
          fontFamily: "'Syne',sans-serif",
          fontSize: '13px',
          fontWeight: '700',
          color: selected ? role.color : '#d1d5db',
          marginBottom: '4px',
          transition: 'color 0.2s',
        }}
      >
        {role.label}
      </div>
      <div
        style={{
          fontFamily: "'DM Mono',monospace",
          fontSize: '10px',
          color: selected ? `${role.color}99` : '#4b5563',
          transition: 'color 0.2s',
          lineHeight: 1.4,
        }}
      >
        {role.desc}
      </div>
      {selected && (
        <div
          style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            width: '18px',
            height: '18px',
            background: role.color,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '10px',
            color: '#000',
            fontWeight: '800',
          }}
        >
          ✓
        </div>
      )}
    </button>
  );
}

/* ─────────────────────────────────────────────
   DIFFICULTY PILL
───────────────────────────────────────────── */
function DifficultyPill({
  diff,
  selected,
  onClick,
}: {
  diff: (typeof DIFFICULTIES)[number];
  selected: boolean;
  onClick: () => void;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        flex: 1,
        padding: '16px 10px',
        background: selected
          ? `linear-gradient(145deg,${diff.color}20,${diff.color}08)`
          : hov
            ? 'rgba(255,255,255,0.025)'
            : 'transparent',
        border: `1.5px solid ${selected ? `${diff.color}65` : hov ? `${diff.color}28` : '#1c1c2a'}`,
        borderRadius: '12px',
        cursor: 'pointer',
        transition: 'all 0.22s cubic-bezier(0.34,1.56,0.64,1)',
        transform: selected ? 'scale(1.05)' : hov ? 'scale(1.02)' : 'scale(1)',
        boxShadow: selected ? `0 4px 18px ${diff.color}22,inset 0 1px 0 ${diff.color}18` : 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '8px',
      }}
    >
      <span
        style={{
          fontSize: '20px',
          color: selected ? diff.color : hov ? `${diff.color}77` : '#374151',
          transition: 'color 0.2s,transform 0.2s',
          transform: selected ? 'scale(1.25)' : 'scale(1)',
          display: 'block',
        }}
      >
        {diff.glyph}
      </span>
      <span
        style={{
          fontFamily: "'Syne',sans-serif",
          fontSize: '13px',
          fontWeight: '700',
          color: selected ? diff.color : '#9ca3af',
          transition: 'color 0.2s',
        }}
      >
        {diff.label}
      </span>
    </button>
  );
}

/* ─────────────────────────────────────────────
   CATEGORY CHIP
───────────────────────────────────────────── */
function CategoryChip({ cat, selected, onClick }: { cat: (typeof CATEGORIES)[number]; selected: boolean; onClick: () => void }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: '9px 15px',
        background: selected
          ? 'rgba(99,102,241,0.18)'
          : hov
            ? 'rgba(99,102,241,0.07)'
            : 'rgba(255,255,255,0.02)',
        border: `1.5px solid ${selected ? '#6366f1' : hov ? '#6366f175' : '#1c1c2a'}`,
        borderRadius: '100px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '7px',
        transition: 'all 0.2s cubic-bezier(0.34,1.56,0.64,1)',
        transform: selected ? 'scale(1.06)' : hov ? 'scale(1.02)' : 'scale(1)',
        boxShadow: selected ? '0 0 0 1px #6366f135,0 4px 14px rgba(99,102,241,0.22)' : 'none',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ fontSize: '13px' }}>{cat.icon}</span>
      <span
        style={{
          fontFamily: "'DM Mono',monospace",
          fontSize: '11px',
          fontWeight: selected ? '600' : '400',
          color: selected ? '#a5b4fc' : hov ? '#818cf8' : '#6b7280',
          transition: 'color 0.18s',
        }}
      >
        {cat.label}
      </span>
    </button>
  );
}

/* ─────────────────────────────────────────────
   RESUME UPLOAD ZONE
───────────────────────────────────────────── */
interface ResumeData {
  name: string;
  skills: string[];
  experiences: string[];
  education: string;
}

function ResumeUpload({
  resumeFile,
  resumeData,
  onFileAccepted,
  onRemove,
}: {
  resumeFile: File | null;
  resumeData: ResumeData | null;
  onFileAccepted: (file: File, data: ResumeData) => void;
  onRemove: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanPct, setScanPct] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const scanRef = useRef<number | null>(null);

  const ACCEPTED = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
  ];

  useEffect(
    () => () => {
      if (scanRef.current !== null) window.clearInterval(scanRef.current);
    },
    []
  );

  const fakeExtract = (file: File) => {
    setScanning(true);
    setScanPct(0);
    setError(null);
    let pct = 0;

    scanRef.current = window.setInterval(() => {
      pct += Math.random() * 18 + 4;
      if (pct >= 100) {
        pct = 100;
        if (scanRef.current !== null) window.clearInterval(scanRef.current);

        setScanPct(100);
        setTimeout(() => {
          setScanning(false);
          onFileAccepted(file, {
            name: file.name.replace(/\.[^/.]+$/, ''),
            skills: ['React', 'Python', 'Node.js', 'SQL'].slice(0, 2 + Math.floor(Math.random() * 3)),
            experiences: ['Software Engineering Intern', 'Research Assistant', 'Hackathon Winner'].slice(
              0,
              1 + Math.floor(Math.random() * 2)
            ),
            education: 'Cal Poly SLO · CS',
          });
        }, 350);
      }
      setScanPct(Math.min(pct, 100));
    }, 90);
  };

  const accept = useCallback(
    (file: File) => {
      if (!ACCEPTED.includes(file.type) && !file.name.match(/\.(pdf|doc|docx|txt)$/i)) {
        setError('Please upload a PDF, DOCX, or TXT file.');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setError('File too large — max 5 MB.');
        return;
      }
      fakeExtract(file);
    },
    [onFileAccepted]
  );

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) accept(file);
  };

  const extIcon = (name: string | undefined) => {
    if (!name) return '📄';
    if (name.match(/\.pdf$/i)) return '📕';
    if (name.match(/\.docx?$/i)) return '📘';
    return '📄';
  };

  if (resumeFile && resumeData && !scanning) {
    return (
      <div
        style={{
          background: 'rgba(52,211,153,0.06)',
          border: '1.5px solid rgba(52,211,153,0.3)',
          borderRadius: '16px',
          padding: '20px',
          position: 'relative',
          animation: 'fadeUp 0.3s ease forwards',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: '10%',
            right: '10%',
            height: '1px',
            background: 'linear-gradient(90deg, transparent, #34d399, transparent)',
          }}
        />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                flexShrink: 0,
                background: 'rgba(52,211,153,0.12)',
                border: '1px solid rgba(52,211,153,0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px',
              }}
            >
              {extIcon(resumeFile.name)}
            </div>
            <div>
              <div
                style={{
                  fontFamily: "'Syne', sans-serif",
                  fontWeight: '700',
                  fontSize: '13px',
                  color: '#34d399',
                  marginBottom: '3px',
                }}
              >
                Resume loaded
              </div>
              <div
                style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: '11px',
                  color: '#6b7280',
                  maxWidth: '240px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {resumeFile.name}
              </div>
            </div>
          </div>

          <button
            onClick={onRemove}
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid #2a2a3a',
              borderRadius: '8px',
              color: '#6b7280',
              cursor: 'pointer',
              width: '30px',
              height: '30px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '14px',
              transition: 'all 0.15s',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(248,113,113,0.1)';
              e.currentTarget.style.color = '#f87171';
              e.currentTarget.style.borderColor = '#f8717150';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
              e.currentTarget.style.color = '#6b7280';
              e.currentTarget.style.borderColor = '#2a2a3a';
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid rgba(52,211,153,0.12)' }}>
          <div
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: '10px',
              color: '#34d39966',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              marginBottom: '10px',
            }}
          >
            Extracted highlights
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <HighlightRow icon="🎓" label="Education" value={resumeData.education} color="#22d3ee" />
            <HighlightRow icon="💼" label="Experience" value={resumeData.experiences.join(', ')} color="#f59e0b" />
            <HighlightRow icon="⚡" label="Skills" value={resumeData.skills.join(', ')} color="#a78bfa" />
          </div>

          <div
            style={{
              marginTop: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontFamily: "'DM Mono', monospace",
              fontSize: '10px',
              color: '#34d399aa',
            }}
          >
            <div
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: '#34d399',
                animation: 'pulse-ring 1.6s ease-out infinite',
              }}
            />
            Questions will be tailored to your background
          </div>
        </div>
      </div>
    );
  }

  if (scanning) {
    return (
      <div
        style={{
          background: 'rgba(99,102,241,0.06)',
          border: '1.5px solid rgba(99,102,241,0.2)',
          borderRadius: '16px',
          padding: '28px 24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px',
        }}
      >
        <div style={{ position: 'relative', width: '48px', height: '48px' }}>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              border: '2px solid rgba(99,102,241,0.15)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              border: '2px solid transparent',
              borderTopColor: '#818cf8',
              animation: 'spin 0.85s linear infinite',
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: '10px',
              borderRadius: '50%',
              border: '1.5px solid transparent',
              borderTopColor: '#22d3ee',
              animation: 'spin 1.3s linear infinite reverse',
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: "'DM Mono', monospace",
              fontSize: '10px',
              color: '#818cf8',
              fontWeight: '600',
            }}
          >
            {Math.floor(scanPct)}%
          </div>
        </div>

        <div>
          <div
            style={{
              fontFamily: "'Syne', sans-serif",
              fontWeight: '700',
              fontSize: '14px',
              color: '#d1d5db',
              textAlign: 'center',
              marginBottom: '4px',
            }}
          >
            Scanning your resume…
          </div>
          <div
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: '11px',
              color: '#4b5563',
              textAlign: 'center',
            }}
          >
            Extracting skills, experience, projects
          </div>
        </div>

        <div style={{ width: '100%', height: '3px', background: '#1c1c2a', borderRadius: '100px', overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              borderRadius: '100px',
              width: `${scanPct}%`,
              background: 'linear-gradient(90deg, #6366f1, #22d3ee)',
              transition: 'width 0.12s ease',
              boxShadow: '0 0 8px rgba(99,102,241,0.5)',
            }}
          />
        </div>

        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '5px', opacity: 0.25 }}>
          {[80, 60, 40, 70].map((w, i) => (
            <div
              key={w}
              style={{
                height: '3px',
                width: `${w}%`,
                background: '#4b5563',
                borderRadius: '2px',
                animation: 'shimmerBar 1.5s ease-in-out infinite',
                animationDelay: `${i * 0.18}s`,
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      style={{
        border: `2px dashed ${dragging ? '#6366f1' : '#1e1e2e'}`,
        borderRadius: '16px',
        padding: '32px 24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '12px',
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
        background: dragging ? 'rgba(99,102,241,0.07)' : 'rgba(255,255,255,0.01)',
        transition: 'all 0.22s cubic-bezier(0.34,1.56,0.64,1)',
        transform: dragging ? 'scale(1.01)' : 'scale(1)',
        boxShadow: dragging ? '0 0 0 1px #6366f130, 0 8px 32px rgba(99,102,241,0.15)' : 'none',
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.doc,.docx,.txt"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) accept(file);
        }}
      />

      <div
        style={{
          width: '52px',
          height: '52px',
          borderRadius: '14px',
          background: dragging ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)',
          border: `1px solid ${dragging ? '#6366f150' : '#1e1e2e'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '22px',
          transition: 'all 0.2s',
          transform: dragging ? 'translateY(-3px) scale(1.1)' : 'none',
        }}
      >
        {dragging ? '⬇️' : '📎'}
      </div>

      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            fontFamily: "'Syne', sans-serif",
            fontWeight: '700',
            fontSize: '14px',
            color: dragging ? '#818cf8' : '#9ca3af',
            marginBottom: '4px',
            transition: 'color 0.2s',
          }}
        >
          {dragging ? 'Drop it here!' : 'Drop your resume here'}
        </div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '11px', color: '#374151' }}>
          or <span style={{ color: '#6366f1', textDecoration: 'underline' }}>browse files</span> · PDF, DOCX, TXT · max 5 MB
        </div>
      </div>

      {error && (
        <div
          style={{
            background: 'rgba(248,113,113,0.08)',
            border: '1px solid rgba(248,113,113,0.2)',
            borderRadius: '8px',
            padding: '8px 14px',
            fontFamily: "'DM Mono', monospace",
            fontSize: '11px',
            color: '#f87171',
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

function HighlightRow({ icon, label, value, color }: { icon: string; label: string; value: string; color: string }) {
  return (
    <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
      <span style={{ fontSize: '12px', marginTop: '1px' }}>{icon}</span>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '11px', color: '#4b5563', minWidth: '70px' }}>{label}</div>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '11px', color: `${color}cc`, flex: 1, lineHeight: 1.4 }}>{value}</div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   MODE TOGGLE (Generic vs Resume)
───────────────────────────────────────────── */
function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (mode: Mode) => void }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: '0',
        background: '#0d0d16',
        border: '1px solid #1c1c2a',
        borderRadius: '10px',
        padding: '4px',
      }}
    >
      {[
        { id: 'generic', label: 'Generic Questions', icon: '📋' },
        { id: 'resume', label: 'From My Resume', icon: '✨' },
      ].map((opt) => (
        <button
          key={opt.id}
          onClick={() => onChange(opt.id as Mode)}
          style={{
            flex: 1,
            padding: '9px 14px',
            borderRadius: '7px',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '7px',
            fontFamily: "'DM Mono', monospace",
            fontSize: '12px',
            fontWeight: '600',
            transition: 'all 0.2s cubic-bezier(0.34,1.56,0.64,1)',
            background:
              mode === opt.id
                ? 'linear-gradient(135deg, rgba(99,102,241,0.25), rgba(34,211,238,0.1))'
                : 'transparent',
            color: mode === opt.id ? '#a5b4fc' : '#4b5563',
            boxShadow: mode === opt.id ? 'inset 0 1px 0 rgba(255,255,255,0.06)' : 'none',
            borderColor: mode === opt.id ? 'rgba(99,102,241,0.3)' : 'transparent',
            borderStyle: 'solid',
            borderWidth: '1px',
            transform: mode === opt.id ? 'scale(1.02)' : 'scale(1)',
          }}
        >
          <span>{opt.icon}</span>
          <span>{opt.label}</span>
        </button>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────
   STAR MODAL
───────────────────────────────────────────── */
function StarModal({ onClose }: { onClose: () => void }) {
  const [vis, setVis] = useState(false);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  useEffect(() => {
    requestAnimationFrame(() => setVis(true));
  }, []);
  const close = () => {
    setVis(false);
    setTimeout(onClose, 220);
  };

  return (
    <div
      onClick={close}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        background: `rgba(3,3,8,${vis ? 0.88 : 0})`,
        backdropFilter: `blur(${vis ? 14 : 0}px)`,
        transition: 'all 0.22s ease',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#0c0c13',
          border: '1px solid #222232',
          borderRadius: '22px',
          padding: '36px',
          maxWidth: '500px',
          width: '100%',
          transform: `translateY(${vis ? 0 : 28}px) scale(${vis ? 1 : 0.95})`,
          opacity: vis ? 1 : 0,
          transition: 'all 0.28s cubic-bezier(0.34,1.56,0.64,1)',
          boxShadow: '0 36px 90px rgba(0,0,0,0.75),0 0 0 1px rgba(99,102,241,0.08)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: '18%',
            right: '18%',
            height: '1px',
            background: 'linear-gradient(90deg,transparent,#6366f1,#22d3ee,transparent)',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px' }}>
          <div>
            <div
              style={{
                fontFamily: "'DM Mono',monospace",
                fontSize: '10px',
                color: '#6366f1',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                marginBottom: '6px',
              }}
            >
              Framework
            </div>
            <h2
              style={{
                margin: 0,
                fontFamily: "'Syne',sans-serif",
                fontSize: '24px',
                fontWeight: '800',
                color: '#f9fafb',
                letterSpacing: '-0.02em',
              }}
            >
              STAR Scoring
            </h2>
          </div>
          <button
            onClick={close}
            style={{
              background: '#191926',
              border: '1px solid #222232',
              borderRadius: '10px',
              color: '#6b7280',
              cursor: 'pointer',
              width: '36px',
              height: '36px',
              fontSize: '18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.15s,color 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#222232';
              e.currentTarget.style.color = '#d1d5db';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#191926';
              e.currentTarget.style.color = '#6b7280';
            }}
          >
            ×
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
          {STAR_ITEMS.map((item, i) => (
            <div
              key={item.letter}
              onMouseEnter={() => setActiveIdx(i)}
              onMouseLeave={() => setActiveIdx(null)}
              style={{
                display: 'flex',
                gap: '14px',
                alignItems: 'flex-start',
                padding: '14px 16px',
                background: activeIdx === i ? `${item.color}0e` : '#09090f',
                border: `1px solid ${activeIdx === i ? `${item.color}38` : '#181822'}`,
                borderRadius: '12px',
                cursor: 'default',
                transition: 'all 0.18s ease',
                transform: activeIdx === i ? 'translateX(5px)' : 'translateX(0)',
              }}
            >
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  flexShrink: 0,
                  background: `${item.color}18`,
                  border: `1px solid ${item.color}38`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: "'Syne',sans-serif",
                  fontWeight: '800',
                  fontSize: '16px',
                  color: item.color,
                }}
              >
                {item.letter}
              </div>
              <div>
                <div
                  style={{
                    fontFamily: "'Syne',sans-serif",
                    fontSize: '13px',
                    fontWeight: '700',
                    color: item.color,
                    marginBottom: '3px',
                  }}
                >
                  {item.word}
                </div>
                <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: '13px', color: '#6b7280', lineHeight: 1.5 }}>
                  {item.desc}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div
          style={{
            background: 'rgba(99,102,241,0.05)',
            border: '1px solid rgba(99,102,241,0.12)',
            borderRadius: '10px',
            padding: '12px 14px',
            fontFamily: "'DM Mono',monospace",
            fontSize: '11px',
            color: '#6366f170',
            lineHeight: 1.6,
          }}
        >
          ⚡ Difficulty changes <em style={{ color: '#818cf8' }}>question complexity only</em> — all answers are held to the same STAR standard.
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   SECTION LABEL
───────────────────────────────────────────── */
function SectionLabel({ step, children, optional }: { step: string; children: ReactNode; optional?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
      <div
        style={{
          width: '22px',
          height: '22px',
          background: 'rgba(99,102,241,0.12)',
          border: '1px solid rgba(99,102,241,0.25)',
          borderRadius: '6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: "'DM Mono',monospace",
          fontSize: '10px',
          fontWeight: '700',
          color: '#818cf8',
        }}
      >
        {step}
      </div>
      <span
        style={{
          fontFamily: "'DM Mono',monospace",
          fontSize: '11px',
          fontWeight: '600',
          color: '#4b5563',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
        }}
      >
        {children}
      </span>
      {optional && (
        <span style={{ fontFamily: "'DM Mono',monospace", fontSize: '10px', color: '#2d2d40', letterSpacing: '0.06em' }}>
          optional
        </span>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   MAIN
───────────────────────────────────────────── */
export default function SetupScreen() {
  const { dispatch } = useInterview();
  const navigate = useNavigate();

  const [role, setRole] = useState<UiRole | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]['id']>('random');
  const [mode, setMode] = useState<Mode>('generic');
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeData, setResumeData] = useState<ResumeData | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [diffHint, setDiffHint] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 60);
    return () => clearTimeout(t);
  }, []);

  const selectedRole = ROLES.find((r) => r.id === role);
  const selectedDiff = DIFFICULTIES.find((d) => d.id === difficulty);
  const canStart = Boolean(role) && (mode === 'generic' || (mode === 'resume' && resumeData));

  const toInterviewRole = (uiRole: UiRole): Role => {
    if (uiRole === 'pm') return 'pm_intern';
    return 'swe_intern';
  };

  const handleStart = async () => {
    if (!canStart || launching || !role) return;
    setLaunching(true);
    log.info('Interview starting', { role, difficulty, category, mode, hasResume: !!resumeData });

    const mappedRole = toInterviewRole(role);
    dispatch({ type: 'SET_ROLE', payload: mappedRole });
    dispatch({ type: 'SET_DIFFICULTY', payload: difficulty });

    try {
      const questions = await loadQuestions({
        role: mappedRole,
        difficulty,
        category: category === 'random' ? undefined : category,
        resumeData: mode === 'resume' && resumeData
          ? { skills: resumeData.skills, experience: resumeData.experiences, projects: [], education: resumeData.education }
          : null,
        count: 2,
      });

      log.info('Questions loaded', { count: questions.length, ids: questions.map(q => q.id) });
      if (questions.length > 0) {
        dispatch({ type: 'SET_QUESTIONS', payload: questions });
      } else {
        log.warn('No questions matched filters', { role: mappedRole, difficulty, category });
      }
      navigate('/interview');
    } catch (err) {
      console.error('[SetupScreen] Failed to load questions:', err);
      setLaunching(false);
    }
  };

  const stagger = (i: number) => ({
    opacity: mounted ? 1 : 0,
    transform: mounted ? 'translateY(0)' : 'translateY(22px)',
    transition: `opacity 0.5s ease ${i * 0.065}s, transform 0.55s cubic-bezier(0.34,1.56,0.64,1) ${i * 0.065}s`,
  });

  const handleFileAccepted = (file: File, data: ResumeData) => {
    setResumeFile(file);
    setResumeData(data);
  };

  const handleRemove = () => {
    setResumeFile(null);
    setResumeData(null);
  };

  const progressItems = [role, 'diff', 'cat', mode === 'resume' ? (resumeData ? 'done' : null) : 'skip'];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=DM+Sans:ital,wght@0,400;0,500;1,400&family=DM+Mono:ital,wght@0,400;0,500;0,600;1,400&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #05050a; }

        .start-btn { position:relative; overflow:hidden; transition:all 0.25s cubic-bezier(0.34,1.56,0.64,1); }
        .start-btn:not(:disabled):hover { transform:translateY(-2px) scale(1.015); }
        .start-btn:not(:disabled):active { transform:scale(0.98); }
        .start-btn:disabled { opacity:0.35; cursor:not-allowed; }

        .shimmer { position:absolute;top:0;left:-100%;width:55%;height:100%;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.12),transparent);animation:shimmer 2.8s ease-in-out infinite; }
        @keyframes shimmer { 0%{left:-100%} 60%,100%{left:150%} }

        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }

        @keyframes pulse-ring {
          0%   { transform:scale(1); opacity:0.7; }
          100% { transform:scale(1.7); opacity:0; }
        }

        @keyframes fadeUp {
          from { opacity:0; transform:translateY(6px); }
          to   { opacity:1; transform:translateY(0); }
        }

        @keyframes shimmerBar {
          0%,100% { opacity:0.2; }
          50%     { opacity:0.55; }
        }

        .how-link { background:none;border:none;cursor:pointer;font-family:'DM Mono',monospace;font-size:12px;color:#374151;text-decoration:underline;text-underline-offset:3px;padding:0;transition:color 0.15s; }
        .how-link:hover { color:#818cf8; }
      `}</style>

      <ParticleField />

      <div
        style={{
          position: 'fixed',
          top: '-8%',
          left: '55%',
          width: '520px',
          height: '520px',
          borderRadius: '50%',
          background: 'radial-gradient(circle,rgba(99,102,241,0.055) 0%,transparent 65%)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />
      <div
        style={{
          position: 'fixed',
          bottom: '-5%',
          left: '-8%',
          width: '420px',
          height: '420px',
          borderRadius: '50%',
          background: 'radial-gradient(circle,rgba(34,211,238,0.035) 0%,transparent 65%)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      <div
        style={{
          minHeight: '100vh',
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 20px',
          fontFamily: "'DM Sans',sans-serif",
        }}
      >
        <div style={{ width: '100%', maxWidth: '580px' }}>
          <div style={{ textAlign: 'center', marginBottom: '40px', ...stagger(0) }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '20px',
                padding: '6px 16px',
                background: 'rgba(34,211,238,0.055)',
                border: '1px solid rgba(34,211,238,0.14)',
                borderRadius: '100px',
              }}
            >
              <div style={{ position: 'relative', width: '8px', height: '8px' }}>
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: '50%',
                    background: '#22d3ee',
                    animation: 'pulse-ring 1.6s ease-out infinite',
                  }}
                />
                <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: '#22d3ee' }} />
              </div>
              <span
                style={{
                  fontFamily: "'DM Mono',monospace",
                  fontSize: '11px',
                  color: '#22d3ee',
                  letterSpacing: '0.1em',
                  fontWeight: '600',
                }}
              >
                AI-POWERED COACHING
              </span>
            </div>

            <h1
              style={{
                fontFamily: "'Syne',sans-serif",
                fontSize: 'clamp(32px,6vw,48px)',
                fontWeight: '800',
                letterSpacing: '-0.03em',
                lineHeight: 1.1,
                color: '#f9fafb',
                marginBottom: '14px',
              }}
            >
              Mock Behavioral
              <br />
              <span
                style={{
                  background: 'linear-gradient(130deg,#818cf8 0%,#22d3ee 55%,#34d399 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                Interview
              </span>
            </h1>

            <p style={{ fontSize: '16px', color: '#6b7280', lineHeight: 1.6, maxWidth: '380px', margin: '0 auto' }}>
              Speak your answer. Get <span style={{ color: '#a5b4fc' }}>STAR-based scoring</span> + coaching in seconds.
            </p>
          </div>

          <div
            style={{
              ...stagger(1),
              background: 'rgba(255,255,255,0.012)',
              border: '1px solid rgba(255,255,255,0.055)',
              borderRadius: '24px',
              padding: '32px',
              backdropFilter: 'blur(24px)',
              boxShadow: '0 40px 90px rgba(0,0,0,0.55),inset 0 1px 0 rgba(255,255,255,0.04)',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: '12%',
                right: '12%',
                height: '1px',
                background: 'linear-gradient(90deg,transparent,rgba(99,102,241,0.6),rgba(34,211,238,0.5),transparent)',
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
              <span
                style={{
                  fontFamily: "'DM Mono',monospace",
                  fontSize: '11px',
                  color: '#4b5563',
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                }}
              >
                Quick Start
              </span>
              <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                {progressItems.map((step, i) => (
                  <div
                    key={String(i)}
                    style={{
                      width: step ? '22px' : '6px',
                      height: '6px',
                      borderRadius: '3px',
                      background:
                        step === 'skip'
                          ? '#2d2d40'
                          : step
                            ? i === 0 && selectedRole
                              ? selectedRole.color
                              : i === 3
                                ? '#34d399'
                                : '#6366f1'
                            : '#1a1a28',
                      transition: 'all 0.3s cubic-bezier(0.34,1.56,0.64,1)',
                    }}
                  />
                ))}
              </div>
            </div>

            <div style={{ marginBottom: '28px', ...stagger(2) }}>
              <SectionLabel step="1">Your Role</SectionLabel>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                {ROLES.map((r) => (
                  <RoleCard key={r.id} role={r} selected={role === r.id} onClick={() => setRole(r.id)} />
                ))}
              </div>
            </div>

            <div style={{ marginBottom: '28px', ...stagger(3) }}>
              <SectionLabel step="2">Difficulty</SectionLabel>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                {DIFFICULTIES.map((d) => (
                  <DifficultyPill
                    key={d.id}
                    diff={d}
                    selected={difficulty === d.id}
                    onClick={() => {
                      setDifficulty(d.id);
                      setDiffHint(d.hint);
                    }}
                  />
                ))}
              </div>
              <div
                key={diffHint ?? 'default'}
                style={{
                  fontFamily: "'DM Mono',monospace",
                  fontSize: '11px',
                  color: '#4b5563',
                  fontStyle: 'italic',
                  paddingLeft: '2px',
                  minHeight: '16px',
                  animation: 'fadeUp 0.2s ease forwards',
                }}
              >
                {diffHint ?? selectedDiff?.hint}
              </div>
            </div>

            <div style={{ marginBottom: '28px', ...stagger(4) }}>
              <SectionLabel step="3">Question Type</SectionLabel>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {CATEGORIES.map((c) => (
                  <CategoryChip key={c.id} cat={c} selected={category === c.id} onClick={() => setCategory(c.id)} />
                ))}
              </div>
            </div>

            <div style={{ marginBottom: '28px', ...stagger(5) }}>
              <SectionLabel step="4" optional>
                Resume
              </SectionLabel>

              <div style={{ marginBottom: '16px' }}>
                <ModeToggle mode={mode} onChange={setMode} />
              </div>

              <div
                style={{
                  maxHeight: mode === 'resume' ? '600px' : '0px',
                  overflow: 'hidden',
                  transition: 'max-height 0.4s cubic-bezier(0.4,0,0.2,1)',
                }}
              >
                <div style={{ paddingTop: '2px', paddingBottom: '2px' }}>
                  <ResumeUpload
                    resumeFile={resumeFile}
                    resumeData={resumeData}
                    onFileAccepted={handleFileAccepted}
                    onRemove={handleRemove}
                  />

                  {mode === 'resume' && !resumeData && (
                    <div
                      style={{
                        marginTop: '10px',
                        fontFamily: "'DM Mono',monospace",
                        fontSize: '10px',
                        color: '#2d2d40',
                        textAlign: 'center',
                      }}
                    >
                      AI will craft questions around your specific projects & experience
                    </div>
                  )}
                </div>
              </div>

              {mode === 'generic' && (
                <div
                  style={{
                    fontFamily: "'DM Mono',monospace",
                    fontSize: '10px',
                    color: '#2d2d40',
                    paddingLeft: '2px',
                    animation: 'fadeUp 0.2s ease forwards',
                  }}
                >
                  Using standard behavioral questions for your role
                </div>
              )}
            </div>

            <div
              style={{
                height: '1px',
                background: 'linear-gradient(90deg,transparent,#1c1c2a 30%,#1c1c2a 70%,transparent)',
                marginBottom: '24px',
              }}
            />

            <div style={{ ...stagger(6) }}>
              <button
                className="start-btn"
                onClick={handleStart}
                disabled={!canStart}
                style={{
                  width: '100%',
                  padding: '17px',
                  borderRadius: '14px',
                  border: 'none',
                  cursor: canStart ? 'pointer' : 'not-allowed',
                  background: canStart
                    ? `linear-gradient(135deg,#4338ca,#6366f1 50%,${selectedRole ? `${selectedRole.color}cc` : '#818cf8'})`
                    : '#111120',
                  color: '#fff',
                  fontFamily: "'Syne',sans-serif",
                  fontSize: '15px',
                  fontWeight: '800',
                  letterSpacing: '0.02em',
                  boxShadow: canStart ? '0 6px 28px rgba(99,102,241,0.4),0 0 0 1px rgba(99,102,241,0.2)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                }}
              >
                {launching ? (
                  <>
                    <div
                      style={{
                        width: '17px',
                        height: '17px',
                        border: '2px solid rgba(255,255,255,0.25)',
                        borderTopColor: '#fff',
                        borderRadius: '50%',
                        animation: 'spin 0.65s linear infinite',
                      }}
                    />
                    <span>Preparing your question…</span>
                  </>
                ) : (
                  <>
                    {canStart && <div className="shimmer" />}
                    <span>
                      {!role
                        ? 'Select a role to begin'
                        : mode === 'resume' && !resumeData
                          ? 'Upload your resume to continue'
                          : 'Start Interview'}
                    </span>
                    {canStart && <span style={{ fontSize: '17px' }}>→</span>}
                  </>
                )}
              </button>

              <div style={{ textAlign: 'center', marginTop: '14px' }}>
                <button className="how-link" onClick={() => setShowModal(true)}>
                  How scoring works
                </button>
              </div>
            </div>
          </div>

          <div style={{ ...stagger(7), display: 'flex', justifyContent: 'center', gap: '32px', marginTop: '28px' }}>
            {[
              { val: 'STAR', label: 'framework' },
              { val: '< 30s', label: 'feedback' },
              { val: '20+', label: 'questions' },
            ].map(({ val, label }) => (
              <div key={label} style={{ textAlign: 'center' }}>
                <div
                  style={{
                    fontFamily: "'Syne',sans-serif",
                    fontSize: '15px',
                    fontWeight: '800',
                    color: '#d1d5db',
                    letterSpacing: '-0.01em',
                  }}
                >
                  {val}
                </div>
                <div
                  style={{
                    fontFamily: "'DM Mono',monospace",
                    fontSize: '10px',
                    color: '#2d2d40',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                  }}
                >
                  {label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showModal && <StarModal onClose={() => setShowModal(false)} />}
    </>
  );
}
