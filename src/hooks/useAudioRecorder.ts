import { useState, useRef, useCallback } from 'react';
import { createAudioPipeline } from '../services/audioRecorder';
import type { AudioPipeline } from '../services/audioRecorder';

export function useAudioRecorder(
  onSilenceStart: () => void,
  onSilenceEnd: () => void,
) {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [volumeLevel, setVolumeLevel] = useState(0);
  const pipelineRef = useRef<AudioPipeline | null>(null);

  const start = useCallback(async () => {
    setIsRecording(true);
    setAudioBlob(null);

    const pipeline = createAudioPipeline({
      onSilenceStart,
      onSilenceEnd,
      onVolumeLevel: setVolumeLevel,
    });

    pipelineRef.current = pipeline;
    await pipeline.start();
  }, [onSilenceStart, onSilenceEnd]);

  const stop = useCallback(async () => {
    if (!pipelineRef.current) return null;
    const blob = await pipelineRef.current.stop();
    pipelineRef.current = null;
    setAudioBlob(blob);
    setIsRecording(false);
    return blob;
  }, []);

  return { start, stop, isRecording, audioBlob, volumeLevel };
}
