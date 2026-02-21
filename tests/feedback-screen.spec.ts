/**
 * feedback-screen.spec.ts
 *
 * Playwright tests for FeedbackScreen (/feedback).
 *
 * Architecture note
 * -----------------
 * FeedbackScreen reads state entirely from InterviewContext, which is a
 * React useReducer living in memory.  There is no way to hydrate it from
 * localStorage or the URL.  The two viable strategies are:
 *
 *  A) Navigate to /feedback with no prior state → exercises the NoResult
 *     fallback branch (state.currentResult === null).
 *
 *  B) Inject mock state into the app via page.addInitScript BEFORE the
 *     bundle loads: we monkey-patch the React context dispatch so that
 *     the very first render already contains a result.  The cleanest
 *     hook point available without modifying production code is to
 *     intercept the OpenAI fetch and drive the full recording → scoring
 *     → feedback flow inside the test.
 *
 * For the full-results tests we use strategy B: mock all network
 * requests that the app makes and programmatically advance the interview
 * flow via the UI.  State injection into the React context is achieved by
 * exposing the dispatch on `window.__interviewDispatch__` through
 * page.addInitScript, which patches the InterviewContext module before
 * the app mounts.
 *
 * Test IDs
 * --------
 *  T114 – no-result state
 *  T115 – all feedback components render with mock data
 *  T116 – retry comparison section
 *  T117 – score card interaction (expand/collapse)
 *  T118 – navigation (Try Again, Next Question)
 *  T119 – loading (scoring) state
 *  T120 – transcript review content
 *  T121 – performance summary content
 */

import { test, expect, type Page } from '@playwright/test';
import { mockMediaAPIs, getMockScoringResult } from './helpers';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Installs an init script that:
 *  1. Intercepts the InterviewProvider's useReducer and stores a reference
 *     to `dispatch` on `window.__interviewDispatch__`.
 *  2. Stores the initial `setState` override so tests can inject an
 *     arbitrary InterviewState before the first render settles.
 *
 * Because Vite bundles everything, we cannot import the context module
 * directly.  Instead we intercept React.useReducer at the call site by
 * patching `React.useReducer` on `window.React` — but React is not
 * typically on window in a Vite app.
 *
 * The practical alternative (no source changes) is to drive the real UI
 * and mock the network.  That is what `setupMockedFlow` does below.
 */

async function mockOpenAIRoutes(page: Page) {
  const mockResult = getMockScoringResult();

  // Intercept every OpenAI API request (the SDK calls api.openai.com directly
  // because dangerouslyAllowBrowser: true is set in openai.ts).
  await page.route('**api.openai.com/**', async (route) => {
    const url = route.request().url();

    if (url.includes('chat/completions')) {
      // Covers both pause-analysis and scoring calls.
      // For pause analysis the mock returns "done" so the flow advances immediately.
      // For scoring it returns the full mock result.
      const postBody = route.request().postDataJSON() as Record<string, unknown> | null;
      const messages = (postBody?.messages as Array<{ role: string; content: string }>) ?? [];
      const isScoring = messages.some(
        (m) => typeof m.content === 'string' && m.content.includes('STAR framework'),
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
        // Pause analysis — always say "done" so the interview ends immediately.
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            choices: [{ message: { content: JSON.stringify({ verdict: 'done' }) } }],
          }),
        });
      }
    } else if (url.includes('audio/speech')) {
      // TTS — return a minimal valid MP3 (44 bytes ID3 + silence frame).
      await route.fulfill({
        status: 200,
        contentType: 'audio/mpeg',
        body: Buffer.alloc(128),
      });
    } else if (url.includes('audio/transcriptions')) {
      // Whisper transcription
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ text: 'Mock transcribed answer for testing purposes.' }),
      });
    } else {
      await route.continue();
    }
  });
}

/**
 * Inject mock state directly into the running React app by dispatching
 * SET_QUESTION and SET_RESULT actions via the window-exposed dispatch that
 * the app sets up in dev/test mode, OR by using page.evaluate to reach the
 * React fiber tree.
 *
 * The most reliable cross-bundle approach: navigate to /feedback while the
 * InterviewContext already has a result.  We achieve this by reaching into
 * the React fiber and setting state, which is fragile in production but
 * works fine for development/Playwright builds.
 */
async function injectMockResultViaFiber(page: Page) {
  const mockResult = getMockScoringResult();
  const mockQuestion = {
    id: 'q-test-1',
    text: 'Tell me about a time you led a project under tight deadlines.',
    role: 'swe_intern',
    difficulty: 'medium',
    category: 'leadership',
  };

  await page.evaluate(
    ({ result, question }) => {
      // Walk the React fiber tree starting from the root container to find the
      // InterviewContext provider fiber, then trigger a forced state update.
      // This works because React stores fiber metadata on DOM nodes via the
      // __reactFiber$... / __reactContainer$... property.
      function getFiberRoot(el: Element) {
        const key = Object.keys(el).find(
          (k) => k.startsWith('__reactContainer') || k.startsWith('__reactFiber'),
        );
        // @ts-ignore
        return key ? el[key] : null;
      }

      function findContextProviderDispatch(fiber: unknown): ((a: unknown) => void) | null {
        if (!fiber) return null;
        const f = fiber as Record<string, unknown>;

        // Check if this fiber has memoizedState with a queue that has dispatch
        // characteristic of useReducer (InterviewProvider uses useReducer).
        if (
          f.memoizedState &&
          typeof (f.memoizedState as Record<string, unknown>).queue === 'object'
        ) {
          const queue = (f.memoizedState as Record<string, unknown>).queue as Record<
            string,
            unknown
          >;
          if (typeof queue.dispatch === 'function') {
            return queue.dispatch as (a: unknown) => void;
          }
        }

        // Walk child and sibling fibers
        const childResult = findContextProviderDispatch(f.child as unknown);
        if (childResult) return childResult;
        const siblingResult = findContextProviderDispatch(f.sibling as unknown);
        if (siblingResult) return siblingResult;
        return null;
      }

      const root = document.getElementById('root');
      if (!root) return;

      const fiberRoot = getFiberRoot(root);
      if (!fiberRoot) return;

      const dispatch = findContextProviderDispatch(fiberRoot);
      if (!dispatch) return;

      // Dispatch actions to hydrate context state with our mock data
      dispatch({ type: 'SET_QUESTION', payload: question });
      dispatch({
        type: 'UPDATE_TRANSCRIPT',
        payload: 'I led a cross-functional team of five engineers to deliver the feature in two weeks.',
      });
      dispatch({ type: 'SET_RESULT', payload: result });
    },
    { result: mockResult, question: mockQuestion },
  );

  // Wait for React to reconcile and re-render
  await page.waitForTimeout(200);
}

/**
 * Navigate to the feedback screen with mock state already injected.
 * Because the state lives in memory (React context), we must:
 *  1. Load the app at any route.
 *  2. Inject state.
 *  3. Navigate to /feedback client-side (using React Router's history API).
 */
async function navigateToFeedbackWithMockState(page: Page) {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  // Wait for React to mount
  await page.waitForSelector('#root > *', { timeout: 10000 });

  await injectMockResultViaFiber(page);

  // Client-side navigation to /feedback preserves in-memory React state
  await page.evaluate(() => {
    window.history.pushState({}, '', '/feedback');
    window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
  });

  // Wait for the feedback screen heading to appear
  await page.waitForSelector('text=Your Feedback', { timeout: 10000 });
}

// ---------------------------------------------------------------------------
// T114 — No-result state
// ---------------------------------------------------------------------------

test.describe('T114: No-result state', () => {
  test('shows "No interview results yet" when navigating directly to /feedback', async ({
    page,
  }) => {
    // Navigate directly without any prior interview state
    await page.goto('/feedback');
    await page.waitForLoadState('domcontentloaded');

    // The component renders NoResult when state.currentResult is null
    await expect(page.getByText('No interview results yet')).toBeVisible({ timeout: 10000 });
  });

  test('shows error explanation text in no-result state', async ({ page }) => {
    await page.goto('/feedback');
    await page.waitForLoadState('domcontentloaded');

    await expect(
      page.getByText('Something went wrong during scoring. Try again with a longer answer.'),
    ).toBeVisible({ timeout: 10000 });
  });

  test('shows "Back to Setup" button in no-result state', async ({ page }) => {
    await page.goto('/feedback');
    await page.waitForLoadState('domcontentloaded');

    const backButton = page.getByRole('button', { name: 'Back to Setup' });
    await expect(backButton).toBeVisible({ timeout: 10000 });
  });

  test('"Back to Setup" button navigates to / from no-result state', async ({ page }) => {
    await page.goto('/feedback');
    await page.waitForLoadState('domcontentloaded');

    const backButton = page.getByRole('button', { name: 'Back to Setup' });
    await backButton.click();

    // Should navigate to root — wait for the setup screen to appear
    await expect(page).toHaveURL('/', { timeout: 5000 });
  });

  test('does not show feedback components in no-result state', async ({ page }) => {
    await page.goto('/feedback');
    await page.waitForLoadState('domcontentloaded');

    // None of the result-specific sections should appear
    await expect(page.getByText('Your Feedback')).not.toBeVisible();
    await expect(page.getByText('Score Breakdown')).not.toBeVisible();
    await expect(page.getByText('What to Improve')).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// T115 — Full results: all feedback components render
// ---------------------------------------------------------------------------

test.describe('T115: Full results display', () => {
  test.beforeEach(async ({ page }) => {
    await navigateToFeedbackWithMockState(page);
  });

  test('renders "Your Feedback" heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Your Feedback' })).toBeVisible();
  });

  test('renders "Feedback" label pill', async ({ page }) => {
    // The header shows "Feedback" pill on first attempt
    const feedbackPill = page.getByText('Feedback');
    await expect(feedbackPill).toBeVisible();
  });

  test('PerformanceSummary: renders "Performance Summary" heading', async ({ page }) => {
    await expect(page.getByText('Performance Summary')).toBeVisible();
  });

  test('PerformanceSummary: renders overall summary text', async ({ page }) => {
    const mockResult = getMockScoringResult();
    // The overallSummary from our mock is visible in the PerformanceSummary card
    await expect(page.getByText(mockResult.overallSummary)).toBeVisible();
  });

  test('PerformanceSummary: shows "Strongest Area" label', async ({ page }) => {
    await expect(page.getByText('Strongest Area')).toBeVisible();
  });

  test('PerformanceSummary: shows "Focus Area" label', async ({ page }) => {
    await expect(page.getByText('Focus Area')).toBeVisible();
  });

  test('PerformanceSummary: strongest dimension is "Action" (from mock data)', async ({
    page,
  }) => {
    // Mock data: strongestDimension = 'action' → label = 'Action'
    // It appears inside the strongest card
    const strongestCard = page.locator('div').filter({ hasText: 'Strongest Area' }).first();
    await expect(strongestCard).toContainText('Action');
  });

  test('PerformanceSummary: focus dimension is "Task" (from mock data)', async ({ page }) => {
    // Mock data: weakestDimension = 'task' → label = 'Task'
    const focusCard = page.locator('div').filter({ hasText: 'Focus Area' }).first();
    await expect(focusCard).toContainText('Task');
  });

  test('PerformanceSummary: renders "What You Did Well" section', async ({ page }) => {
    await expect(page.getByText('What You Did Well')).toBeVisible();
  });

  test('PerformanceSummary: renders positive callouts from mock data', async ({ page }) => {
    const mockResult = getMockScoringResult();
    await expect(page.getByText(mockResult.positiveCallouts[0])).toBeVisible();
    await expect(page.getByText(mockResult.positiveCallouts[1])).toBeVisible();
  });

  test('ScoreCard: renders "Score Breakdown" heading', async ({ page }) => {
    await expect(page.getByText('Score Breakdown')).toBeVisible();
  });

  test('ScoreCard: renders "STAR Framework" section label', async ({ page }) => {
    await expect(page.getByText('STAR Framework')).toBeVisible();
  });

  test('ScoreCard: renders "Delivery" section label', async ({ page }) => {
    await expect(page.getByText('Delivery')).toBeVisible();
  });

  test('ScoreCard: renders all 6 dimension rows', async ({ page }) => {
    // Each dimension row has a label: S, T, A, R, C, P
    await expect(page.getByText('Situation')).toBeVisible();
    await expect(page.getByText('Task')).toBeVisible();
    await expect(page.getByText('Action')).toBeVisible();
    await expect(page.getByText('Result')).toBeVisible();
    await expect(page.getByText('Communication')).toBeVisible();
    await expect(page.getByText('Pacing')).toBeVisible();
  });

  test('ScoreCard: renders score level labels from mock data', async ({ page }) => {
    // Mock: situation=Solid, task=Developing, action=Strong, result=Solid
    // Levels appear as text inside the dimension row buttons
    const solidMatches = page.getByText('Solid');
    await expect(solidMatches.first()).toBeVisible();

    const developingMatches = page.getByText('Developing');
    await expect(developingMatches.first()).toBeVisible();

    const strongMatches = page.getByText('Strong');
    await expect(strongMatches.first()).toBeVisible();
  });

  test('ScoreCard: renders progress bars with aria-label', async ({ page }) => {
    // ProgressBar has role="progressbar" with aria-label="Score level: <level>"
    const progressBars = page.getByRole('progressbar');
    await expect(progressBars).toHaveCount(6);
  });

  test('SuggestionsList: renders "What to Improve" heading', async ({ page }) => {
    await expect(page.getByText('What to Improve')).toBeVisible();
  });

  test('SuggestionsList: renders all 3 suggestions from mock data', async ({ page }) => {
    const mockResult = getMockScoringResult();
    for (const suggestion of mockResult.suggestions) {
      await expect(page.getByText(suggestion)).toBeVisible();
    }
  });

  test('SuggestionsList: renders numbered suggestion labels', async ({ page }) => {
    await expect(page.getByText('Suggestion 1')).toBeVisible();
    await expect(page.getByText('Suggestion 2')).toBeVisible();
    await expect(page.getByText('Suggestion 3')).toBeVisible();
  });

  test("FollowUpPrompt: renders \"Coach's Question\" label", async ({ page }) => {
    await expect(page.getByText("Coach's Question")).toBeVisible();
  });

  test('FollowUpPrompt: renders follow-up question text from mock data', async ({ page }) => {
    const mockResult = getMockScoringResult();
    await expect(page.getByText(mockResult.followUp)).toBeVisible();
  });

  test('FollowUpPrompt: renders "Reflect on this before your next attempt" hint', async ({
    page,
  }) => {
    await expect(page.getByText('Reflect on this before your next attempt')).toBeVisible();
  });

  test('TranscriptReview: renders "Your Response" heading', async ({ page }) => {
    // h3 text is "Your Response"
    await expect(page.getByRole('heading', { name: 'Your Response' })).toBeVisible();
  });

  test('TranscriptReview: renders injected transcript text', async ({ page }) => {
    // We injected: 'I led a cross-functional team...'
    await expect(
      page.getByText('I led a cross-functional team of five engineers to deliver the feature in two weeks.'),
    ).toBeVisible();
  });

  test('ActionButtons: renders "Try Again" button', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Try Again' })).toBeVisible();
  });

  test('ActionButtons: renders "Next Question" button', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Next Question' })).toBeVisible();
  });

  test('ActionButtons: does not show attempt count note on first attempt', async ({ page }) => {
    // The note "You've practiced this N times" only shows at attemptNumber >= 3
    await expect(page.getByText(/You've practiced this/)).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// T116 — Retry comparison
// ---------------------------------------------------------------------------

test.describe('T116: Retry comparison', () => {
  test('RetryComparison is not shown on first attempt (no previousAttempts)', async ({ page }) => {
    // With no previousAttempts, RetryComparison returns null
    await navigateToFeedbackWithMockState(page);

    await expect(page.getByText('Attempt Comparison')).not.toBeVisible();
  });

  test('RetryComparison is shown when previousAttempts exist', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#root > *', { timeout: 10000 });

    const mockResult = getMockScoringResult();
    const mockQuestion = {
      id: 'q-test-1',
      text: 'Tell me about a time you led a project under tight deadlines.',
      role: 'swe_intern',
      difficulty: 'medium',
      category: 'leadership',
    };

    // Build a second (slightly different) result for the current attempt
    const secondResult = {
      ...mockResult,
      scores: {
        ...mockResult.scores,
        // Upgrade task from Developing to Solid to show improvement
        task: { level: 'Solid' as const, explanation: 'Task improved this attempt' },
      },
    };

    await page.evaluate(
      ({ question, previous, current }) => {
        function getFiberRoot(el: Element) {
          const key = Object.keys(el).find(
            (k) => k.startsWith('__reactContainer') || k.startsWith('__reactFiber'),
          );
          // @ts-ignore
          return key ? el[key] : null;
        }

        function findDispatch(fiber: unknown): ((a: unknown) => void) | null {
          if (!fiber) return null;
          const f = fiber as Record<string, unknown>;
          if (f.memoizedState && typeof (f.memoizedState as Record<string, unknown>).queue === 'object') {
            const queue = (f.memoizedState as Record<string, unknown>).queue as Record<string, unknown>;
            if (typeof queue.dispatch === 'function') return queue.dispatch as (a: unknown) => void;
          }
          return findDispatch(f.child as unknown) || findDispatch(f.sibling as unknown);
        }

        const root = document.getElementById('root');
        if (!root) return;
        const fiberRoot = getFiberRoot(root);
        if (!fiberRoot) return;
        const dispatch = findDispatch(fiberRoot);
        if (!dispatch) return;

        dispatch({ type: 'SET_QUESTION', payload: question });
        // Simulate a previous result being stored first
        dispatch({ type: 'SET_RESULT', payload: previous });
        // Then trigger a RETRY which moves current result to previousAttempts
        dispatch({ type: 'RETRY' });
        // Now set the current (second-attempt) result
        dispatch({ type: 'SET_RESULT', payload: current });
      },
      { question: mockQuestion, previous: mockResult, current: secondResult },
    );

    await page.waitForTimeout(200);

    await page.evaluate(() => {
      window.history.pushState({}, '', '/feedback');
      window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
    });

    await page.waitForSelector('text=Your Feedback', { timeout: 10000 });

    // RetryComparison should now be visible
    await expect(page.getByText('Attempt Comparison')).toBeVisible();
  });

  test('RetryComparison shows "Previous Attempt" column header on second attempt', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForSelector('#root > *', { timeout: 10000 });

    const mockResult = getMockScoringResult();
    const mockQuestion = {
      id: 'q-test-1',
      text: 'Tell me about a time you led a project under tight deadlines.',
      role: 'swe_intern',
      difficulty: 'medium',
      category: 'leadership',
    };

    await page.evaluate(
      ({ question, result }) => {
        function getFiberRoot(el: Element) {
          const key = Object.keys(el).find(
            (k) => k.startsWith('__reactContainer') || k.startsWith('__reactFiber'),
          );
          // @ts-ignore
          return key ? el[key] : null;
        }
        function findDispatch(fiber: unknown): ((a: unknown) => void) | null {
          if (!fiber) return null;
          const f = fiber as Record<string, unknown>;
          if (f.memoizedState && typeof (f.memoizedState as Record<string, unknown>).queue === 'object') {
            const queue = (f.memoizedState as Record<string, unknown>).queue as Record<string, unknown>;
            if (typeof queue.dispatch === 'function') return queue.dispatch as (a: unknown) => void;
          }
          return findDispatch(f.child as unknown) || findDispatch(f.sibling as unknown);
        }
        const root = document.getElementById('root');
        if (!root) return;
        const fiberRoot = getFiberRoot(root);
        if (!fiberRoot) return;
        const dispatch = findDispatch(fiberRoot);
        if (!dispatch) return;
        dispatch({ type: 'SET_QUESTION', payload: question });
        dispatch({ type: 'SET_RESULT', payload: result });
        dispatch({ type: 'RETRY' });
        dispatch({ type: 'SET_RESULT', payload: result });
      },
      { question: mockQuestion, result: mockResult },
    );

    await page.waitForTimeout(200);
    await page.evaluate(() => {
      window.history.pushState({}, '', '/feedback');
      window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
    });

    await page.waitForSelector('text=Attempt Comparison', { timeout: 10000 });
    await expect(page.getByText('Previous Attempt')).toBeVisible();
    await expect(page.getByText('Current Attempt')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// T117 — ScoreCard expand / collapse interaction
// ---------------------------------------------------------------------------

test.describe('T117: ScoreCard expand/collapse', () => {
  test.beforeEach(async ({ page }) => {
    await navigateToFeedbackWithMockState(page);
  });

  test('explanation text is initially hidden (collapsed)', async ({ page }) => {
    const mockResult = getMockScoringResult();
    // Situation explanation should not be visible until the row is clicked
    await expect(page.getByText(mockResult.scores.situation.explanation)).not.toBeVisible();
  });

  test('clicking a dimension row reveals the explanation', async ({ page }) => {
    const mockResult = getMockScoringResult();
    // Click the "Situation" row button — it's the button containing "Situation" label
    const situationButton = page.getByRole('button').filter({ hasText: 'Situation' }).first();
    await situationButton.click();

    // After click, the explanation should become visible
    await expect(page.getByText(mockResult.scores.situation.explanation)).toBeVisible({
      timeout: 3000,
    });
  });

  test('clicking an expanded row collapses it again', async ({ page }) => {
    const mockResult = getMockScoringResult();
    const situationButton = page.getByRole('button').filter({ hasText: 'Situation' }).first();

    // Expand
    await situationButton.click();
    await expect(page.getByText(mockResult.scores.situation.explanation)).toBeVisible({
      timeout: 3000,
    });

    // Collapse
    await situationButton.click();
    await expect(page.getByText(mockResult.scores.situation.explanation)).not.toBeVisible({
      timeout: 3000,
    });
  });

  test('can expand multiple rows independently', async ({ page }) => {
    const mockResult = getMockScoringResult();
    const situationButton = page.getByRole('button').filter({ hasText: 'Situation' }).first();
    const actionButton = page.getByRole('button').filter({ hasText: 'Action' }).first();

    await situationButton.click();
    await actionButton.click();

    await expect(page.getByText(mockResult.scores.situation.explanation)).toBeVisible();
    await expect(page.getByText(mockResult.scores.action.explanation)).toBeVisible();
  });

  test('ScoreCard: renders legend entries for all score levels', async ({ page }) => {
    await expect(page.getByText(/Getting Started \(25%\)/)).toBeVisible();
    await expect(page.getByText(/Developing \(50%\)/)).toBeVisible();
    await expect(page.getByText(/Solid \(75%\)/)).toBeVisible();
    await expect(page.getByText(/Strong \(100%\)/)).toBeVisible();
  });

  test('ScoreCard: "Click any row to read feedback" hint is visible', async ({ page }) => {
    await expect(page.getByText('Click any row to read feedback')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// T118 — Navigation from feedback screen
// ---------------------------------------------------------------------------

test.describe('T118: Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await navigateToFeedbackWithMockState(page);
  });

  test('"Try Again" button navigates to /interview', async ({ page }) => {
    const tryAgainButton = page.getByRole('button', { name: 'Try Again' });
    await tryAgainButton.click();

    await expect(page).toHaveURL('/interview', { timeout: 5000 });
  });

  test('"Next Question" button navigates to /', async ({ page }) => {
    const nextButton = page.getByRole('button', { name: 'Next Question' });
    await nextButton.click();

    await expect(page).toHaveURL('/', { timeout: 5000 });
  });

  test('"Try Again" dispatches RETRY — result is cleared on /interview', async ({ page }) => {
    const tryAgainButton = page.getByRole('button', { name: 'Try Again' });
    await tryAgainButton.click();

    // After navigating to /interview, the feedback screen should be gone
    await expect(page).toHaveURL('/interview', { timeout: 5000 });
    await expect(page.getByText('Your Feedback')).not.toBeVisible();
  });

  test('"Next Question" dispatches NEXT_QUESTION — setup screen is shown', async ({ page }) => {
    const nextButton = page.getByRole('button', { name: 'Next Question' });
    await nextButton.click();

    await expect(page).toHaveURL('/', { timeout: 5000 });
    // Setup screen should be visible (it's the root route)
    await expect(page.getByText('Your Feedback')).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// T119 — Loading (scoring) state
// ---------------------------------------------------------------------------

test.describe('T119: Loading state', () => {
  test('shows scoring loader when state.isScoring is true', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#root > *', { timeout: 10000 });

    // Inject isScoring = true into context
    await page.evaluate(() => {
      function getFiberRoot(el: Element) {
        const key = Object.keys(el).find(
          (k) => k.startsWith('__reactContainer') || k.startsWith('__reactFiber'),
        );
        // @ts-ignore
        return key ? el[key] : null;
      }
      function findDispatch(fiber: unknown): ((a: unknown) => void) | null {
        if (!fiber) return null;
        const f = fiber as Record<string, unknown>;
        if (f.memoizedState && typeof (f.memoizedState as Record<string, unknown>).queue === 'object') {
          const queue = (f.memoizedState as Record<string, unknown>).queue as Record<string, unknown>;
          if (typeof queue.dispatch === 'function') return queue.dispatch as (a: unknown) => void;
        }
        return findDispatch(f.child as unknown) || findDispatch(f.sibling as unknown);
      }
      const root = document.getElementById('root');
      if (!root) return;
      const fiberRoot = getFiberRoot(root);
      if (!fiberRoot) return;
      const dispatch = findDispatch(fiberRoot);
      if (!dispatch) return;
      // START_SCORING sets isScoring = true, currentResult = null
      dispatch({ type: 'START_SCORING' });
    });

    await page.waitForTimeout(100);

    // Client-side navigate to /feedback
    await page.evaluate(() => {
      window.history.pushState({}, '', '/feedback');
      window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
    });

    // Loader text should appear
    await expect(
      page.getByText('Your interviewer is reviewing your answer...'),
    ).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Analyzing STAR structure, delivery, and impact...')).toBeVisible();
  });

  test('loading state does not show feedback content', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#root > *', { timeout: 10000 });

    await page.evaluate(() => {
      function getFiberRoot(el: Element) {
        const key = Object.keys(el).find(
          (k) => k.startsWith('__reactContainer') || k.startsWith('__reactFiber'),
        );
        // @ts-ignore
        return key ? el[key] : null;
      }
      function findDispatch(fiber: unknown): ((a: unknown) => void) | null {
        if (!fiber) return null;
        const f = fiber as Record<string, unknown>;
        if (f.memoizedState && typeof (f.memoizedState as Record<string, unknown>).queue === 'object') {
          const queue = (f.memoizedState as Record<string, unknown>).queue as Record<string, unknown>;
          if (typeof queue.dispatch === 'function') return queue.dispatch as (a: unknown) => void;
        }
        return findDispatch(f.child as unknown) || findDispatch(f.sibling as unknown);
      }
      const root = document.getElementById('root');
      if (!root) return;
      const fiberRoot = getFiberRoot(root);
      if (!fiberRoot) return;
      const dispatch = findDispatch(fiberRoot);
      if (!dispatch) return;
      dispatch({ type: 'START_SCORING' });
    });

    await page.waitForTimeout(100);

    await page.evaluate(() => {
      window.history.pushState({}, '', '/feedback');
      window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
    });

    await page.waitForSelector('text=Your interviewer is reviewing your answer...', {
      timeout: 5000,
    });

    await expect(page.getByText('Your Feedback')).not.toBeVisible();
    await expect(page.getByText('Score Breakdown')).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// T120 — TranscriptReview content
// ---------------------------------------------------------------------------

test.describe('T120: TranscriptReview content', () => {
  test.beforeEach(async ({ page }) => {
    await navigateToFeedbackWithMockState(page);
  });

  test('shows "Your Response" section header', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Your Response' })).toBeVisible();
  });

  test('displays the transcript injected via UPDATE_TRANSCRIPT action', async ({ page }) => {
    await expect(
      page.getByText(
        'I led a cross-functional team of five engineers to deliver the feature in two weeks.',
      ),
    ).toBeVisible();
  });

  test('shows word count for the transcript', async ({ page }) => {
    // The transcript "I led a cross-functional team of five engineers to deliver the feature in two weeks."
    // is 16 words
    await expect(page.getByText('16 words')).toBeVisible();
  });

  test('shows question text in transcript context', async ({ page }) => {
    await expect(
      page.getByText('Tell me about a time you led a project under tight deadlines.'),
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// T121 — PerformanceSummary content detail
// ---------------------------------------------------------------------------

test.describe('T121: PerformanceSummary content', () => {
  test.beforeEach(async ({ page }) => {
    await navigateToFeedbackWithMockState(page);
  });

  test('shows "Overall assessment of your response" subtitle', async ({ page }) => {
    await expect(page.getByText('Overall assessment of your response')).toBeVisible();
  });

  test('renders two positive callout cards with "Highlight" labels', async ({ page }) => {
    await expect(page.getByText('Highlight 1')).toBeVisible();
    await expect(page.getByText('Highlight 2')).toBeVisible();
  });

  test('callout text matches mock positive callouts', async ({ page }) => {
    const mockResult = getMockScoringResult();
    await expect(page.getByText(mockResult.positiveCallouts[0])).toBeVisible();
    await expect(page.getByText(mockResult.positiveCallouts[1])).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// T122 — Attempt number label (second attempt header shows "Attempt 2")
// ---------------------------------------------------------------------------

test.describe('T122: Attempt number in header', () => {
  test('shows "Feedback" label on first attempt', async ({ page }) => {
    await navigateToFeedbackWithMockState(page);
    // attemptNumber = previousAttempts.length + 1 = 0 + 1 = 1 → label is "Feedback"
    await expect(page.getByText('Feedback')).toBeVisible();
    await expect(page.getByText(/Attempt \d+/)).not.toBeVisible();
  });

  test('shows "Attempt 2" label on second attempt', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#root > *', { timeout: 10000 });

    const mockResult = getMockScoringResult();
    const mockQuestion = {
      id: 'q-test-2',
      text: 'Tell me about a time you led a project under tight deadlines.',
      role: 'swe_intern',
      difficulty: 'medium',
      category: 'leadership',
    };

    await page.evaluate(
      ({ question, result }) => {
        function getFiberRoot(el: Element) {
          const key = Object.keys(el).find(
            (k) => k.startsWith('__reactContainer') || k.startsWith('__reactFiber'),
          );
          // @ts-ignore
          return key ? el[key] : null;
        }
        function findDispatch(fiber: unknown): ((a: unknown) => void) | null {
          if (!fiber) return null;
          const f = fiber as Record<string, unknown>;
          if (f.memoizedState && typeof (f.memoizedState as Record<string, unknown>).queue === 'object') {
            const queue = (f.memoizedState as Record<string, unknown>).queue as Record<string, unknown>;
            if (typeof queue.dispatch === 'function') return queue.dispatch as (a: unknown) => void;
          }
          return findDispatch(f.child as unknown) || findDispatch(f.sibling as unknown);
        }
        const root = document.getElementById('root');
        if (!root) return;
        const fiberRoot = getFiberRoot(root);
        if (!fiberRoot) return;
        const dispatch = findDispatch(fiberRoot);
        if (!dispatch) return;
        dispatch({ type: 'SET_QUESTION', payload: question });
        dispatch({ type: 'SET_RESULT', payload: result });
        dispatch({ type: 'RETRY' });
        dispatch({ type: 'SET_RESULT', payload: result });
      },
      { question: mockQuestion, result: mockResult },
    );

    await page.waitForTimeout(200);
    await page.evaluate(() => {
      window.history.pushState({}, '', '/feedback');
      window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
    });

    await page.waitForSelector('text=Your Feedback', { timeout: 10000 });
    // The pill shows "Attempt 2" when attemptNumber > 1
    await expect(page.getByText('Attempt 2')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// T123 — ActionButtons: "Try Again (Attempt N)" label on 2nd attempt
// ---------------------------------------------------------------------------

test.describe('T123: ActionButtons attempt label', () => {
  test('shows "Try Again" (no count) on first attempt', async ({ page }) => {
    await navigateToFeedbackWithMockState(page);
    await expect(page.getByRole('button', { name: 'Try Again' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Try Again \(Attempt/ })).not.toBeVisible();
  });

  test('shows "Try Again (Attempt 2)" on second attempt', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#root > *', { timeout: 10000 });

    const mockResult = getMockScoringResult();
    const mockQuestion = {
      id: 'q-test-3',
      text: 'Tell me about a time you led a project under tight deadlines.',
      role: 'swe_intern',
      difficulty: 'medium',
      category: 'leadership',
    };

    await page.evaluate(
      ({ question, result }) => {
        function getFiberRoot(el: Element) {
          const key = Object.keys(el).find(
            (k) => k.startsWith('__reactContainer') || k.startsWith('__reactFiber'),
          );
          // @ts-ignore
          return key ? el[key] : null;
        }
        function findDispatch(fiber: unknown): ((a: unknown) => void) | null {
          if (!fiber) return null;
          const f = fiber as Record<string, unknown>;
          if (f.memoizedState && typeof (f.memoizedState as Record<string, unknown>).queue === 'object') {
            const queue = (f.memoizedState as Record<string, unknown>).queue as Record<string, unknown>;
            if (typeof queue.dispatch === 'function') return queue.dispatch as (a: unknown) => void;
          }
          return findDispatch(f.child as unknown) || findDispatch(f.sibling as unknown);
        }
        const root = document.getElementById('root');
        if (!root) return;
        const fiberRoot = getFiberRoot(root);
        if (!fiberRoot) return;
        const dispatch = findDispatch(fiberRoot);
        if (!dispatch) return;
        dispatch({ type: 'SET_QUESTION', payload: question });
        dispatch({ type: 'SET_RESULT', payload: result });
        dispatch({ type: 'RETRY' });
        dispatch({ type: 'SET_RESULT', payload: result });
      },
      { question: mockQuestion, result: mockResult },
    );

    await page.waitForTimeout(200);
    await page.evaluate(() => {
      window.history.pushState({}, '', '/feedback');
      window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
    });

    await page.waitForSelector('text=Your Feedback', { timeout: 10000 });
    await expect(page.getByRole('button', { name: 'Try Again (Attempt 2)' })).toBeVisible();
  });

  test('shows practice count note after 3+ attempts', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#root > *', { timeout: 10000 });

    const mockResult = getMockScoringResult();
    const mockQuestion = {
      id: 'q-test-4',
      text: 'Tell me about a time you led a project under tight deadlines.',
      role: 'swe_intern',
      difficulty: 'medium',
      category: 'leadership',
    };

    // Simulate 3 previous attempts (so currentAttempt = 4)
    await page.evaluate(
      ({ question, result }) => {
        function getFiberRoot(el: Element) {
          const key = Object.keys(el).find(
            (k) => k.startsWith('__reactContainer') || k.startsWith('__reactFiber'),
          );
          // @ts-ignore
          return key ? el[key] : null;
        }
        function findDispatch(fiber: unknown): ((a: unknown) => void) | null {
          if (!fiber) return null;
          const f = fiber as Record<string, unknown>;
          if (f.memoizedState && typeof (f.memoizedState as Record<string, unknown>).queue === 'object') {
            const queue = (f.memoizedState as Record<string, unknown>).queue as Record<string, unknown>;
            if (typeof queue.dispatch === 'function') return queue.dispatch as (a: unknown) => void;
          }
          return findDispatch(f.child as unknown) || findDispatch(f.sibling as unknown);
        }
        const root = document.getElementById('root');
        if (!root) return;
        const fiberRoot = getFiberRoot(root);
        if (!fiberRoot) return;
        const dispatch = findDispatch(fiberRoot);
        if (!dispatch) return;
        dispatch({ type: 'SET_QUESTION', payload: question });
        // 3 prior attempts + current = 4 total
        for (let i = 0; i < 3; i++) {
          dispatch({ type: 'SET_RESULT', payload: result });
          dispatch({ type: 'RETRY' });
        }
        dispatch({ type: 'SET_RESULT', payload: result });
      },
      { question: mockQuestion, result: mockResult },
    );

    await page.waitForTimeout(200);
    await page.evaluate(() => {
      window.history.pushState({}, '', '/feedback');
      window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
    });

    await page.waitForSelector('text=Your Feedback', { timeout: 10000 });
    // attemptNumber = 4 >= 3, note shown: "You've practiced this 4 times"
    await expect(page.getByText("You've practiced this 4 times")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// T124 — Full mocked flow (Setup → Interview → Feedback via page.route)
// ---------------------------------------------------------------------------

test.describe('T124: Full mocked OpenAI flow', () => {
  test.skip(
    true,
    [
      'This test drives the full UI flow from setup through interview to feedback.',
      'It requires the VAD/WebRTC APIs to work in headless Chromium and the',
      'InterviewScreen to programmatically trigger the "Done" path.',
      'The individual component tests in T115 cover the same assertions more',
      'reliably.  Enable this test when CI has a real audio pipeline.',
    ].join(' '),
  );

  test('navigates setup → interview → feedback and shows all panels', async ({ page }) => {
    await mockMediaAPIs(page);
    await mockOpenAIRoutes(page);

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Select the first question by clicking "Start Interview"
    const startButton = page.getByRole('button', { name: /Start Interview/i });
    await startButton.click();

    await expect(page).toHaveURL('/interview', { timeout: 10000 });

    // In a real flow we would start recording, speak, and click Done.
    // That requires full audio pipeline support in the browser — skipped here.

    await expect(page.getByText('Your Feedback')).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('Score Breakdown')).toBeVisible();
    await expect(page.getByText('What to Improve')).toBeVisible();
  });
});
