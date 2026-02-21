export interface AudioPipelineConfig {
  onSilenceStart: () => void;
  onSilenceEnd: () => void;
  onVolumeLevel: (rms: number) => void;
}

export interface AudioPipeline {
  start: () => Promise<MediaStream>;
  stop: () => Promise<Blob>;
}

const SILENCE_THRESHOLD = 0.01;
const SILENCE_DURATION_MS = 3000;
const VOLUME_CHECK_INTERVAL_MS = 100;

export function createAudioPipeline(config: AudioPipelineConfig): AudioPipeline {
  let audioContext: AudioContext;
  let mediaStream: MediaStream;
  let mediaRecorder: MediaRecorder;
  let analyserNode: AnalyserNode;
  let sourceNode: MediaStreamAudioSourceNode;
  const chunks: Blob[] = [];
  let silenceStartTime: number | null = null;
  let isSilent = false;
  let volumeCheckInterval: number;

  async function start(): Promise<MediaStream> {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        channelCount: 1,
      },
    });

    audioContext = new AudioContext();
    sourceNode = audioContext.createMediaStreamSource(mediaStream);

    // AnalyserNode for RMS volume monitoring
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 2048;
    analyserNode.smoothingTimeConstant = 0.3;
    sourceNode.connect(analyserNode);

    // MediaRecorder for final blob
    mediaRecorder = new MediaRecorder(mediaStream, {
      mimeType: 'audio/webm;codecs=opus',
    });
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    mediaRecorder.start(1000);

    // Volume monitoring loop with silence detection
    const dataArray = new Float32Array(analyserNode.fftSize);
    volumeCheckInterval = window.setInterval(() => {
      analyserNode.getFloatTimeDomainData(dataArray);

      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i] * dataArray[i];
      }
      const rms = Math.sqrt(sum / dataArray.length);
      config.onVolumeLevel(rms);

      if (rms < SILENCE_THRESHOLD) {
        if (!silenceStartTime) {
          silenceStartTime = Date.now();
        } else if (Date.now() - silenceStartTime >= SILENCE_DURATION_MS && !isSilent) {
          isSilent = true;
          config.onSilenceStart();
        }
      } else {
        if (isSilent) {
          config.onSilenceEnd();
        }
        silenceStartTime = null;
        isSilent = false;
      }
    }, VOLUME_CHECK_INTERVAL_MS);

    return mediaStream;
  }

  function stop(): Promise<Blob> {
    clearInterval(volumeCheckInterval);
    analyserNode?.disconnect();
    sourceNode?.disconnect();
    mediaStream?.getTracks().forEach((t) => t.stop());

    return new Promise((resolve) => {
      if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        audioContext?.close();
        resolve(new Blob(chunks, { type: 'audio/webm;codecs=opus' }));
        return;
      }
      mediaRecorder.onstop = () => {
        audioContext?.close();
        resolve(new Blob(chunks, { type: 'audio/webm;codecs=opus' }));
      };
      mediaRecorder.stop();
    });
  }

  return { start, stop };
}
