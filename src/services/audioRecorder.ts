/**
 * MediaRecorder wrapper for capturing audio blobs to send to Whisper.
 *
 * TODO: Implement using MediaRecorder API
 * - getUserMedia({ audio: true }) for mic access
 * - Record as webm/opus
 * - On stop, produce a single Blob from collected chunks
 */
export function createAudioRecorder(
  onComplete: (blob: Blob) => void,
  onError: (error: string) => void
) {
  void onComplete;
  void onError;

  return {
    start: () => { console.warn('audioRecorder.start not implemented'); },
    stop: () => { console.warn('audioRecorder.stop not implemented'); },
  };
}
