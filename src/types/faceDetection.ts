/** Aggregated face-detection metrics for a single question recording. */
export interface FaceMetrics {
  /** Percentage of frames where the user maintained eye contact (0-100). */
  eyeContactPercent: number;
  /** Head stability score — higher means less head movement (0-100). */
  headStability: number;
  /** Nervousness proxy derived from blink rate + head variance (0-100). */
  nervousnessScore: number;
  /** Composite confidence score (eye contact + stability + composure) (0-100). */
  confidenceScore: number;
}

// ─── MediaPipe CDN global type declarations ─────────────────────────────────

interface MediaPipeLandmark {
  x: number;
  y: number;
  z?: number;
}

interface FaceMeshResults {
  multiFaceLandmarks?: MediaPipeLandmark[][];
}

interface FaceMeshOptions {
  maxNumFaces?: number;
  refineLandmarks?: boolean;
  minDetectionConfidence?: number;
  minTrackingConfidence?: number;
}

interface FaceMeshInstance {
  setOptions(options: FaceMeshOptions): void;
  onResults(callback: (results: FaceMeshResults) => void): void;
  send(input: { image: HTMLVideoElement }): Promise<void>;
  close(): void;
}

interface FaceMeshConstructor {
  new (config: { locateFile: (file: string) => string }): FaceMeshInstance;
}

declare global {
  interface Window {
    FaceMesh: FaceMeshConstructor;
  }
}

export type {
  MediaPipeLandmark,
  FaceMeshResults,
  FaceMeshInstance,
  FaceMeshConstructor,
};
