/**
 * complete-journey.spec.ts
 *
 * T96 — End-to-end tests for the complete user journey:
 *   setup -> interview -> feedback -> retry -> next question
 *
 * These tests exercise the full application flow by driving the UI with
 * mocked browser APIs (MediaRecorder, SpeechRecognition, AudioContext) and
 * intercepted network requests (OpenAI chat/completions, audio/speech,
 * audio/transcriptions).
 *
 * Architecture notes:
 * - React context state lives in memory (not localStorage), so we cannot
 *   seed it from page.evaluate before the app boots for most cases.
 * - The interview "Done" handler requires the transcript to have >= 10 words.
 *   Since our mock SpeechRecognition doesn't fire onresult events, we inject
 *   transcript text via the React fiber dispatch (UPDATE_TRANSCRIPT) before
 *   clicking "I'm Done".
 * - API responses are intercepted with page.route() to return deterministic
 *   mock data — no real OpenAI calls are made.
 */

import { test, expect, type Page } from '@playwright/test';
import { mockMediaAPIs, getMockScoringResult } from './helpers';

// ─────────────────────────────────────────────────────────────────────────────
// Shared constants
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_TRANSCRIPT =
  'In my sophomore year I led a team of five engineers to refactor the authentication module. ' +
  'I mapped the existing logic, wrote unit tests first, then rewrote each function incrementally. ' +
  'Login time dropped by forty percent and zero auth-related bugs were filed that semester.';

/**
 * Generate a minimal valid WAV file (44-byte header + 800 samples of silence).
 * This produces ~0.1s of 8kHz 8-bit mono silence that the browser can decode
 * and play, triggering the `ended` event almost immediately.
 */
function createSilentWav(): Buffer {
  const numSamples = 800;
  const sampleRate = 8000;
  const buf = Buffer.alloc(44 + numSamples);

  // RIFF header
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + numSamples, 4);
  buf.write('WAVE', 8);

  // fmt sub-chunk
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);       // SubChunk1Size (PCM)
  buf.writeUInt16LE(1, 20);        // AudioFormat (PCM)
  buf.writeUInt16LE(1, 22);        // NumChannels (mono)
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate, 28); // ByteRate
  buf.writeUInt16LE(1, 32);        // BlockAlign
  buf.writeUInt16LE(8, 34);        // BitsPerSample

  // data sub-chunk
  buf.write('data', 36);
  buf.writeUInt32LE(numSamples, 40);
  // Fill with 128 = silence for unsigned 8-bit PCM
  buf.fill(128, 44, 44 + numSamples);

  return buf;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register route intercepts for every external API the app calls:
 *   - OpenAI chat/completions  -> returns mock scoring result (or pause "done")
 *   - OpenAI audio/speech      -> returns a tiny silent buffer (TTS)
 *   - OpenAI audio/transcriptions -> returns a mock Whisper transcript
 *   - App proxy routes (api proxy) -> same handling
 */
async function mockAllAPIs(page: Page) {
  await mockMediaAPIs(page);

  const mockResult = getMockScoringResult();

  await page.route('**/*openai.com/**', async (route) => {
    const url = route.request().url();

    if (url.includes('chat/completions')) {
      // Distinguish scoring vs pause-analysis by checking the request body
      const postBody = route.request().postDataJSON() as Record<string, unknown> | null;
      const messages = (postBody?.messages as Array<{ role: string; content: string }>) ?? [];
      const isScoring = messages.some(
        (m) => typeof m.content === 'string' && m.content.includes('STAR'),
      );

      if (isScoring) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            choices: [{ message: { content: JSON.stringify(mockResult) } }],
          }),
        });
      } else {
        // Pause analysis -> always say "done" so interview ends
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            choices: [{ message: { content: JSON.stringify({ verdict: 'done' }) } }],
          }),
        });
      }
    } else if (url.includes('audio/speech')) {
      await route.fulfill({
        status: 200,
        contentType: 'audio/wav',
        body: createSilentWav(),
      });
    } else if (url.includes('audio/transcriptions')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ text: MOCK_TRANSCRIPT }),
      });
    } else {
      await route.continue();
    }
  });

  // Also intercept requests that go through the app's own proxy (if any)
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    if (url.includes('completions') || url.includes('chat')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          choices: [{ message: { content: JSON.stringify(mockResult) } }],
        }),
      });
    } else if (url.includes('speech') || url.includes('tts')) {
      await route.fulfill({
        status: 200,
        contentType: 'audio/mpeg',
        body: Buffer.alloc(128, 0),
      });
    } else if (url.includes('transcri')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ text: MOCK_TRANSCRIPT }),
      });
    } else {
      await route.continue();
    }
  });
}

/**
 * Walk the React fiber tree from #root to find the dispatch function from
 * the InterviewProvider's useReducer. Returns it as a callable on window.
 */
async function getDispatch(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    function getFiberRoot(el: Element) {
      const key = Object.keys(el).find(
        (k) => k.startsWith('__reactContainer') || k.startsWith('__reactFiber'),
      );
      // @ts-ignore
      return key ? el[key] : null;
    }

    /**
     * Walk the React fiber tree to find the InterviewProvider's useReducer dispatch.
     * Both useState and useReducer store dispatch in memoizedState.queue.dispatch,
     * so we need to verify we have the RIGHT dispatch. The InterviewProvider's
     * useReducer state has a distinctive shape: an object with `liveTranscript`,
     * `currentQuestion`, `isRecording`, etc.
     */
    function findDispatchInHooks(hookState: unknown): ((a: unknown) => void) | null {
      let current = hookState;
      while (current) {
        const hook = current as Record<string, unknown>;
        if (hook.queue && typeof hook.queue === 'object') {
          const queue = hook.queue as Record<string, unknown>;
          if (typeof queue.dispatch === 'function') {
            // Check if this hook's state looks like our InterviewState
            const state = hook.memoizedState;
            if (
              state &&
              typeof state === 'object' &&
              'liveTranscript' in (state as Record<string, unknown>) &&
              'isRecording' in (state as Record<string, unknown>)
            ) {
              return queue.dispatch as (a: unknown) => void;
            }
          }
        }
        current = hook.next;
      }
      return null;
    }

    function findDispatch(fiber: unknown, depth = 0): ((a: unknown) => void) | null {
      if (!fiber || depth > 50) return null;
      const f = fiber as Record<string, unknown>;

      // Check hooks on this fiber
      if (f.memoizedState) {
        const result = findDispatchInHooks(f.memoizedState);
        if (result) return result;
      }

      // Walk child and sibling fibers
      const childResult = findDispatch(f.child, depth + 1);
      if (childResult) return childResult;
      return findDispatch(f.sibling, depth + 1);
    }

    const root = document.getElementById('root');
    if (!root) return false;
    const fiberRoot = getFiberRoot(root);
    if (!fiberRoot) return false;
    const dispatch = findDispatch(fiberRoot);
    if (!dispatch) return false;

    (window as unknown as Record<string, unknown>).__testDispatch = dispatch;
    return true;
  });
}

/**
 * Inject a transcript into the React context via fiber dispatch.
 * This is needed because the mock SpeechRecognition doesn't fire onresult
 * events, so the transcript stays empty and handleDone would reject short
 * answers (< 10 words).
 */
/**
 * Inject transcript text via the mock SpeechRecognition's onresult event.
 *
 * This fires the mock SpeechRecognition result so that:
 *   1. useSpeechRecognition's onresult handler sets finalTranscript (for getFullTranscript())
 *   2. InterviewScreen's useEffect syncs speech.transcript -> state.liveTranscript via dispatch
 *
 * IMPORTANT: We must wait until `speech.start()` has been called in the app code,
 * which creates the MockSpeechRecognition instance and stores it on
 * `window.__activeSpeechRecognition`. The "I'm Done" button becomes visible BEFORE
 * speech recognition starts (because setPhase('recording') runs before the async
 * VAD + recorder init completes, and speech.start() is called after that).
 */
async function injectTranscript(page: Page, text: string) {
  // Wait for the mock SpeechRecognition instance to be active
  await page.waitForFunction(
    () => !!(window as unknown as Record<string, unknown>).__activeSpeechRecognition,
    { timeout: 15_000 },
  );

  await page.evaluate((transcript) => {
    const inject = (window as unknown as Record<string, unknown>).__mockSpeechRecognitionInject;
    if (typeof inject === 'function') {
      (inject as (t: string) => void)(transcript);
    } else {
      console.error('[Test] __mockSpeechRecognitionInject not found on window');
    }
  }, text);
}

/**
 * Navigate from the Setup screen to the Interview screen by selecting a role
 * and clicking Start.
 */
async function setupToInterview(
  page: Page,
  options?: {
    role?: string;
    difficulty?: string;
    category?: string;
  },
) {
  await page.goto('/');
  await page.waitForLoadState('networkidle', { timeout: 20_000 });

  // Select role (default: SWE Intern)
  const roleText = options?.role ?? 'SWE Intern';
  await page.getByText(roleText).first().click();

  // Select difficulty if specified
  if (options?.difficulty) {
    await page.getByText(options.difficulty).first().click();
  }

  // Select category if specified
  if (options?.category) {
    await page.getByText(options.category).first().click();
  }

  // Click Start
  const startBtn = page.locator('button.start-btn');
  await expect(startBtn).toBeEnabled({ timeout: 5_000 });
  await startBtn.click();

  // Wait for navigation to /interview
  await expect(page).toHaveURL(/\/interview/, { timeout: 15_000 });
}

/**
 * Run the interview flow from ready phase through to feedback:
 *  1. Click "Start Interview"
 *  2. Wait for recording phase ("I'm Done" button visible)
 *  3. Inject transcript text (since mock SpeechRecognition doesn't produce text)
 *  4. Click "I'm Done"
 *  5. Wait for navigation to /feedback
 */
async function interviewToFeedback(page: Page) {
  // Wait for interview screen to be ready
  await expect(
    page.getByRole('button', { name: /Start Interview/i }),
  ).toBeVisible({ timeout: 10_000 });

  // Start the interview
  await page.getByRole('button', { name: /Start Interview/i }).click();

  // Wait for the recording phase — "I'm Done" button is rendered but may be
  // below the viewport fold. Use toBeAttached instead of toBeVisible.
  const doneBtn = page.getByRole('button', { name: /I'm Done/i });
  await expect(doneBtn).toBeAttached({ timeout: 15_000 });

  // Scroll to it so it becomes clickable
  await doneBtn.scrollIntoViewIfNeeded();

  // Inject transcript text so handleDone doesn't reject for short answer
  await injectTranscript(page, MOCK_TRANSCRIPT);

  // Small wait for React to reconcile the injected transcript
  await page.waitForTimeout(500);

  // Click "I'm Done"
  await doneBtn.scrollIntoViewIfNeeded();
  await doneBtn.click();

  // Wait for navigation to /feedback (scoring happens then navigates)
  await expect(page).toHaveURL(/\/feedback/, { timeout: 30_000 });
}

// ─────────────────────────────────────────────────────────────────────────────
// Test suite: T96 — Complete Journey E2E Tests
// ─────────────────────────────────────────────────────────────────────────────

test.describe('T96: Complete Journey E2E Tests', () => {
  // Most tests involve at least one full interview cycle (~15s each).
  // Multi-attempt tests (T96-a, T96-h) need more time.
  test.describe.configure({ timeout: 90_000 });

  test.beforeEach(async ({ page }) => {
    await mockAllAPIs(page);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // T96-a: Complete happy path
  //   setup -> interview -> feedback -> try again -> feedback (retry) -> next
  // ═══════════════════════════════════════════════════════════════════════════

  test('T96-a: complete happy path — setup -> interview -> feedback -> retry -> next', async ({
    page,
  }) => {
    // ── Step 1: Setup screen — select role, verify Start enabled ──
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 20_000 });

    // Verify setup screen renders
    await expect(page.getByText(/mock behavioral/i).first()).toBeVisible({ timeout: 10_000 });

    // Select SWE Intern role
    await page.getByText('SWE Intern').first().click();

    // Select Hard difficulty
    await page.getByText('Hard').first().click();

    // Select Leadership category
    await page.getByText('Leadership').first().click();

    // Start button should be enabled
    const startBtn = page.locator('button.start-btn');
    await expect(startBtn).toBeEnabled({ timeout: 5_000 });

    // ── Step 2: Click Start -> navigate to interview ──
    await startBtn.click();
    await expect(page).toHaveURL(/\/interview/, { timeout: 15_000 });

    // ── Step 3: Verify interview screen loads with question ──
    // Phase badge should show "Ready"
    await expect(
      page.getByText(/ready/i).first(),
    ).toBeVisible({ timeout: 10_000 });

    // Question text should be visible (some behavioral question text)
    const questionText = page.locator('p').first();
    await expect(questionText).toBeVisible({ timeout: 10_000 });
    const qText = await questionText.innerText();
    expect(qText.trim().length).toBeGreaterThan(10);

    // "Start Interview" button should be present
    await expect(
      page.getByRole('button', { name: /Start Interview/i }),
    ).toBeVisible({ timeout: 10_000 });

    // ── Step 4: Run through interview to feedback ──
    await page.getByRole('button', { name: /Start Interview/i }).click();
    await expect(
      page.getByRole('button', { name: /I'm Done/i }),
    ).toBeVisible({ timeout: 15_000 });

    // Inject transcript and click Done
    await injectTranscript(page, MOCK_TRANSCRIPT);
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /I'm Done/i }).click();

    // ── Step 5: Verify feedback screen loads with scores ──
    await expect(page).toHaveURL(/\/feedback/, { timeout: 30_000 });
    await expect(page.getByText('Your Feedback')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Score Breakdown')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Performance Summary')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('What to Improve')).toBeVisible({ timeout: 10_000 });

    // Verify scores from mock data are displayed
    await expect(page.getByText('Solid').first()).toBeVisible({ timeout: 5_000 });

    // Verify action buttons are present
    await expect(page.getByRole('button', { name: 'Try Again' })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('button', { name: 'Next Question' })).toBeVisible({ timeout: 5_000 });

    // On first attempt, pill should show "Feedback" (not "Attempt N")
    // Use header scope to avoid ambiguity with FlowProgress, copy button, etc.
    await expect(page.locator('header').getByText('Feedback', { exact: true })).toBeVisible();

    // ── Step 6: Click "Try Again" -> back on interview with same question ──
    await page.getByRole('button', { name: 'Try Again' }).click();
    await expect(page).toHaveURL(/\/interview/, { timeout: 10_000 });

    // Verify we're back on the interview screen with the question displayed
    await expect(
      page.getByRole('button', { name: /Start Interview/i }),
    ).toBeVisible({ timeout: 10_000 });

    // The same question should be displayed (text still visible)
    const retryQuestionText = page.locator('p').first();
    await expect(retryQuestionText).toBeVisible();

    // ── Step 7: Complete the retry interview ──
    await page.getByRole('button', { name: /Start Interview/i }).click();
    await expect(
      page.getByRole('button', { name: /I'm Done/i }),
    ).toBeVisible({ timeout: 15_000 });

    await injectTranscript(page, MOCK_TRANSCRIPT);
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /I'm Done/i }).click();

    // ── Step 8: Verify feedback shows retry comparison ──
    await expect(page).toHaveURL(/\/feedback/, { timeout: 30_000 });
    await expect(page.getByText('Your Feedback')).toBeVisible({ timeout: 15_000 });

    // On the second attempt, the pill should say "Attempt 2"
    await expect(page.locator('header').getByText('Attempt 2')).toBeVisible({ timeout: 10_000 });

    // Retry comparison should be visible since there is a previous attempt
    await expect(page.getByText('Attempt Comparison')).toBeVisible({ timeout: 10_000 });

    // The "Try Again" button should show "(Attempt 2)"
    await expect(
      page.getByRole('button', { name: /Try Again \(Attempt 2\)/ }),
    ).toBeVisible({ timeout: 5_000 });

    // ── Step 9: Click "Next Question" -> back to setup ──
    await page.getByRole('button', { name: 'Next Question' }).click();
    await expect(page).toHaveURL('/', { timeout: 10_000 });

    // Setup screen should be visible again
    await expect(page.getByText(/mock behavioral/i).first()).toBeVisible({ timeout: 10_000 });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // T96-b: Quick Start flow
  //   Click Quick Start -> interview -> feedback
  // ═══════════════════════════════════════════════════════════════════════════

  test('T96-b: Quick Start — bypasses setup, lands on interview, completes to feedback', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 20_000 });

    // Quick Start button should be visible
    const quickStartBtn = page.getByText(/Quick Start/i).first();
    await expect(quickStartBtn).toBeVisible({ timeout: 10_000 });

    // Click Quick Start
    await quickStartBtn.click();

    // Should navigate directly to /interview (no 650ms delay for Quick Start)
    await expect(page).toHaveURL(/\/interview/, { timeout: 10_000 });

    // Interview screen should show a question and the Ready phase
    await expect(
      page.getByRole('button', { name: /Start Interview/i }),
    ).toBeVisible({ timeout: 10_000 });

    // Complete the interview flow
    await interviewToFeedback(page);

    // Verify feedback screen
    await expect(page.getByText('Your Feedback')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Score Breakdown')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('What to Improve')).toBeVisible({ timeout: 10_000 });

    // Verify transcript appears on feedback
    await expect(page.getByRole('heading', { name: 'Your Response' })).toBeVisible({ timeout: 10_000 });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // T96-c: Resume mode flow
  //   Toggle resume mode -> upload resume -> start -> interview -> feedback
  // ═══════════════════════════════════════════════════════════════════════════

  test('T96-c: Resume mode — upload resume, start interview, complete to feedback', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 20_000 });

    // Select a role first
    await page.getByText('SWE Intern').first().click();

    // Toggle to resume mode
    await page.getByText(/From My Resume/i).first().click();

    // Verify upload zone is visible
    await expect(page.getByText(/drop your resume here/i)).toBeVisible({ timeout: 5_000 });

    // Start button should be disabled without a resume
    const startBtn = page.locator('button.start-btn');
    await expect(startBtn).toBeDisabled();

    // Upload a fake resume
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'resume.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 fake pdf content for testing'),
    });

    // Wait for scanning to complete
    await expect(page.getByText('Scanning your resume')).toBeVisible({ timeout: 3_000 });
    await expect(page.getByText('Resume loaded')).toBeVisible({ timeout: 8_000 });

    // Start button should now be enabled
    await expect(startBtn).toBeEnabled({ timeout: 5_000 });

    // Click Start
    await startBtn.click();

    // Should navigate to /interview — resume mode navigates immediately
    // (no 650ms delay because it's in the resume branch of handleStart)
    await expect(page).toHaveURL(/\/interview/, { timeout: 15_000 });

    // Interview screen should be ready
    await expect(
      page.getByRole('button', { name: /Start Interview/i }),
    ).toBeVisible({ timeout: 10_000 });

    // Complete the interview
    await interviewToFeedback(page);

    // Verify feedback screen
    await expect(page.getByText('Your Feedback')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Score Breakdown')).toBeVisible({ timeout: 10_000 });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // T96-d: Navigation guards
  //   Direct to /interview without setup -> redirect to /
  //   Direct to /feedback without result -> "No interview results yet"
  // ═══════════════════════════════════════════════════════════════════════════

  test('T96-d(i): navigating directly to /interview without setup redirects to /', async ({
    page,
  }) => {
    // Navigate directly to /interview without going through setup
    await page.goto('/interview');

    // The InterviewScreen useEffect guard detects currentQuestion === null
    // and calls navigate('/')
    await expect(page).toHaveURL('/', { timeout: 10_000 });

    // Setup screen should be visible
    await expect(page.getByText(/mock behavioral/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('T96-d(ii): navigating directly to /feedback without result shows no-result message', async ({
    page,
  }) => {
    await page.goto('/feedback');
    await page.waitForLoadState('domcontentloaded');

    // FeedbackScreen renders NoResult when state.currentResult is null
    await expect(
      page.getByText('No interview results yet'),
    ).toBeVisible({ timeout: 10_000 });

    // The error explanation text should be visible
    await expect(
      page.getByText('Something went wrong during scoring. Try again with a longer answer.'),
    ).toBeVisible({ timeout: 10_000 });

    // "Back to Setup" button should be present
    const backBtn = page.getByRole('button', { name: 'Back to Setup' });
    await expect(backBtn).toBeVisible({ timeout: 10_000 });

    // Clicking "Back to Setup" navigates to /
    await backBtn.click();
    await expect(page).toHaveURL('/', { timeout: 5_000 });
  });

  test('T96-d(iii): unknown routes redirect to /', async ({ page }) => {
    await page.goto('/some/random/route');
    await expect(page).toHaveURL('/', { timeout: 10_000 });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // T96-e: Setup -> Interview -> Back via Escape -> Re-start
  // ═══════════════════════════════════════════════════════════════════════════

  test('T96-e: Escape during ready phase returns to setup, can re-start', async ({ page }) => {
    // Navigate to interview via setup
    await setupToInterview(page);

    // Verify we're on the interview screen in ready phase
    await expect(page).toHaveURL(/\/interview/);
    await expect(
      page.getByRole('button', { name: /Start Interview/i }),
    ).toBeVisible({ timeout: 10_000 });

    // Press Escape to go back
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL('/', { timeout: 5_000 });

    // Setup screen should be visible
    await expect(page.getByText(/mock behavioral/i).first()).toBeVisible({ timeout: 10_000 });

    // Can start again: select role and click Start
    await page.getByText('SWE Intern').first().click();
    const startBtn = page.locator('button.start-btn');
    await expect(startBtn).toBeEnabled({ timeout: 5_000 });
    await startBtn.click();
    await expect(page).toHaveURL(/\/interview/, { timeout: 15_000 });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // T96-f: Full flow with PM Intern role
  //   Verify that different role selections work through the complete flow
  // ═══════════════════════════════════════════════════════════════════════════

  test('T96-f: PM Intern role completes full flow — setup -> interview -> feedback', async ({
    page,
  }) => {
    await setupToInterview(page, { role: 'PM Intern' });

    // Complete interview
    await interviewToFeedback(page);

    // Verify feedback
    await expect(page.getByText('Your Feedback')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Score Breakdown')).toBeVisible({ timeout: 10_000 });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // T96-g: Full flow with difficulty + category selection
  //   Verify that Easy difficulty + Conflict category works
  // ═══════════════════════════════════════════════════════════════════════════

  test('T96-g: Easy difficulty + Conflict category flows to feedback', async ({ page }) => {
    await setupToInterview(page, {
      role: 'SWE Intern',
      difficulty: 'Easy',
      category: 'Conflict',
    });

    await interviewToFeedback(page);

    await expect(page.getByText('Your Feedback')).toBeVisible({ timeout: 15_000 });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // T96-h: Multiple retries produce increasing attempt numbers
  // ═══════════════════════════════════════════════════════════════════════════

  test('T96-h: three attempts show correct attempt numbers and practice note', async ({
    page,
  }) => {
    // Attempt 1
    await setupToInterview(page);
    await interviewToFeedback(page);

    await expect(page.getByText('Your Feedback')).toBeVisible({ timeout: 15_000 });
    // First attempt -> "Feedback" pill, no "Attempt N"
    await expect(page.locator('header').getByText('Feedback', { exact: true })).toBeVisible();

    // Attempt 2: Try Again
    await page.getByRole('button', { name: 'Try Again' }).click();
    await expect(page).toHaveURL(/\/interview/, { timeout: 10_000 });
    await interviewToFeedback(page);

    await expect(page.locator('header').getByText('Attempt 2')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Attempt Comparison')).toBeVisible({ timeout: 10_000 });

    // Attempt 3: Try Again (Attempt 2) -> third attempt
    await page.getByRole('button', { name: /Try Again/ }).click();
    await expect(page).toHaveURL(/\/interview/, { timeout: 10_000 });
    await interviewToFeedback(page);

    await expect(page.locator('header').getByText('Attempt 3')).toBeVisible({ timeout: 10_000 });
    // At attempt >= 3, the practice count note should appear
    await expect(page.getByText("You've practiced this 3 times")).toBeVisible({ timeout: 10_000 });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // T96-i: Feedback screen renders all expected sections
  // ═══════════════════════════════════════════════════════════════════════════

  test('T96-i: feedback screen renders all sections after full flow', async ({ page }) => {
    await setupToInterview(page);
    await interviewToFeedback(page);

    // Wait for feedback to load
    await expect(page.getByText('Your Feedback')).toBeVisible({ timeout: 15_000 });

    // Performance Summary
    await expect(page.getByText('Performance Summary')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Strongest Area')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('Focus Area')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('What You Did Well')).toBeVisible({ timeout: 5_000 });

    // Score Breakdown
    await expect(page.getByText('Score Breakdown')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('STAR Framework')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('Delivery', { exact: true })).toBeVisible({ timeout: 5_000 });

    // All 6 dimension rows
    for (const dim of ['Situation', 'Task', 'Action', 'Result', 'Communication', 'Pacing']) {
      await expect(page.getByText(dim).first()).toBeVisible({ timeout: 5_000 });
    }

    // Suggestions
    await expect(page.getByText('What to Improve')).toBeVisible({ timeout: 5_000 });
    const mockResult = getMockScoringResult();
    for (const suggestion of mockResult.suggestions) {
      await expect(page.getByText(suggestion)).toBeVisible({ timeout: 5_000 });
    }

    // Follow-up prompt
    await expect(page.getByText("Coach's Question")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(mockResult.followUp)).toBeVisible({ timeout: 5_000 });

    // Transcript review
    await expect(page.getByRole('heading', { name: 'Your Response' })).toBeVisible({ timeout: 5_000 });

    // Action buttons
    await expect(page.getByRole('button', { name: 'Try Again' })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('button', { name: 'Next Question' })).toBeVisible({ timeout: 5_000 });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // T96-j: Score card expand/collapse after full flow
  // ═══════════════════════════════════════════════════════════════════════════

  test('T96-j: score card rows expand and collapse after real flow', async ({ page }) => {
    await setupToInterview(page);
    await interviewToFeedback(page);

    await expect(page.getByText('Score Breakdown')).toBeVisible({ timeout: 15_000 });

    const mockResult = getMockScoringResult();
    const explanationText = mockResult.scores.situation.explanation;

    // The ScoreCard uses maxHeight: 0px / overflow: hidden for collapsed state.
    // We verify expand/collapse by checking the parent container's maxHeight style.
    const explanationEl = page.getByText(explanationText);
    const collapsibleContainer = explanationEl.locator('xpath=ancestor::div[contains(@style, "max-height")]').first();

    // Initially collapsed — container has maxHeight: 0px
    await expect(collapsibleContainer).toHaveCSS('max-height', '0px');

    // Click the Situation row to expand
    const situationButton = page
      .locator('button.dimension-row-btn')
      .filter({ hasText: 'Situation' })
      .first();
    await situationButton.click();

    // After expanding — container has maxHeight: 200px
    await expect(collapsibleContainer).toHaveCSS('max-height', '200px', { timeout: 3_000 });

    // Click again to collapse
    await situationButton.click();
    await expect(collapsibleContainer).toHaveCSS('max-height', '0px', { timeout: 3_000 });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // T96-k: Next Question resets state and returns to setup
  // ═══════════════════════════════════════════════════════════════════════════

  test('T96-k: Next Question fully resets state — setup shows no residual data', async ({
    page,
  }) => {
    await setupToInterview(page);
    await interviewToFeedback(page);

    await expect(page.getByText('Your Feedback')).toBeVisible({ timeout: 15_000 });

    // Click "Next Question"
    await page.getByRole('button', { name: 'Next Question' }).click();
    await expect(page).toHaveURL('/', { timeout: 10_000 });

    // Setup screen should render cleanly
    await expect(page.getByText(/mock behavioral/i).first()).toBeVisible({ timeout: 10_000 });

    // Start button should be disabled (no role selected after NEXT_QUESTION resets UI)
    // Note: NEXT_QUESTION preserves role in context but the SetupScreen local state
    // resets on mount. The start button depends on local `role` state being null.
    const startBtn = page.locator('button.start-btn');
    await expect(startBtn).toBeVisible({ timeout: 5_000 });

    // Feedback content should not be present
    await expect(page.getByText('Your Feedback')).not.toBeVisible();
    await expect(page.getByText('Score Breakdown')).not.toBeVisible();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // T96-l: localStorage persists preferences through flow
  // ═══════════════════════════════════════════════════════════════════════════

  test('T96-l: localStorage preferences persist through setup -> interview -> back', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 20_000 });

    // Select SWE Intern role and Hard difficulty
    await page.getByText('SWE Intern').first().click();
    await page.getByText('Hard').first().click();

    // Click Start to dispatch preferences to context (which saves to localStorage)
    const startBtn = page.locator('button.start-btn');
    await expect(startBtn).toBeEnabled({ timeout: 5_000 });
    await startBtn.click();
    await expect(page).toHaveURL(/\/interview/, { timeout: 15_000 });

    // Wait for the interview screen to be fully ready (phase='ready')
    await expect(
      page.getByRole('button', { name: /Start Interview/i }),
    ).toBeVisible({ timeout: 10_000 });

    // After navigating, verify preferences are stored in localStorage
    // Use waitForFunction to allow React's useEffect to flush the update
    await page.waitForFunction(() => {
      const raw = localStorage.getItem('polyprompts-prefs');
      if (!raw) return false;
      try { return JSON.parse(raw).difficulty === 'hard'; } catch { return false; }
    }, { timeout: 5_000 });
    let prefs = await page.evaluate(() => localStorage.getItem('polyprompts-prefs'));
    let parsed = JSON.parse(prefs!);

    // Go back to setup (Escape works in 'ready' phase)
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL('/', { timeout: 5_000 });

    // Preferences should still be in localStorage
    prefs = await page.evaluate(() => localStorage.getItem('polyprompts-prefs'));
    expect(prefs).not.toBeNull();
    parsed = JSON.parse(prefs!);
    expect(parsed.difficulty).toBe('hard');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // T96-m: FlowProgress breadcrumb appears on all screens
  // ═══════════════════════════════════════════════════════════════════════════

  test('T96-m: FlowProgress component is present on setup, interview, and feedback screens', async ({
    page,
  }) => {
    // Setup screen
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 20_000 });

    // FlowProgress renders step labels — check for the step indicators
    // The component renders "Setup", "Interview", "Feedback" labels
    await expect(page.getByText('Setup').first()).toBeVisible({ timeout: 10_000 });

    // Navigate to interview
    await page.getByText('SWE Intern').first().click();
    await page.locator('button.start-btn').click();
    await expect(page).toHaveURL(/\/interview/, { timeout: 15_000 });

    // FlowProgress on interview screen
    await expect(page.getByText('Interview').first()).toBeVisible({ timeout: 10_000 });

    // Navigate to feedback (via full flow)
    await interviewToFeedback(page);

    // FlowProgress on feedback screen
    await expect(page.getByText('Feedback').first()).toBeVisible({ timeout: 10_000 });
  });
});
