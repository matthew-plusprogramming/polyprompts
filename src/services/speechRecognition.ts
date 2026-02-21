/**
 * Web Speech API wrapper for live transcript display.
 * Chrome-only in practice. Falls back gracefully if unavailable.
 *
 * TODO: Implement start/stop/onResult using SpeechRecognition API
 * - continuous = true, interimResults = true
 * - onresult callback updates liveTranscript in state
 * - Handle browser compatibility (check for webkitSpeechRecognition)
 */
export function createSpeechRecognition(
  onResult: (transcript: string) => void,
  onError: (error: string) => void
) {
  void onResult;
  void onError;

  return {
    start: () => { console.warn('speechRecognition.start not implemented'); },
    stop: () => { console.warn('speechRecognition.stop not implemented'); },
  };
}
