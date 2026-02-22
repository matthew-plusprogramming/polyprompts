import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useInterview } from "../context/InterviewContext";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import { loadQuestions } from "../services/questionLoader";
import starlyIcon from "../Icons/StarlyLogo.png";
import importResumeIcon from "../Icons/ImportResume.png";
import microphoneOnIcon from "../Icons/microphoneOn.png";
import microphoneOffIcon from "../Icons/microphoneOff.png";
import "./JobDescription.css";

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

export default function JobDescription() {
  const navigate = useNavigate();
  const { state, dispatch } = useInterview();
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);
  const resumeInputRef = useRef<HTMLInputElement | null>(null);
  const speechSeedRef = useRef("");
  const { start, stop, transcript, isListening, isAvailable } =
    useSpeechRecognition();
  const canSubmit = Boolean(prompt.trim()) || Boolean(resumeFile);

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
    if (!trimmed && !resumeFile) {
      setError("Please provide a job description, a resume, or both.");
      return;
    }

    if (submitting) return;
    setSubmitting(true);
    setError("");
    const contextDescription = trimmed || `Resume uploaded: ${resumeFile?.name ?? "Resume"}`;
    dispatch({ type: "SET_JOB_DESCRIPTION", payload: contextDescription });

    try {
      const generatedQuestions = await loadQuestions({
        role: state.role,
        difficulty: state.difficulty,
        count: 2,
        ...(state.resumeText
          ? { resumeText: state.resumeText, jobDescription: contextDescription }
          : {}),
      });

      if (!generatedQuestions.length) {
        throw new Error("No interview questions could be generated.");
      }

      dispatch({ type: "SET_QUESTIONS", payload: generatedQuestions });
    } catch (submitError) {
      // Fallback mode: still allow interview flow with local questions from the typed description.
      const fallbackQuestions = buildFallbackQuestions({
        role: state.role,
        difficulty: state.difficulty,
        jobDescription: contextDescription,
      });
      dispatch({ type: "SET_QUESTIONS", payload: fallbackQuestions });
    } finally {
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

  const handleResumePicked = (fileList: FileList | null) => {
    const file = fileList?.[0] ?? null;
    setResumeFile(file);
    if (file && error) setError("");
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
              placeholder="Type response"
              aria-label="Job description prompt"
              rows={1}
            />
            <div className="job-description__actions">
              <button
                type="button"
                className={`job-description__voice ${isListening ? "job-description__voice--active" : ""}`}
                onClick={handleVoiceToggle}
                aria-pressed={isListening}
                aria-label={isListening ? "Stop voice input" : "Start voice input"}
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
          <span>or</span>
        </div>
        <div
          className={`job-description__dropzone ${dragActive ? "is-dragging" : ""}`}
          role="button"
          tabIndex={0}
          onClick={() => resumeInputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              resumeInputRef.current?.click();
            }
          }}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            setDragActive(false);
          }}
          onDrop={(event) => {
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
          <p>Import resume</p>
          <span>PDF, DOC, DOCX, TXT</span>
          {resumeFile && (
            <strong>{resumeFile.name}</strong>
          )}
        </div>
        {error && <p className="job-description__error">{error}</p>}
      </section>
    </main>
  );
}
