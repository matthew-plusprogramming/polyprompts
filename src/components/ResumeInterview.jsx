import { useState, useRef } from "react";

const STAGES = { UPLOAD: "upload", INTERVIEWING: "interviewing", DONE: "done" };

// ── Extract text from PDF using pdf.js CDN ────────────────────────────────────
async function extractPDFText(file) {
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js");
  const pdfjsLib = window.pdfjsLib;
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    fullText += content.items.map((item) => item.str).join(" ") + "\n";
  }
  return fullText.trim();
}

// ── Groq API ──────────────────────────────────────────────────────────────────
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

async function groq(systemPrompt, userPrompt) {
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1000,
      temperature: 0.7,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.choices[0].message.content;
}

async function generateQuestions(resumeText, jobDescription) {
  const system = `You are an expert technical interviewer. Respond ONLY with valid JSON, no markdown, no explanation.`;
  const user = `Here is the candidate's resume:
${resumeText}

Job description:
${jobDescription}

Generate exactly 2 interview questions specific to this candidate's actual experience and the job requirements. Mix behavioral and technical.

Respond ONLY with a JSON array:
[{"question": "...", "type": "behavioral|technical", "focus": "one short phrase"}]`;

  const text = await groq(system, user);
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

async function getAIFeedback(question, answer, resumeText, jobDescription) {
  const system = `You are an expert interview coach. Respond ONLY with valid JSON, no markdown, no explanation.`;
  const user = `Resume: ${resumeText.slice(0, 800)}

Job description: ${jobDescription.slice(0, 400)}

Interview question: "${question}"
Candidate's answer: "${answer}"

Respond ONLY as JSON:
{"score": 8, "feedback": "2-3 sentence evaluation", "tip": "one specific actionable improvement"}`;

  const text = await groq(system, user);
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement("script");
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

function ScoreBadge({ score }) {
  const color = score >= 8 ? "#4ade80" : score >= 6 ? "#fbbf24" : "#f87171";
  return (
    <span style={{
      fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, color,
      background: `${color}18`, border: `1px solid ${color}40`,
      borderRadius: 6, padding: "2px 10px",
    }}>{score}/10</span>
  );
}

export default function ResumeInterview() {
  const [stage, setStage] = useState(STAGES.UPLOAD);
  const [resumeText, setResumeText] = useState("");
  const [resumeName, setResumeName] = useState("");
  const [jobDesc, setJobDesc] = useState("");
  const [questions, setQuestions] = useState([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [feedbacks, setFeedbacks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [error, setError] = useState("");
  const fileRef = useRef();

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file || file.type !== "application/pdf") { setError("Please upload a PDF"); return; }
    setError("");
    setLoadingMsg("Reading PDF…");
    setLoading(true);
    try {
      const text = await extractPDFText(file);
      setResumeText(text);
      setResumeName(file.name);
    } catch {
      setError("Failed to read PDF. Make sure it's not a scanned image.");
    }
    setLoading(false);
    setLoadingMsg("");
  };

  const handleStart = async () => {
    if (!resumeText) { setError("Upload your resume first"); return; }
    if (!jobDesc.trim()) { setError("Enter a job description"); return; }
    setLoading(true); setLoadingMsg("Generating questions…"); setError("");
    try {
      const qs = await generateQuestions(resumeText, jobDesc);
      setQuestions(qs);
      setStage(STAGES.INTERVIEWING);
    } catch (e) {
      setError(`Failed to generate questions: ${e.message}`);
    }
    setLoading(false); setLoadingMsg("");
  };

  const handleSubmitAnswer = async () => {
    if (!currentAnswer.trim()) return;
    setLoading(true); setLoadingMsg("Getting feedback…");
    try {
      const fb = await getAIFeedback(questions[currentQ].question, currentAnswer, resumeText, jobDesc);
      const newAnswers = [...answers, currentAnswer];
      const newFeedbacks = [...feedbacks, fb];
      setAnswers(newAnswers);
      setFeedbacks(newFeedbacks);
      setCurrentAnswer("");
      if (currentQ + 1 >= questions.length) setStage(STAGES.DONE);
      else setCurrentQ(currentQ + 1);
    } catch {
      setError("Failed to get feedback.");
    }
    setLoading(false); setLoadingMsg("");
  };

  const restart = () => {
    setStage(STAGES.UPLOAD); setQuestions([]); setAnswers([]); setFeedbacks([]);
    setCurrentQ(0); setCurrentAnswer(""); setJobDesc("");
    setResumeText(""); setResumeName(""); setError("");
  };

  const avgScore = feedbacks.length
    ? Math.round(feedbacks.reduce((a, f) => a + (f.score || 0), 0) / feedbacks.length)
    : 0;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Unbounded:wght@700;900&family=Epilogue:wght@400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body, #root { min-height: 100vh; background: #08090f; }
        .ri-root { min-height: 100vh; background: #08090f; font-family: 'Epilogue', sans-serif; color: white; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; padding: 40px 20px 60px; }
        .ri-header { text-align: center; margin-bottom: 40px; }
        .ri-title { font-family: 'Unbounded', sans-serif; font-size: clamp(20px, 4vw, 34px); font-weight: 900; letter-spacing: -0.02em; background: linear-gradient(135deg, #fff 40%, #6366f1); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .ri-sub { margin-top: 8px; font-size: 13px; color: rgba(255,255,255,0.35); letter-spacing: 0.04em; }
        .ri-card { width: 100%; max-width: 620px; background: #0f1119; border: 1px solid rgba(255,255,255,0.07); border-radius: 18px; padding: 32px; box-shadow: 0 32px 80px rgba(0,0,0,0.5); }
        .upload-zone { border: 2px dashed rgba(99,102,241,0.3); border-radius: 12px; padding: 36px 24px; text-align: center; cursor: pointer; transition: all 0.2s; background: rgba(99,102,241,0.03); }
        .upload-zone:hover { border-color: rgba(99,102,241,0.6); background: rgba(99,102,241,0.07); }
        .upload-icon { font-size: 32px; margin-bottom: 10px; }
        .upload-text { font-size: 14px; color: rgba(255,255,255,0.5); }
        .upload-name { margin-top: 12px; font-family: 'DM Mono', monospace; font-size: 12px; color: #6366f1; background: rgba(99,102,241,0.1); border: 1px solid rgba(99,102,241,0.2); border-radius: 6px; padding: 4px 12px; display: inline-block; }
        label { display: block; font-size: 11px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(255,255,255,0.35); margin-bottom: 8px; margin-top: 20px; }
        textarea { width: 100%; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; color: white; font-family: 'Epilogue', sans-serif; font-size: 14px; padding: 12px 14px; outline: none; resize: vertical; transition: border-color 0.2s; }
        textarea:focus { border-color: rgba(99,102,241,0.5); }
        textarea::placeholder { color: rgba(255,255,255,0.2); }
        .btn-primary { width: 100%; margin-top: 20px; padding: 14px; background: #6366f1; border: none; border-radius: 10px; color: white; font-family: 'Unbounded', sans-serif; font-size: 13px; font-weight: 700; letter-spacing: 0.04em; cursor: pointer; transition: all 0.2s; }
        .btn-primary:hover:not(:disabled) { background: #818cf8; transform: translateY(-1px); }
        .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
        .progress-bar { height: 3px; background: rgba(255,255,255,0.07); border-radius: 3px; margin-bottom: 28px; overflow: hidden; }
        .progress-fill { height: 100%; background: linear-gradient(90deg, #6366f1, #a5b4fc); border-radius: 3px; transition: width 0.4s ease; }
        .q-meta { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
        .q-type { font-family: 'DM Mono', monospace; font-size: 10px; font-weight: 500; letter-spacing: 0.1em; text-transform: uppercase; padding: 3px 10px; border-radius: 20px; }
        .q-type.behavioral { background: rgba(251,191,36,0.1); color: #fbbf24; border: 1px solid rgba(251,191,36,0.2); }
        .q-type.technical { background: rgba(99,102,241,0.1); color: #818cf8; border: 1px solid rgba(99,102,241,0.2); }
        .q-focus { font-size: 11px; color: rgba(255,255,255,0.3); font-style: italic; }
        .q-text { font-size: 18px; font-weight: 600; line-height: 1.5; margin-bottom: 20px; color: rgba(255,255,255,0.92); }
        .q-counter { font-family: 'DM Mono', monospace; font-size: 11px; color: rgba(255,255,255,0.25); margin-bottom: 24px; }
        .feedback-box { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 10px; padding: 14px 16px; margin-top: 16px; font-size: 13px; color: rgba(255,255,255,0.7); line-height: 1.6; }
        .feedback-tip { margin-top: 8px; font-size: 12px; color: #a5b4fc; font-style: italic; }
        .done-score { text-align: center; margin-bottom: 28px; }
        .done-big { font-family: 'Unbounded', sans-serif; font-size: 56px; font-weight: 900; line-height: 1; }
        .done-label { font-size: 12px; color: rgba(255,255,255,0.3); letter-spacing: 0.1em; text-transform: uppercase; margin-top: 6px; }
        .review-item { border-bottom: 1px solid rgba(255,255,255,0.05); padding: 16px 0; }
        .review-item:last-child { border-bottom: none; }
        .review-q { font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.8); margin-bottom: 6px; }
        .review-a { font-size: 12px; color: rgba(255,255,255,0.4); margin-bottom: 8px; font-style: italic; }
        .error-msg { margin-top: 12px; font-size: 12px; color: #f87171; text-align: center; }
        .spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.2); border-top-color: white; border-radius: 50%; animation: spin 0.7s linear infinite; vertical-align: middle; margin-right: 8px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .btn-restart { width: 100%; margin-top: 20px; padding: 12px; background: transparent; border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; color: rgba(255,255,255,0.5); font-family: 'Epilogue', sans-serif; font-size: 13px; cursor: pointer; transition: all 0.2s; }
        .btn-restart:hover { border-color: rgba(255,255,255,0.25); color: white; }
      `}</style>

      <div className="ri-root">
        <div className="ri-header">
          <div className="ri-title">Resume Interview Coach</div>
          <div className="ri-sub">Upload your resume · Enter the job · Get grilled</div>
        </div>

        <div className="ri-card">

          {stage === STAGES.UPLOAD && (
            <>
              <div className="upload-zone" onClick={() => !loading && fileRef.current?.click()}>
                <div className="upload-icon">{loading && !resumeName ? "⏳" : "📄"}</div>
                <div className="upload-text">{loading && !resumeName ? "Reading PDF…" : "Click to upload your resume (PDF)"}</div>
                {resumeName && <div className="upload-name">✓ {resumeName}</div>}
                <input ref={fileRef} type="file" accept=".pdf" style={{ display: "none" }} onChange={handleFile} />
              </div>
              <label>Job Description</label>
              <textarea rows={5} placeholder="Paste the job posting here…" value={jobDesc} onChange={e => setJobDesc(e.target.value)} />
              {error && <div className="error-msg">{error}</div>}
              <button className="btn-primary" onClick={handleStart} disabled={loading}>
                {loading ? <><span className="spinner" />{loadingMsg}</> : "Start Interview →"}
              </button>
            </>
          )}

          {stage === STAGES.INTERVIEWING && questions.length > 0 && (
            <>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${(currentQ / questions.length) * 100}%` }} />
              </div>
              <div className="q-counter">Question {currentQ + 1} of {questions.length}</div>
              <div className="q-meta">
                <span className={`q-type ${questions[currentQ].type}`}>{questions[currentQ].type}</span>
                <span className="q-focus">{questions[currentQ].focus}</span>
              </div>
              <div className="q-text">{questions[currentQ].question}</div>
              <textarea rows={5} placeholder="Type your answer here…" value={currentAnswer} onChange={e => setCurrentAnswer(e.target.value)} />
              {error && <div className="error-msg">{error}</div>}
              <button className="btn-primary" onClick={handleSubmitAnswer} disabled={loading || !currentAnswer.trim()}>
                {loading ? <><span className="spinner" />{loadingMsg}</> : currentQ + 1 === questions.length ? "Finish →" : "Next Question →"}
              </button>
            </>
          )}

          {stage === STAGES.DONE && (
            <>
              <div className="done-score">
                <div className="done-big" style={{ color: avgScore >= 8 ? "#4ade80" : avgScore >= 6 ? "#fbbf24" : "#f87171" }}>
                  {avgScore}/10
                </div>
                <div className="done-label">Overall Score</div>
              </div>
              {questions.map((q, i) => (
                <div key={i} className="review-item">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 4 }}>
                    <div className="review-q">{q.question}</div>
                    {feedbacks[i] && <ScoreBadge score={feedbacks[i].score} />}
                  </div>
                  <div className="review-a">"{answers[i]}"</div>
                  {feedbacks[i] && (
                    <div className="feedback-box">
                      {feedbacks[i].feedback}
                      {feedbacks[i].tip && <div className="feedback-tip">💡 {feedbacks[i].tip}</div>}
                    </div>
                  )}
                </div>
              ))}
              <button className="btn-restart" onClick={restart}>Start Over</button>
            </>
          )}

        </div>
      </div>
    </>
  );
}
