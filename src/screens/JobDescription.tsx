import { useEffect, useRef, useState, useCallback } from "react";
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent, DragEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useInterview } from "../context/InterviewContext";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import { loadQuestions } from "../services/questionLoader";
import { prefetchTTS } from "../services/openai";
import { getPreInterviewPrefetchTexts } from "../config/preInterviewScript";
import { createLogger } from "../utils/logger";
import starlyIcon from "../Icons/StarlyLogo.png";
import importResumeIcon from "../Icons/ImportResume.png";
import microphoneOnIcon from "../Icons/microphoneOn.png";
import microphoneOffIcon from "../Icons/microphoneOff.png";
import "./JobDescription.css";

const log = createLogger("JobDescription");

const INTERVIEW_TTS_INSTRUCTIONS =
  "Casual American female voice. Relaxed, steady pacing with natural micro-pauses between phrases. Slight upward inflection when asking questions. No vocal fry. Do not sound like a narrator or announcer — sound like a real person talking across a table.";

/* ── PDF extraction (reused from SetupScreen) ── */
let pdfJsLoaded = false;
function loadPdfJs(): Promise<void> {
  if (pdfJsLoaded && (window as any).pdfjsLib) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    script.onload = () => {
      const lib = (window as any).pdfjsLib;
      if (lib) {
        lib.GlobalWorkerOptions.workerSrc =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        pdfJsLoaded = true;
        resolve();
      } else {
        reject(new Error("pdf.js failed to load"));
      }
    };
    script.onerror = () => reject(new Error("Failed to load pdf.js from CDN"));
    document.head.appendChild(script);
  });
}

async function extractPDFText(file: File): Promise<string> {
  await loadPdfJs();
  const lib = (window as any).pdfjsLib;
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await lib.getDocument({ data: arrayBuffer }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((item: any) => item.str).join(" ");
    pages.push(text);
  }
  const fullText = pages.join("\n");
  if (!fullText.trim()) {
    throw new Error(
      "No text found — this may be a scanned/image PDF. Please use a text-based PDF.",
    );
  }
  return fullText;
}

async function extractFileText(file: File): Promise<string> {
  if (file.name.match(/\.pdf$/i)) return extractPDFText(file);
  return file.text();
}

/* ── Fallback questions ── */
function buildFallbackQuestions({
  role,
  difficulty,
  jobDescription,
}: {
  role: "swe_intern" | "pm_intern";
  difficulty: "easy" | "medium" | "hard";
  jobDescription: string;
}) {
  const excerpt = jobDescription.replace(/\s+/g, " ").trim().slice(0, 180);
  return [
    {
      id: `fallback-${Date.now()}-0`,
      role,
      difficulty,
      category: "behavioral",
      text: `Tell me about a time you demonstrated skills relevant to this role: "${excerpt}". Keep your answer in STAR format.`,
    },
    {
      id: `fallback-${Date.now()}-1`,
      role,
      difficulty,
      category: "problem-solving",
      text: `Describe a challenge you handled that maps to this position: "${excerpt}". What actions did you take and what was the result?`,
    },
  ];
}

/* ── Main component ── */
export default function JobDescription() {
  const navigate = useNavigate();
  const { state, dispatch } = useInterview();
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeText, setResumeText] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);
  const resumeInputRef = useRef<HTMLInputElement | null>(null);
  const speechSeedRef = useRef("");
  const { start, stop, transcript, isListening, isAvailable } =
    useSpeechRecognition();

  // JD is required; resume is optional
  const canSubmit = Boolean(prompt.trim()) && !extracting;

  useEffect(() => {
    if (!isListening) return;
    const spoken = transcript.trim();
    const seed = speechSeedRef.current.trim();
    if (!spoken) {
      setPrompt(seed);
      return;
    }
    setPrompt(seed ? `${seed} ${spoken}` : spoken);
  }, [isListening, transcript]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed) {
      setError("Please provide a job description.");
      return;
    }

    if (submitting) return;
    setSubmitting(true);
    setError("");

    dispatch({ type: "SET_JOB_DESCRIPTION", payload: trimmed });
    if (resumeText) {
      dispatch({ type: "SET_RESUME_TEXT", payload: resumeText });
    }

    try {
      const generatedQuestions = await loadQuestions({
        role: state.role,
        difficulty: state.difficulty,
        count: 2,
        ...(resumeText
          ? { resumeText, jobDescription: trimmed }
          : {}),
      });

      if (!generatedQuestions.length) {
        throw new Error("No interview questions could be generated.");
      }

      dispatch({ type: "SET_QUESTIONS", payload: generatedQuestions });

      // Prefetch TTS for interview questions
      const textsToCache = generatedQuestions.map((q) => q.text);
      if (generatedQuestions.length > 1) {
        textsToCache.push("Great, let's move on to the next question.");
      }
      textsToCache.push("Are you finished, or would you like to keep going?");
      prefetchTTS(textsToCache, "marin", 1.0, INTERVIEW_TTS_INSTRUCTIONS);
    } catch (submitError) {
      log.warn("Question generation failed, using fallbacks", { error: String(submitError) });
      const fallbackQuestions = buildFallbackQuestions({
        role: state.role,
        difficulty: state.difficulty,
        jobDescription: trimmed,
      });
      dispatch({ type: "SET_QUESTIONS", payload: fallbackQuestions });
    } finally {
      // Prefetch pre-interview script TTS
      prefetchTTS(getPreInterviewPrefetchTexts(), "marin", 1.0);
      navigate("/pre-interview");
      setSubmitting(false);
    }
  };

  const handleVoiceToggle = () => {
    if (!isAvailable) {
      setError("Voice input is not available in this browser.");
      return;
    }

    setError("");
    if (isListening) {
      stop();
      return;
    }

    speechSeedRef.current = prompt.trim();
    start();
  };

  const handlePromptKeyDown = (
    event: ReactKeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!canSubmit || submitting) return;
      formRef.current?.requestSubmit();
    }
  };

  const handleResumePicked = useCallback(
    async (fileList: FileList | null) => {
      const file = fileList?.[0] ?? null;
      if (!file) return;

      const ACCEPTED = [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain",
      ];
      if (
        !ACCEPTED.includes(file.type) &&
        !file.name.match(/\.(pdf|doc|docx|txt)$/i)
      ) {
        setError("Please upload a PDF, DOCX, or TXT file.");
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setError("File too large — max 5 MB.");
        return;
      }

      setResumeFile(file);
      setExtracting(true);
      setError("");

      try {
        const text = await extractFileText(file);
        setResumeText(text);
        log.info("Resume text extracted", {
          name: file.name,
          length: text.length,
        });
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to extract text from file.",
        );
        setResumeFile(null);
        setResumeText(null);
      } finally {
        setExtracting(false);
      }
    },
    [],
  );

  const handleRemoveResume = () => {
    setResumeFile(null);
    setResumeText(null);
  };

  return (
    <main className="job-description">
      <img className="job-description__logo" src={starlyIcon} alt="Starly" />
      <section className="job-description__panel">
        <h1>Describe the position you are applying for.</h1>
        <form ref={formRef} onSubmit={handleSubmit}>
          <div className="job-description__field">
            <textarea
              value={prompt}
              onChange={(event) => {
                setPrompt(event.target.value);
                if (error) setError("");
              }}
              onKeyDown={handlePromptKeyDown}
              placeholder="Paste or type the job description here..."
              aria-label="Job description prompt"
              rows={4}
            />
            <div className="job-description__actions">
              <button
                type="button"
                className={`job-description__voice ${isListening ? "job-description__voice--active" : ""}`}
                onClick={handleVoiceToggle}
                aria-pressed={isListening}
                aria-label={
                  isListening ? "Stop voice input" : "Start voice input"
                }
              >
                <img
                  src={isListening ? microphoneOnIcon : microphoneOffIcon}
                  alt=""
                />
              </button>
              <button
                type="submit"
                className="job-description__submit"
                aria-label="Submit job description"
                disabled={!canSubmit || submitting}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M5 12h13M13 6l6 6-6 6" />
                </svg>
              </button>
            </div>
          </div>
        </form>
        <div className="job-description__or">
          <span>we also recommend</span>
        </div>
        {resumeFile && !extracting ? (
          <div className="job-description__dropzone job-description__dropzone--loaded">
            <div className="job-description__dropzone-loaded-row">
              <img
                className="job-description__dropzone-icon"
                src={importResumeIcon}
                alt=""
              />
              <strong>{resumeFile.name}</strong>
            </div>
            <button
              type="button"
              className="job-description__dropzone-remove"
              onClick={(e) => {
                e.stopPropagation();
                handleRemoveResume();
              }}
            >
              Remove
            </button>
          </div>
        ) : (
          <div
            className={`job-description__dropzone ${dragActive ? "is-dragging" : ""} ${extracting ? "is-extracting" : ""}`}
            role="button"
            tabIndex={0}
            onClick={() => !extracting && resumeInputRef.current?.click()}
            onKeyDown={(event) => {
              if (
                (event.key === "Enter" || event.key === " ") &&
                !extracting
              ) {
                event.preventDefault();
                resumeInputRef.current?.click();
              }
            }}
            onDragEnter={(event: DragEvent) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragOver={(event: DragEvent) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={(event: DragEvent) => {
              event.preventDefault();
              setDragActive(false);
            }}
            onDrop={(event: DragEvent) => {
              event.preventDefault();
              setDragActive(false);
              handleResumePicked(event.dataTransfer.files);
            }}
          >
            <input
              ref={resumeInputRef}
              className="job-description__dropzone-input"
              type="file"
              accept=".pdf,.doc,.docx,.txt"
              onChange={(event) => handleResumePicked(event.target.files)}
            />
            <img
              className="job-description__dropzone-icon"
              src={importResumeIcon}
              alt=""
            />
            {extracting ? (
              <>
                <p>Scanning resume...</p>
                <span>Extracting text</span>
              </>
            ) : (
              <>
                <p>Import resume</p>
                <span>PDF, DOC, DOCX, TXT</span>
              </>
            )}
          </div>
        )}
        {error && <p className="job-description__error">{error}</p>}
      </section>
    </main>
  );
}
