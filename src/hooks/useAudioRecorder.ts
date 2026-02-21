import { useState } from 'react';

/**
 * Hook wrapping MediaRecorder lifecycle.
 *
 * TODO: Implement using services/audioRecorder.ts
 * - Manage isRecording state
 * - Return { start, stop, isRecording, audioBlob }
 */
export function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);

  const start = () => {
    // TODO: Call createAudioRecorder, begin recording
    setIsRecording(true);
    setAudioBlob(null);
  };

  const stop = () => {
    // TODO: Stop recorder, set audioBlob from result
    setIsRecording(false);
  };

  return { start, stop, isRecording, audioBlob };
}
