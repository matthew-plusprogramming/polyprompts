import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import starlyIcon from "../Icons/StarlyLogo.png";
import microphoneOnIcon from "../Icons/microphoneOn.png";
import microphoneOffIcon from "../Icons/microphoneOff.png";
import "./JobDescription.css";

export default function JobDescription() {
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState("");
  const speechSeedRef = useRef("");
  const { start, stop, transcript, isListening, isAvailable } =
    useSpeechRecognition();

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

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // UI-only phase: submit behavior will be wired later.
    void prompt;
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

  return (
    <main className="job-description">
      <img className="job-description__logo" src={starlyIcon} alt="Starly" />
      <section className="job-description__panel">
        <h1>Describe the position you are applying for.</h1>
        <form onSubmit={handleSubmit}>
          <div className="job-description__field">
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
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
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M5 12h13M13 6l6 6-6 6" />
                </svg>
              </button>
            </div>
          </div>
        </form>
        {error && <p className="job-description__error">{error}</p>}
      </section>
    </main>
  );
}
