import { useState } from "react";
import FaceAnalysis from "./components/FaceAnalysis";

export default function App() {
  const [metrics, setMetrics] = useState(null);

  return (
    <div style={{
      minHeight: "100vh",
      background: "#070b14",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px",
      gap: "20px",
    }}>
      <div style={{
        fontFamily: "'Syne', sans-serif",
        fontSize: "22px",
        fontWeight: 800,
        color: "white",
        letterSpacing: "0.04em",
      }}>
        🎤 Interview Coach — Face Detection
      </div>
      <FaceAnalysis onMetricsUpdate={setMetrics} />
      {metrics && (
        <div style={{
          fontFamily: "monospace",
          fontSize: "11px",
          color: "rgba(255,255,255,0.25)",
          maxWidth: "780px",
          width: "100%",
        }}>
          Live: confidence {Math.round(metrics.confidence)}% · eye contact {Math.round(metrics.eyeContact)}% · blinks/min {Math.round(metrics.blinkRate)}
        </div>
      )}
    </div>
  );
}
