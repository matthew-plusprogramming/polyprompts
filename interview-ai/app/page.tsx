"use client";

import { useState, useRef, useCallback } from "react";

type Phase = "setup" | "interview" | "review";

interface Clip {
  question: string;
  questionIndex: number;
  blobUrl: string;
  duration: number;
}

const QUESTIONS = [
  "Tell me about yourself and your background.",
  "What's a challenging problem you've solved and how did you approach it?",
];

const DONE_PHRASES = [
  "i'm done",
  "im done",
  "i am done",
  "yeah i'm done",
  "yeah im done",
  "i'm done answering",
  "im done answering",
  "yeah i'm done answering",
  "yeah im done answering",
  "yes i'm done",
  "yes im done",
];

export default function Home() {
  const [phase, setPhase] = useState<Phase>("setup");
  const [currentQ, setCurrentQ] = useState(0);
  const [clips, setClips] = useState<Clip[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [statusText, setStatusText] = useState("Listening...");
  const [transcript, setTranscript] = useState("");
  const [countdown, setCountdown] = useState<number | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<any>(null);
  const clipsRef = useRef<Clip[]>([]);
  const recordingStartRef = useRef<number>(0);

  const stopRecordingAndSave = useCallback((questionText: string, qIndex: number): Promise<void> => {
    return new Promise((resolve) => {
      const mr = mediaRecorderRef.current;
      if (!mr || mr.state === "inactive") { resolve(); return; }
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        const blobUrl = URL.createObjectURL(blob);
        const duration = (Date.now() - recordingStartRef.current) / 1000;
        const clip: Clip = { question: questionText, questionIndex: qIndex, blobUrl, duration };
        const updated = [...clipsRef.current, clip];
        clipsRef.current = updated;
        setClips(updated);
        chunksRef.current = [];
        resolve();
      };
      mr.stop();
    });
  }, []);

  const startRecordingChunk = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    chunksRef.current = [];
    const mr = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp8,opus" });
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    mr.start(100);
    mediaRecorderRef.current = mr;
    recordingStartRef.current = Date.now();
    setIsRecording(true);
  }, []);

  const startSpeechRecognition = useCallback((questionText: string, qIndex: number) => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setStatusText("Speech recognition not supported. Use Chrome."); return; }
    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognitionRef.current = recognition;

    let finalTranscript = "";
    let triggered = false;

    recognition.onresult = (event: any) => {
      if (triggered) return;
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript.toLowerCase().trim();
        if (event.results[i].isFinal) finalTranscript += t + " ";
        else interim = t;
      }
      setTranscript(finalTranscript + interim);
      const combined = (finalTranscript + interim).toLowerCase();
      if (DONE_PHRASES.some(p => combined.includes(p))) {
        triggered = true;
        recognition.stop();
        setStatusText("Saving clip...");
        stopRecordingAndSave(questionText, qIndex).then(() => {
          const nextIndex = qIndex + 1;
          if (nextIndex < QUESTIONS.length) {
            setCountdown(3);
            let c = 3;
            const iv = setInterval(() => {
              c--;
              setCountdown(c);
              if (c === 0) {
                clearInterval(iv);
                setCountdown(null);
                setCurrentQ(nextIndex);
                setTranscript("");
                setStatusText("Listening...");
                startRecordingChunk();
                startSpeechRecognition(QUESTIONS[nextIndex], nextIndex);
              }
            }, 1000);
          } else {
            setIsRecording(false);
            streamRef.current?.getTracks().forEach(t => t.stop());
            setPhase("review");
          }
        });
      }
    };
    recognition.onerror = (e: any) => { if (e.error !== "aborted") setStatusText(`Mic error: ${e.error}`); };
    recognition.start();
  }, [stopRecordingAndSave, startRecordingChunk]);

  const startInterview = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.muted = true; }
      setPhase("interview");
      setCurrentQ(0);
      setClips([]);
      clipsRef.current = [];
      setTimeout(() => {
        startRecordingChunk();
        startSpeechRecognition(QUESTIONS[0], 0);
      }, 1000);
    } catch (err) {
      alert("Camera/mic access denied. Please allow access and try again.");
    }
  };

  const handleDone = async () => {
    recognitionRef.current?.stop();
    setStatusText("Saving clip...");
    await stopRecordingAndSave(QUESTIONS[currentQ], currentQ);
    const nextIndex = currentQ + 1;
    if (nextIndex < QUESTIONS.length) {
      setCountdown(3);
      let c = 3;
      const iv = setInterval(() => {
        c--;
        setCountdown(c);
        if (c === 0) {
          clearInterval(iv);
          setCountdown(null);
          setCurrentQ(nextIndex);
          setTranscript("");
          setStatusText("Listening...");
          startRecordingChunk();
          startSpeechRecognition(QUESTIONS[nextIndex], nextIndex);
        }
      }, 1000);
    } else {
      setIsRecording(false);
      streamRef.current?.getTracks().forEach(t => t.stop());
      setPhase("review");
    }
  };

  const restart = () => {
    setPhase("setup");
    setCurrentQ(0);
    setClips([]);
    clipsRef.current = [];
    setTranscript("");
    setIsRecording(false);
    setStatusText("Listening...");
  };

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Bebas+Neue&display=swap');
        :root { --accent: #e8ff47; --accent2: #ff6b35; }
        .glow { text-shadow: 0 0 40px rgba(232,255,71,0.4); }
        .card { background:#111; border:1px solid #222; border-radius:16px; }
        .btn-p { background:var(--accent); color:#0a0a0a; font-weight:600; font-size:15px; padding:14px 32px; border-radius:10px; border:none; cursor:pointer; transition:all 0.2s; width:100%; }
        .btn-p:hover { background:#d4eb30; }
        .btn-g { background:transparent; color:#666; font-size:14px; padding:10px 20px; border-radius:8px; border:1px solid #333; cursor:pointer; transition:all 0.2s; width:100%; }
        .btn-g:hover { border-color:#555; color:#999; }
        .rec-ring { animation: pulse 1.5s ease-in-out infinite; }
        @keyframes pulse { 0%,100% { box-shadow:0 0 0 0 rgba(255,107,53,0.4); } 50% { box-shadow:0 0 0 12px rgba(255,107,53,0); } }
        .fadein { animation: fi 0.4s ease-out; }
        @keyframes fi { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        .cpop { animation: cp 0.3s cubic-bezier(0.34,1.56,0.64,1); }
        @keyframes cp { from { transform:scale(0.5); opacity:0; } to { transform:scale(1); opacity:1; } }
      `}</style>

      {/* SETUP */}
      {phase === "setup" && (
        <div className="flex flex-col items-center justify-center min-h-screen px-6 fadein">
          <div className="w-full max-w-md text-center">
            <div className="inline-flex items-center gap-2 bg-[#111] border border-[#222] rounded-full px-4 py-2 mb-6 text-xs text-[#666] tracking-widest uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-[#e8ff47] inline-block" />
              Interview Practice
            </div>
            <h1 className="glow text-7xl tracking-wide mb-4" style={{ fontFamily:"'Bebas Neue'", color:"var(--accent)" }}>PREP</h1>
            <p className="text-[#555] text-sm mb-2">2 questions. Answer out loud.</p>
            <p className="text-[#444] text-sm mb-10">Say <span className="text-[#777]">"yeah I'm done answering"</span> to clip &amp; move on.</p>

            <div className="card p-5 mb-6 text-left space-y-3">
              {QUESTIONS.map((q, i) => (
                <div key={i} className="flex gap-3 items-start">
                  <div className="w-6 h-6 rounded-md flex-shrink-0 flex items-center justify-center text-xs font-bold mt-0.5"
                    style={{ background:"rgba(232,255,71,0.1)", color:"var(--accent)", border:"1px solid rgba(232,255,71,0.2)" }}>
                    {i+1}
                  </div>
                  <p className="text-[#666] text-sm leading-relaxed">{q}</p>
                </div>
              ))}
            </div>

            <button className="btn-p" onClick={startInterview}>Start Interview →</button>
            <p className="text-[#333] text-xs mt-4">Camera &amp; microphone access required · Use Chrome</p>
          </div>
        </div>
      )}

      {/* INTERVIEW */}
      {phase === "interview" && (
        <div className="flex flex-col min-h-screen fadein">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#111]">
            <span className="text-2xl tracking-wide" style={{ fontFamily:"'Bebas Neue'", color:"var(--accent)" }}>PREP</span>
            <div className="flex items-center gap-4">
              <span className="text-[#444] text-sm">{currentQ+1} / {QUESTIONS.length}</span>
              <div className="w-32 h-[3px] bg-[#1a1a1a] rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500" style={{ width:`${((currentQ+1)/QUESTIONS.length)*100}%`, background:"var(--accent)" }} />
              </div>
            </div>
          </div>

          <div className="flex flex-1">
            {/* Camera */}
            <div className="flex-1 flex flex-col items-center justify-center p-8 relative">
              {countdown !== null && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/80 rounded">
                  <p className="text-[#555] text-sm uppercase tracking-widest mb-3">Next question in</p>
                  <div key={countdown} className="cpop text-[120px] leading-none" style={{ fontFamily:"'Bebas Neue'", color:"var(--accent)" }}>{countdown}</div>
                </div>
              )}
              <div className="relative w-full max-w-lg">
                <video ref={videoRef} autoPlay playsInline muted className="w-full aspect-video object-cover bg-[#111] rounded-xl" style={{ transform:"scaleX(-1)" }} />
                {isRecording && (
                  <div className="absolute top-4 left-4 flex items-center gap-2 bg-black/60 backdrop-blur px-3 py-1.5 rounded-full">
                    <div className="w-2 h-2 rounded-full rec-ring" style={{ background:"var(--accent2)" }} />
                    <span className="text-xs text-white font-medium">REC</span>
                  </div>
                )}
                {clips.length > 0 && (
                  <div className="absolute top-4 right-4 bg-black/60 backdrop-blur px-3 py-1.5 rounded-full">
                    <span className="text-xs text-[#888]">{clips.length} clip{clips.length!==1?"s":""} saved</span>
                  </div>
                )}
              </div>
              <div className="mt-4 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: isRecording ? "var(--accent2)" : "#444" }} />
                <span className="text-[#555] text-sm">{statusText}</span>
              </div>
            </div>

            {/* Question panel */}
            <div className="w-[380px] border-l border-[#111] flex flex-col p-8">
              <div className="flex-1 flex flex-col justify-center">
                <div className="text-xs uppercase tracking-widest mb-4" style={{ color:"var(--accent)" }}>Question {currentQ+1}</div>
                <h2 className="text-2xl font-light leading-relaxed text-white">{QUESTIONS[currentQ]}</h2>

                <div className="mt-8 p-4 rounded-xl bg-[#0d0d0d] border border-[#1a1a1a]">
                  <p className="text-xs text-[#444] uppercase tracking-widest mb-2">Transcript</p>
                  <p className="text-[#666] text-sm leading-relaxed min-h-[60px]">
                    {transcript || <span className="italic text-[#333]">Start speaking...</span>}
                  </p>
                </div>

                <div className="mt-6 p-3 rounded-lg bg-[#0d0d0d] border border-[#1a1a1a]">
                  <p className="text-xs text-[#333] text-center">Say <span className="text-[#555]">"yeah I'm done answering"</span> or click below</p>
                </div>
              </div>

              <div className="space-y-3 mt-6">
                <button className="btn-p" onClick={handleDone}>{currentQ+1===QUESTIONS.length ? "Finish Interview" : "I'm Done →"}</button>
                <button className="btn-g" onClick={restart}>Restart</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* REVIEW */}
      {phase === "review" && (
        <div className="min-h-screen px-6 py-12 fadein">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-2 bg-[#111] border border-[#222] rounded-full px-4 py-2 mb-4 text-xs text-[#666] tracking-widest uppercase">
                <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background:"var(--accent)" }} />
                Interview Complete
              </div>
              <h1 className="glow text-6xl tracking-wide" style={{ fontFamily:"'Bebas Neue'", color:"var(--accent)" }}>Review Your Answers</h1>
              <p className="text-[#444] mt-2">{clips.length} clip{clips.length!==1?"s":""} recorded</p>
            </div>

            <div className="space-y-8">
              {clips.map((clip, i) => (
                <div key={i} className="card p-6 fadein">
                  <div className="flex items-start gap-6">
                    <div className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-sm font-bold"
                      style={{ background:"rgba(232,255,71,0.1)", color:"var(--accent)", border:"1px solid rgba(232,255,71,0.2)" }}>
                      {i+1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[#888] text-xs uppercase tracking-widest mb-2">Question {clip.questionIndex+1}</p>
                      <h3 className="text-white text-lg font-light mb-4 leading-snug">{clip.question}</h3>
                      <video src={clip.blobUrl} controls className="w-full max-w-2xl aspect-video object-cover rounded-xl" style={{ transform:"scaleX(-1)" }} />
                      <p className="text-[#444] text-xs mt-2">Duration: {clip.duration.toFixed(1)}s</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-4 mt-10 justify-center">
              <button className="btn-p" style={{ width:"auto", padding:"14px 32px" }} onClick={restart}>New Interview</button>
              <button className="btn-g" style={{ width:"auto" }} onClick={() => { clips.forEach((clip,i) => { const a=document.createElement("a"); a.href=clip.blobUrl; a.download=`question-${i+1}.webm`; a.click(); }); }}>
                Download All Clips
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
