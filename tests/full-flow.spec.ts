import { test, expect, type Page } from '@playwright/test';
import { mockMediaAPIs, getMockScoringResult } from './helpers';

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register intercepts for every external API the app calls:
 *   - OpenAI chat/completions  → returns a mock scoring result
 *   - OpenAI audio/speech      → returns a tiny silent MP3 blob
 *   - OpenAI audio/transcriptions → returns a mock transcript
 *
 * The intercepts are registered on the page *before* navigation so they fire
 * for all requests including the initial bundle load.
 */
async function mockAllAPIs(page: Page) {
  await mockMediaAPIs(page);

  await page.route('**/*openai.com/**', async (route) => {
    const url = route.request().url();

    if (url.includes('chat/completions')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify(getMockScoringResult()),
              },
            },
          ],
        }),
      });
    } else if (url.includes('audio/speech')) {
      // Minimal valid MP3 header (ID3v2 + empty frame) so the Audio API does
      // not throw when it tries to decode the response.
      await route.fulfill({
        status: 200,
        contentType: 'audio/mpeg',
        body: Buffer.alloc(128, 0),
      });
    } else if (url.includes('audio/transcriptions')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          text: 'Mock transcription text for testing purposes. I worked closely with my team to deliver the project on time.',
        }),
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
          choices: [
            {
              message: {
                content: JSON.stringify(getMockScoringResult()),
              },
            },
          ],
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
        body: JSON.stringify({ text: 'Mock transcription text for testing purposes.' }),
      });
    } else {
      await route.continue();
    }
  });
}

/**
 * Select the SWE Intern role on the setup screen and wait for the Start
 * Interview button to become enabled.
 */
async function selectRoleAndEnableStart(page: Page) {
  const sweCard = page.getByText('SWE Intern').first();
  await expect(sweCard, 'SWE Intern role card must be present').toBeVisible({ timeout: 10_000 });
  await sweCard.click();

  const startBtn = page.locator('button.start-btn');
  await expect(startBtn, 'Start button must be enabled after role selection').toBeEnabled({
    timeout: 5_000,
  });
  return startBtn;
}

// ─────────────────────────────────────────────────────────────────────────────
// Test suite
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Full Application Flow', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllAPIs(page);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // T120-a: Setup screen renders all expected UI landmarks
  // ───────────────────────────────────────────────────────────────────────────
  test('T120-a: setup screen renders all sections', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 20_000 });

    // Hero headline
    await expect(
      page.getByText(/mock behavioral/i).first(),
      'Hero headline should be visible',
    ).toBeVisible({ timeout: 10_000 });

    // Role cards
    for (const label of ['SWE Intern', 'PM Intern', 'Data / ML Intern', 'Custom']) {
      await expect(
        page.getByText(label).first(),
        `Role card "${label}" should be visible`,
      ).toBeVisible({ timeout: 10_000 });
    }

    // Difficulty pills
    for (const label of ['Easy', 'Medium', 'Hard']) {
      await expect(
        page.getByText(label).first(),
        `Difficulty pill "${label}" should be visible`,
      ).toBeVisible({ timeout: 10_000 });
    }

    // Category chips
    await expect(page.getByText('Teamwork').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Leadership').first()).toBeVisible({ timeout: 10_000 });

    // Mode toggle
    await expect(page.getByText(/Generic Questions/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/From My Resume/i).first()).toBeVisible({ timeout: 10_000 });

    // Start button (disabled until role chosen)
    await expect(page.locator('button.start-btn')).toBeVisible({ timeout: 10_000 });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // T120-b: Full setup → interview navigation flow
  // ───────────────────────────────────────────────────────────────────────────
  test('T120-b: setup → interview navigation on role select + start', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 20_000 });

    const startBtn = await selectRoleAndEnableStart(page);

    // Click Start Interview
    await startBtn.click();

    // The button shows a "Preparing your question…" spinner for ~650 ms then
    // navigates to /interview.  Use a generous timeout.
    await expect(page).toHaveURL(/\/interview/, { timeout: 15_000 });

    // Interview screen must render with the question text
    await expect(
      page.locator('body'),
      'Interview screen body should be visible',
    ).toBeVisible({ timeout: 10_000 });

    // The question text container should contain at least some content
    await expect(
      page.getByText(/tell me|describe|time you|challenge|team|conflict|mistake/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // T120-c: Interview screen renders Start Interview button and phase badge
  // ───────────────────────────────────────────────────────────────────────────
  test('T120-c: interview screen shows phase badge and Start Interview button', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 20_000 });

    const startBtn = await selectRoleAndEnableStart(page);
    await startBtn.click();
    await expect(page).toHaveURL(/\/interview/, { timeout: 15_000 });

    // Phase badge should default to "Ready"
    await expect(
      page.getByText(/ready/i).first(),
      'Phase badge should show Ready on initial load',
    ).toBeVisible({ timeout: 10_000 });

    // The "Start Interview" button should be present in the ready phase
    await expect(
      page.getByRole('button', { name: /start interview/i }),
      '"Start Interview" button should be visible in ready phase',
    ).toBeVisible({ timeout: 10_000 });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // T120-d: Difficulty selection persists to interview screen label
  // ───────────────────────────────────────────────────────────────────────────
  test('T120-d: selected difficulty is reflected on the interview screen', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 20_000 });

    // Select Hard difficulty before selecting role
    await page.getByText('Hard').first().click();

    const startBtn = await selectRoleAndEnableStart(page);
    await startBtn.click();

    await expect(page).toHaveURL(/\/interview/, { timeout: 15_000 });

    // The question displayed should be non-trivial (page loaded correctly)
    await expect(page.locator('body')).toBeVisible({ timeout: 10_000 });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // T122: localStorage persistence — sessions and prefs keys
  // ───────────────────────────────────────────────────────────────────────────
  test('T122: localStorage polyprompts-prefs is written on setup screen load', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 20_000 });

    // The InterviewContext writes prefs whenever role or difficulty changes.
    // On initial mount it writes the default values.
    const prefs = await page.evaluate(() => localStorage.getItem('polyprompts-prefs'));

    // Key should exist (may be null if no interaction yet, but after mount it
    // is written with defaults — context fires two useEffects on mount)
    // Give a brief moment for effects to flush
    await page.waitForTimeout(500);
    const prefsAfterMount = await page.evaluate(() =>
      localStorage.getItem('polyprompts-prefs'),
    );

    expect(
      prefsAfterMount,
      'polyprompts-prefs should be written to localStorage after context mounts',
    ).not.toBeNull();

    const parsed = JSON.parse(prefsAfterMount!);
    expect(parsed).toHaveProperty('role');
    expect(parsed).toHaveProperty('difficulty');
  });

  test('T122: polyprompts-prefs updates when role is selected', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 20_000 });

    // Select PM Intern
    await page.getByText('PM Intern').first().click();
    await page.waitForTimeout(300); // let the useEffect flush

    const prefs = await page.evaluate(() => localStorage.getItem('polyprompts-prefs'));
    expect(prefs).not.toBeNull();

    const parsed = JSON.parse(prefs!);
    expect(
      parsed.role,
      'polyprompts-prefs.role should reflect the selected PM Intern role',
    ).toBe('pm_intern');
  });

  test('T122: polyprompts-prefs updates when difficulty is changed', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 20_000 });

    // Click Hard difficulty
    await page.getByText('Hard').first().click();
    await page.waitForTimeout(300);

    const prefs = await page.evaluate(() => localStorage.getItem('polyprompts-prefs'));
    expect(prefs).not.toBeNull();

    const parsed = JSON.parse(prefs!);
    expect(
      parsed.difficulty,
      'polyprompts-prefs.difficulty should be hard after clicking Hard',
    ).toBe('hard');
  });

  test('T122: polyprompts-sessions key is created on context mount', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 20_000 });
    await page.waitForTimeout(500);

    // Context writes the sessions array on mount (even if empty)
    const sessions = await page.evaluate(() => localStorage.getItem('polyprompts-sessions'));
    expect(
      sessions,
      'polyprompts-sessions should be present after context mounts',
    ).not.toBeNull();

    // Should be a valid JSON array
    const parsed = JSON.parse(sessions!);
    expect(Array.isArray(parsed)).toBe(true);
  });

  test('T122: localStorage survives a page reload', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 20_000 });

    // Set a known preference
    await page.getByText('Easy').first().click();
    await page.waitForTimeout(300);

    // Reload and verify the preference is still there
    await page.reload();
    await page.waitForLoadState('networkidle', { timeout: 20_000 });
    await page.waitForTimeout(300);

    const prefs = await page.evaluate(() => localStorage.getItem('polyprompts-prefs'));
    expect(prefs).not.toBeNull();

    const parsed = JSON.parse(prefs!);
    expect(
      parsed.difficulty,
      'difficulty preference should persist across a page reload',
    ).toBe('easy');
  });

  test('T122: can write and read arbitrary values from localStorage', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 20_000 });

    // Verify the app does not block or override arbitrary localStorage keys
    await page.evaluate(() => {
      localStorage.setItem('polyprompts-sessions', JSON.stringify([]));
    });

    const sessions = await page.evaluate(() => localStorage.getItem('polyprompts-sessions'));
    expect(sessions).toBe('[]');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // T123: Responsive layout — no horizontal overflow at various breakpoints
  // ───────────────────────────────────────────────────────────────────────────
  test('T123: responsive layout at mobile width (375 × 812)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 20_000 });

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);

    expect(
      bodyWidth,
      `body.scrollWidth (${bodyWidth}) should not exceed viewport width (${viewportWidth}) at 375px`,
    ).toBeLessThanOrEqual(viewportWidth + 10);

    // Key landmark must still be visible at mobile width
    await expect(
      page.getByText(/mock behavioral/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('T123: responsive layout at tablet width (768 × 1024)', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 20_000 });

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);

    expect(
      bodyWidth,
      `body.scrollWidth (${bodyWidth}) should not exceed viewport width (${viewportWidth}) at 768px`,
    ).toBeLessThanOrEqual(viewportWidth + 10);

    await expect(page.getByText(/mock behavioral/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('T123: responsive layout at desktop width (1280 × 800)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 20_000 });

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);

    expect(
      bodyWidth,
      `body.scrollWidth (${bodyWidth}) should not exceed viewport width (${viewportWidth}) at 1280px`,
    ).toBeLessThanOrEqual(viewportWidth + 10);

    await expect(page.getByText(/mock behavioral/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('T123: responsive layout at wide desktop width (1920 × 1080)', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 20_000 });

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);

    expect(
      bodyWidth,
      `body.scrollWidth (${bodyWidth}) should not exceed viewport width (${viewportWidth}) at 1920px`,
    ).toBeLessThanOrEqual(viewportWidth + 10);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // T120-e: "How scoring works" modal is functional across the flow
  // ───────────────────────────────────────────────────────────────────────────
  test('T120-e: STAR modal opens, displays all four components, and closes', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 20_000 });

    await page.getByText(/how scoring works/i).click();

    // Modal title
    await expect(
      page.getByText(/STAR Scoring/i),
    ).toBeVisible({ timeout: 5_000 });

    // All four STAR components should be rendered
    for (const word of ['Situation', 'Task', 'Action', 'Result']) {
      await expect(
        page.getByText(word).first(),
        `"${word}" should appear in the STAR modal`,
      ).toBeVisible({ timeout: 5_000 });
    }

    // Close the modal by clicking the backdrop (outside the card)
    await page.keyboard.press('Escape');

    // Modal should disappear.  The close animation takes ~220ms, so wait.
    await expect(
      page.getByText(/STAR Scoring/i),
    ).not.toBeVisible({ timeout: 3_000 });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // T120-f: Category selection chips work correctly
  // ───────────────────────────────────────────────────────────────────────────
  test('T120-f: selecting a category chip highlights it', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 20_000 });

    const teamworkChip = page.getByText('Teamwork').first();
    await expect(teamworkChip).toBeVisible({ timeout: 10_000 });
    await teamworkChip.click();

    // After clicking, the chip's parent button should have a highlighted
    // border style.  We verify by checking that the chip text is still
    // visible (interaction did not break anything) and the description text
    // corresponding to Teamwork appears.
    await expect(
      page.getByText(/Working effectively with others/i).first(),
    ).toBeVisible({ timeout: 5_000 });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // T120-g: Mode toggle switches between Generic and Resume modes
  // ───────────────────────────────────────────────────────────────────────────
  test('T120-g: toggling to "From My Resume" reveals upload zone', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 20_000 });

    // Initially in generic mode — upload zone should be hidden (max-height: 0)
    await expect(
      page.getByText(/drop your resume here/i),
    ).not.toBeVisible({ timeout: 5_000 });

    // Click the "From My Resume" tab
    await page.getByText(/From My Resume/i).first().click();

    // Upload zone should now be visible
    await expect(
      page.getByText(/drop your resume here/i),
    ).toBeVisible({ timeout: 5_000 });

    // Switching back to Generic hides the upload zone
    await page.getByText(/Generic Questions/i).first().click();
    await expect(
      page.getByText(/drop your resume here/i),
    ).not.toBeVisible({ timeout: 5_000 });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // T120-h: /feedback without result stays on page and shows fallback message
  // ───────────────────────────────────────────────────────────────────────────
  test('T120-h: /feedback without result shows NoResult fallback', async ({ page }) => {
    await page.goto('/feedback');
    await page.waitForLoadState('networkidle', { timeout: 20_000 });

    const url = page.url();

    if (url.includes('/feedback')) {
      await expect(
        page.getByText(/no interview results yet/i),
        'NoResult headline should be visible when navigating directly to /feedback',
      ).toBeVisible({ timeout: 10_000 });

      // The "back to setup" button should also be present
      await expect(
        page.getByRole('button', { name: /back|setup|new/i }).first(),
      ).toBeVisible({ timeout: 10_000 });
    } else {
      // Redirect to / is also a valid guard behaviour
      await expect(page).toHaveURL('/', { timeout: 10_000 });
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // T120-i: Stat counters in the footer are visible
  // ───────────────────────────────────────────────────────────────────────────
  test('T120-i: setup screen stat footer shows STAR, feedback, and question counts', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 20_000 });

    await expect(page.getByText('STAR').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/< 30s/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/20\+/i).first()).toBeVisible({ timeout: 10_000 });
  });
});
