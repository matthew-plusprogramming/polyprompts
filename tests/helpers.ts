import { Page } from '@playwright/test';

/**
 * Mock the MediaRecorder API since Playwright's Chromium doesn't have real mic access
 */
export async function mockMediaAPIs(page: Page) {
  await page.addInitScript(() => {
    // ── Create a real silent MediaStream using the browser's native AudioContext ──
    // The VAD library (MicVAD) checks instanceof AudioContext and uses
    // MediaStreamAudioSourceNode constructor directly, so we cannot replace
    // AudioContext with a mock class. Instead we keep the real AudioContext and
    // provide a genuine (but silent) MediaStream from getUserMedia.
    //
    // We create the stream lazily on first getUserMedia call, then cache it.
    let cachedStream: MediaStream | null = null;

    async function getSilentStream(): Promise<MediaStream> {
      if (cachedStream) return cachedStream;
      const ctx = new AudioContext();
      const oscillator = ctx.createOscillator();
      oscillator.frequency.value = 0; // silent
      const dest = ctx.createMediaStreamDestination();
      oscillator.connect(dest);
      oscillator.start();
      cachedStream = dest.stream;
      return cachedStream;
    }

    navigator.mediaDevices.getUserMedia = async () => getSilentStream();

    // Mock MediaRecorder
    class MockMediaRecorder {
      state = 'inactive';
      ondataavailable: ((e: any) => void) | null = null;
      onstop: (() => void) | null = null;
      onerror: ((e: any) => void) | null = null;

      static isTypeSupported() { return true; }

      start() {
        this.state = 'recording';
      }
      stop() {
        this.state = 'inactive';
        if (this.ondataavailable) {
          this.ondataavailable({ data: new Blob(['mock-audio'], { type: 'audio/webm' }) });
        }
        if (this.onstop) {
          this.onstop();
        }
      }
      addEventListener(event: string, handler: any) {
        if (event === 'dataavailable') this.ondataavailable = handler;
        if (event === 'stop') this.onstop = handler;
      }
      removeEventListener() {}
    }

    (window as any).MediaRecorder = MockMediaRecorder;

    // Mock SpeechRecognition — stores the active instance on window so
    // tests can inject transcript text via __mockSpeechRecognitionInject(text).
    class MockSpeechRecognition {
      continuous = false;
      interimResults = false;
      lang = '';
      onresult: ((e: any) => void) | null = null;
      onerror: ((e: any) => void) | null = null;
      onend: (() => void) | null = null;
      onstart: (() => void) | null = null;

      start() {
        (window as any).__activeSpeechRecognition = this;
        if (this.onstart) this.onstart();
      }
      stop() {
        (window as any).__activeSpeechRecognition = null;
        if (this.onend) this.onend();
      }
      abort() {
        (window as any).__activeSpeechRecognition = null;
        if (this.onend) this.onend();
      }
      addEventListener() {}
      removeEventListener() {}
    }

    // Helper for tests to inject transcript text into the active recognition
    (window as any).__mockSpeechRecognitionInject = (text: string) => {
      const rec = (window as any).__activeSpeechRecognition;
      if (rec && rec.onresult) {
        rec.onresult({
          results: [{
            0: { transcript: text },
            isFinal: true,
            length: 1,
          }],
          resultIndex: 0,
        } as any);
      }
    };

    (window as any).SpeechRecognition = MockSpeechRecognition;
    (window as any).webkitSpeechRecognition = MockSpeechRecognition;

    // NOTE: We deliberately do NOT mock AudioContext. The VAD library and the
    // audio normalization chain in useAudioRecorder need a real AudioContext
    // with working createMediaStreamSource, createScriptProcessor,
    // createDynamicsCompressor, createGain, and createMediaStreamDestination.
    // The real Chromium AudioContext works fine in Playwright's headless mode
    // as long as it's created within a user-gesture call stack (which our
    // InterviewScreen handleStart does).
  });
}

/**
 * Navigate to a specific route and wait for the page to be ready
 */
export async function navigateTo(page: Page, route: string) {
  await page.goto(route);
  await page.waitForLoadState('networkidle');
}

/**
 * Mock a scoring result for feedback screen tests
 */
export function getMockScoringResult() {
  return {
    scores: {
      situation: { level: 'Solid', explanation: 'Good context provided' },
      task: { level: 'Developing', explanation: 'Task was vague' },
      action: { level: 'Strong', explanation: 'Detailed actions described' },
      result: { level: 'Solid', explanation: 'Quantified outcome' },
      communication: { level: 'Solid', explanation: 'Clear delivery' },
      pacing: { level: 'Developing', explanation: 'Could be more concise' },
    },
    suggestions: [
      'Be more specific about your role in the task definition',
      'Add metrics to quantify your impact more precisely',
      'Consider discussing what you would do differently next time',
    ],
    followUp: 'You mentioned leading the team - what was the most difficult decision you had to make?',
    overallSummary: 'Strong answer with good STAR structure. Your action section was particularly detailed. Focus on being more specific about the task and quantifying results.',
    strongestDimension: 'action',
    weakestDimension: 'task',
    positiveCallouts: [
      'You clearly described the specific steps you took to resolve the issue',
      'Good use of "I" statements showing personal ownership of the actions',
    ],
  };
}
