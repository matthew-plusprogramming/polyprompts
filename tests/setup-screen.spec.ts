import { test, expect } from '@playwright/test';
import { mockMediaAPIs, navigateTo } from './helpers';

test.describe('SetupScreen', () => {
  test.beforeEach(async ({ page }) => {
    await mockMediaAPIs(page);
    await navigateTo(page, '/');
  });

  // ─────────────────────────────────────────────
  // T102: Smoke test — all expected elements render
  // ─────────────────────────────────────────────
  test.describe('T102: renders all expected elements', () => {
    test('shows page heading', async ({ page }) => {
      await expect(page.getByRole('heading', { name: /Mock Behavioral/i })).toBeVisible();
      // "Interview" is on a second line of the same h1
      await expect(page.locator('h1')).toContainText('Interview');
    });

    test('shows AI-powered coaching badge', async ({ page }) => {
      await expect(page.getByText('AI-POWERED COACHING')).toBeVisible();
    });

    test('shows role selection cards', async ({ page }) => {
      await expect(page.getByText('SWE Intern')).toBeVisible();
      await expect(page.getByText('PM Intern')).toBeVisible();
      await expect(page.getByText('Data / ML Intern')).toBeVisible();
      await expect(page.getByText('Custom')).toBeVisible();
    });

    test('shows difficulty pills', async ({ page }) => {
      await expect(page.getByRole('button', { name: /Easy/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /Medium/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /Hard/i })).toBeVisible();
    });

    test('shows category chips', async ({ page }) => {
      await expect(page.getByRole('button', { name: /Random/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /Teamwork/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /Leadership/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /Conflict/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /Failure/i })).toBeVisible();
    });

    test('shows start button', async ({ page }) => {
      await expect(page.locator('button.start-btn')).toBeVisible();
    });

    test('shows STAR modal trigger', async ({ page }) => {
      await expect(page.getByRole('button', { name: /How scoring works/i })).toBeVisible();
    });

    test('shows mode toggle with both options', async ({ page }) => {
      await expect(page.getByRole('button', { name: /Generic Questions/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /From My Resume/i })).toBeVisible();
    });

    test('shows section labels for each configuration step', async ({ page }) => {
      await expect(page.getByText('Your Role')).toBeVisible();
      await expect(page.getByText('Difficulty')).toBeVisible();
      await expect(page.getByText('Question Type')).toBeVisible();
      await expect(page.getByText('Resume')).toBeVisible();
    });

    test('shows stats footer', async ({ page }) => {
      await expect(page.getByText('STAR')).toBeVisible();
      await expect(page.getByText('< 30s')).toBeVisible();
      await expect(page.getByText('20+')).toBeVisible();
    });
  });

  // ─────────────────────────────────────────────
  // T103: Interaction — selecting role, difficulty, category
  // ─────────────────────────────────────────────
  test.describe('T103: can select role, difficulty, and category', () => {
    test('clicking PM role card selects it', async ({ page }) => {
      const pmCard = page.getByRole('button', { name: /PM Intern/i });
      await pmCard.click();

      // When selected, the label text color changes to the role colour (#f59e0b).
      // We verify selection by confirming the ✓ checkmark badge appears inside
      // the card (it is only rendered when selected === true).
      await expect(pmCard.getByText('✓')).toBeVisible();
    });

    test('clicking Hard difficulty selects it', async ({ page }) => {
      const hardPill = page.getByRole('button', { name: /Hard/i });
      await hardPill.click();

      // When selected, the hint text for the difficulty is shown below the pill.
      // difficultyDescriptions[hard] is rendered only when that pill is selected.
      await expect(page.getByText(/Nuanced scenarios/i)).toBeVisible();
    });

    test('clicking Leadership category selects it', async ({ page }) => {
      const chip = page.getByRole('button', { name: /Leadership/i });
      await chip.click();

      // The category description text is rendered below the chips when the
      // category is active (CATEGORIES.find(c => c.id === category)?.desc).
      await expect(
        page.getByText(/Guiding others and taking initiative/i),
      ).toBeVisible();
    });

    test('start button becomes enabled after selecting a role', async ({ page }) => {
      // Before role selection the button is disabled
      const startBtn = page.locator('button.start-btn');
      await expect(startBtn).toBeDisabled();

      await page.getByRole('button', { name: /SWE Intern/i }).click();

      await expect(startBtn).toBeEnabled();
    });

    test('can select all three difficulties independently', async ({ page }) => {
      for (const label of ['Easy', 'Medium', 'Hard']) {
        await page.getByRole('button', { name: new RegExp(label, 'i') }).click();
        // Each pill renders its label text; clicking should not throw
        await expect(
          page.getByRole('button', { name: new RegExp(label, 'i') }),
        ).toBeVisible();
      }
    });

    test('can select all categories independently', async ({ page }) => {
      const cats = ['Random', 'Teamwork', 'Leadership', 'Conflict', 'Failure'];
      for (const cat of cats) {
        await page.getByRole('button', { name: new RegExp(cat, 'i') }).click();
        await expect(
          page.getByRole('button', { name: new RegExp(cat, 'i') }),
        ).toBeVisible();
      }
    });

    test('clicking a different role deselects the previous one', async ({ page }) => {
      // Select SWE first
      const sweCard = page.getByRole('button', { name: /SWE Intern/i });
      await sweCard.click();
      await expect(sweCard.getByText('✓')).toBeVisible();

      // Now select PM — the SWE checkmark should disappear
      const pmCard = page.getByRole('button', { name: /PM Intern/i });
      await pmCard.click();
      await expect(pmCard.getByText('✓')).toBeVisible();
      await expect(sweCard.getByText('✓')).not.toBeVisible();
    });
  });

  test.describe('T103: defaults are pre-selected', () => {
    test('Medium difficulty is selected by default', async ({ page }) => {
      // The hint text for Medium is visible when that pill is selected.
      // difficultyDescriptions renders below the active pill.
      await expect(page.getByRole('button', { name: /Medium/i })).toBeVisible();

      // No role selected yet, so easy / hard hints should NOT be visible at
      // page load, while the medium description IS rendered (it's always shown
      // via the difficultyDescriptions div beneath the pills).
      // The simplest check is that clicking Medium doesn't change the page
      // state—it is already the active pill.
      // We assert the medium hint text is present (rendered for selected pill).
      await expect(page.getByText(/Moderate complexity/i)).toBeVisible();
    });

    test('Random category is selected by default', async ({ page }) => {
      await expect(page.getByText(/Any category — keeps you on your toes/i)).toBeVisible();
    });

    test('no role is selected by default (start button disabled)', async ({ page }) => {
      const startBtn = page.locator('button.start-btn');
      await expect(startBtn).toBeDisabled();
      // The call-to-action text reflects no role chosen
      await expect(startBtn).toContainText('Select a role to begin');
    });

    test('Generic Questions mode is active by default', async ({ page }) => {
      // In generic mode the helper text is shown; resume drop zone is hidden
      await expect(
        page.getByText(/Using standard behavioral questions for your role/i),
      ).toBeVisible();
    });
  });

  // ─────────────────────────────────────────────
  // T104: Resume upload — toggling mode
  // ─────────────────────────────────────────────
  test.describe('T104: shows resume upload when mode toggled', () => {
    test('resume drop zone is hidden in Generic Questions mode', async ({ page }) => {
      // The drop zone text is inside a container with max-height 0 when mode === generic
      await expect(page.getByText('Drop your resume here')).not.toBeVisible();
    });

    test('clicking From My Resume toggle reveals the upload drop zone', async ({ page }) => {
      await page.getByRole('button', { name: /From My Resume/i }).click();

      await expect(page.getByText('Drop your resume here')).toBeVisible({ timeout: 1000 });
      await expect(page.getByText(/browse files/i)).toBeVisible();
      await expect(page.getByText(/PDF, DOCX, TXT/i)).toBeVisible();
    });

    test('start button shows upload prompt when in resume mode without a file', async ({ page }) => {
      // First select a role so we can see the button text change
      await page.getByRole('button', { name: /SWE Intern/i }).click();
      await page.getByRole('button', { name: /From My Resume/i }).click();

      const startBtn = page.locator('button.start-btn');
      // Button is disabled until a resume is uploaded
      await expect(startBtn).toBeDisabled();
      await expect(startBtn).toContainText('Upload your resume to continue');
    });

    test('helper text changes when switching to resume mode', async ({ page }) => {
      // Generic mode helper text is visible initially
      await expect(
        page.getByText(/Using standard behavioral questions for your role/i),
      ).toBeVisible();

      await page.getByRole('button', { name: /From My Resume/i }).click();

      // Generic helper text disappears; resume mode helper text appears
      await expect(
        page.getByText(/Using standard behavioral questions for your role/i),
      ).not.toBeVisible();
      await expect(
        page.getByText(/AI will craft questions around your specific projects/i),
      ).toBeVisible({ timeout: 1000 });
    });

    test('toggling back to Generic Questions re-hides the drop zone', async ({ page }) => {
      await page.getByRole('button', { name: /From My Resume/i }).click();
      await expect(page.getByText('Drop your resume here')).toBeVisible({ timeout: 1000 });

      await page.getByRole('button', { name: /Generic Questions/i }).click();
      await expect(page.getByText('Drop your resume here')).not.toBeVisible({ timeout: 600 });
    });

    test('uploading a file triggers scanning and then shows loaded state', async ({ page }) => {
      await page.getByRole('button', { name: /From My Resume/i }).click();

      // Trigger the hidden file input directly
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles({
        name: 'resume.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('%PDF-1.4 fake pdf content'),
      });

      // Scanning state appears
      await expect(page.getByText('Scanning your resume…')).toBeVisible({ timeout: 2000 });

      // After scanning completes, the loaded state appears (fake extractor
      // runs in ~1–2 s with the interval logic)
      await expect(page.getByText('Resume loaded')).toBeVisible({ timeout: 5000 });
      await expect(page.getByText('resume.pdf')).toBeVisible();
    });

    test('start button is enabled after a resume is uploaded', async ({ page }) => {
      await page.getByRole('button', { name: /SWE Intern/i }).click();
      await page.getByRole('button', { name: /From My Resume/i }).click();

      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles({
        name: 'resume.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('%PDF-1.4 fake pdf content'),
      });

      // Wait for scanning to complete and resume data to be set
      await expect(page.getByText('Resume loaded')).toBeVisible({ timeout: 5000 });

      const startBtn = page.locator('button.start-btn');
      await expect(startBtn).toBeEnabled();
      await expect(startBtn).toContainText('Start Interview');
    });

    test('remove button clears the uploaded resume', async ({ page }) => {
      await page.getByRole('button', { name: /From My Resume/i }).click();

      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles({
        name: 'resume.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('%PDF-1.4 fake pdf content'),
      });

      await expect(page.getByText('Resume loaded')).toBeVisible({ timeout: 5000 });

      // Click the ✕ remove button
      await page.getByRole('button', { name: '✕' }).click();

      // Drop zone reappears
      await expect(page.getByText('Drop your resume here')).toBeVisible({ timeout: 1000 });
    });
  });

  // ─────────────────────────────────────────────
  // T105: Navigation — clicking start goes to /interview
  // ─────────────────────────────────────────────
  test.describe('T105: clicking start navigates to interview', () => {
    test('clicking start button after selecting a role navigates to /interview', async ({ page }) => {
      // Select a role to enable the button
      await page.getByRole('button', { name: /SWE Intern/i }).click();

      const startBtn = page.locator('button.start-btn');
      await expect(startBtn).toBeEnabled();
      await startBtn.click();

      // The component calls navigate('/interview') after a 650 ms timeout
      await expect(page).toHaveURL('/interview', { timeout: 3000 });
    });

    test('clicking start with PM role also navigates to /interview', async ({ page }) => {
      await page.getByRole('button', { name: /PM Intern/i }).click();
      await page.locator('button.start-btn').click();

      await expect(page).toHaveURL('/interview', { timeout: 3000 });
    });

    test('button shows loading state while navigating', async ({ page }) => {
      await page.getByRole('button', { name: /SWE Intern/i }).click();
      await page.locator('button.start-btn').click();

      // The "launching" state renders "Preparing your question…" text
      await expect(
        page.getByText(/Preparing your question…/i),
      ).toBeVisible({ timeout: 1000 });
    });

    test('start button is not clickable before selecting a role', async ({ page }) => {
      const startBtn = page.locator('button.start-btn');
      await expect(startBtn).toBeDisabled();

      // Force a click attempt; URL should remain /
      await startBtn.click({ force: true });
      await expect(page).toHaveURL('/');
    });
  });

  // ─────────────────────────────────────────────
  // STAR modal interaction
  // ─────────────────────────────────────────────
  test.describe('STAR modal', () => {
    test('opens STAR modal when "How scoring works" is clicked', async ({ page }) => {
      await page.getByRole('button', { name: /How scoring works/i }).click();

      await expect(page.getByRole('heading', { name: /STAR Scoring/i })).toBeVisible({ timeout: 500 });
      await expect(page.getByText('Situation')).toBeVisible();
      await expect(page.getByText('Task')).toBeVisible();
      await expect(page.getByText('Action')).toBeVisible();
      await expect(page.getByText('Result')).toBeVisible();
    });

    test('closes STAR modal when the × button is clicked', async ({ page }) => {
      await page.getByRole('button', { name: /How scoring works/i }).click();
      await expect(page.getByRole('heading', { name: /STAR Scoring/i })).toBeVisible({ timeout: 500 });

      // The close button inside the modal
      await page.locator('[style*="191926"]').getByText('×').click();

      await expect(page.getByRole('heading', { name: /STAR Scoring/i })).not.toBeVisible({
        timeout: 500,
      });
    });

    test('closes STAR modal when backdrop is clicked', async ({ page }) => {
      await page.getByRole('button', { name: /How scoring works/i }).click();
      await expect(page.getByRole('heading', { name: /STAR Scoring/i })).toBeVisible({ timeout: 500 });

      // Click the semi-transparent backdrop (the fixed overlay div) outside the
      // modal card.  We click near the top-left corner which is outside the
      // centred card.
      await page.mouse.click(10, 10);

      await expect(page.getByRole('heading', { name: /STAR Scoring/i })).not.toBeVisible({
        timeout: 500,
      });
    });
  });
});
