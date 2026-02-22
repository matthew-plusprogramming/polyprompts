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
