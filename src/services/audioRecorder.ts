/**
 * Audio recording service using MediaRecorder.
 *
 * Voice Activity Detection (VAD) is handled separately by @ricky0123/vad-web
 * in useAudioRecorder. This module only manages the MediaRecorder for capturing
 * the full audio blob (sent to Whisper for transcription).
 */

import { createLogger } from '../utils/logger';

const log = createLogger('Recorder');

export interface RecorderCallbacks {
  onMicDisconnect: () => void;
  onError: (error: Error) => void;
}

export interface AudioRecorder {
  start: (stream: MediaStream) => void;
  stop: () => Promise<Blob>;
  isActive: () => boolean;
}

const STOP_TIMEOUT_MS = 5000;

export function createAudioRecorder(callbacks: RecorderCallbacks): AudioRecorder {
  let mediaRecorder: MediaRecorder | null = null;
  let recorderMimeType = '';
  const chunks: Blob[] = [];
  let trackEndedHandler: (() => void) | null = null;

  function getSupportedMimeType(): string {
    if (!window.MediaRecorder?.isTypeSupported) return '';
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4;codecs=mp4a.40.2',
      'audio/mp4',
    ];
    return candidates.find((type) => window.MediaRecorder.isTypeSupported(type)) ?? '';
  }

  function start(stream: MediaStream): void {
    chunks.length = 0;

    const tracks = stream.getAudioTracks();
    if (!tracks.length) {
      callbacks.onError(new Error('Stream has no audio tracks'));
      return;
    }

    // Watch for mic disconnection
    trackEndedHandler = () => {
      log.warn('Audio track ended (mic disconnected?)');
      callbacks.onMicDisconnect();
    };
    tracks[0].addEventListener('ended', trackEndedHandler);

    recorderMimeType = getSupportedMimeType();
    const options = recorderMimeType ? { mimeType: recorderMimeType } : undefined;

    try {
      mediaRecorder = new MediaRecorder(stream, options);
    } catch (err) {
      callbacks.onError(new Error(`MediaRecorder init failed: ${err}`));
      return;
    }

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    mediaRecorder.onerror = (event) => {
      log.error('MediaRecorder error', { error: String(event) });
      callbacks.onError(new Error('MediaRecorder error during recording'));
    };

    try {
      mediaRecorder.start(1000);
      log.info('Started', { mimeType: recorderMimeType || 'browser default' });
    } catch (err) {
      callbacks.onError(new Error(`MediaRecorder.start() failed: ${err}`));
      mediaRecorder = null;
    }
  }

  function stop(): Promise<Blob> {
    const outputType = recorderMimeType || mediaRecorder?.mimeType || 'audio/webm';

    // Clean up track listener
    if (trackEndedHandler && mediaRecorder) {
      try {
        const stream = mediaRecorder.stream;
        stream.getAudioTracks().forEach((t) => {
          t.removeEventListener('ended', trackEndedHandler!);
        });
      } catch { /* stream may already be dead */ }
      trackEndedHandler = null;
    }

    return new Promise<Blob>((resolve) => {
      const resolveWithLog = (blob: Blob) => {
        log.info('Stopped', { blobSize: blob.size, chunkCount: chunks.length });
        resolve(blob);
      };

      if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        resolveWithLog(new Blob(chunks, { type: outputType }));
        return;
      }

      // Timeout guard — don't hang forever if MediaRecorder misbehaves
      const timeout = setTimeout(() => {
        log.warn('stop() timed out, resolving with partial data');
        resolveWithLog(new Blob(chunks, { type: outputType }));
      }, STOP_TIMEOUT_MS);

      mediaRecorder.onstop = () => {
        clearTimeout(timeout);
        resolveWithLog(new Blob(chunks, { type: outputType }));
      };

      try {
        mediaRecorder.stop();
      } catch {
        clearTimeout(timeout);
        resolveWithLog(new Blob(chunks, { type: outputType }));
      }

      mediaRecorder = null;
    });
  }

  function isActive(): boolean {
    return mediaRecorder?.state === 'recording';
  }

  return { start, stop, isActive };
}
