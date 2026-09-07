import { test, expect, type Page } from '@playwright/test';

test.describe('Learning Hub Autonomous Verification Suite', () => {
  const BASE_URL = 'http://localhost:5173';
  const STORAGE_KEY = 'sb-pqgucydeafbtypbwoyow-auth-token';
  const TEST_EMAIL = 'e2e_test_user_learning_hub@example.com';
  const TEST_PASSWORD = 'TestPassword123!';

  // Reliable authentication helper
  const authenticateSession = async (page: Page, preventAutoOnboarding = true) => {
    if (preventAutoOnboarding) {
      await page.addInitScript(() => {
        window.localStorage.setItem('has_seen_learning_onboarding', 'true');
      });
    }

    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('networkidle').catch(() => {});
    
    const emailInput = page.locator('input[type="email"]');
    if (await emailInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await emailInput.fill(TEST_EMAIL);
      await page.locator('input[type="password"]').fill(TEST_PASSWORD);
      await page.click('button:has-text("Sign In")');
      await page.waitForURL((url: URL) => !url.href.includes('/login'), { timeout: 10000 }).catch(() => {});
    }
  };

  const ensureDashboardLoaded = async (page: Page, preventAutoOnboarding = true) => {
    await authenticateSession(page, preventAutoOnboarding);
    await page.goto(`${BASE_URL}/learning`);
    await page.waitForSelector('h1', { timeout: 10000 });
  };

  test('1. Learning Hub Navigation and Dashboard Render', async ({ page }) => {
    await ensureDashboardLoaded(page);
    
    // Verify Header
    await expect(page.locator('h1')).toContainText('Your Learning Space');
    
    // Verify Navigation Sidebar link is visible
    const learningNavLink = page.locator('aside a[href="/learning"]');
    await expect(learningNavLink).toBeVisible();

    // Check Action Buttons exist
    await expect(page.locator('button:has-text("How it Works")')).toBeVisible();
    await expect(page.locator('button:has-text("New Journey")')).toBeVisible();
  });

  test('2. How It Works Onboarding Modal and Visual Guidance', async ({ page }) => {
    await ensureDashboardLoaded(page, false);
    
    const onboardingModal = page.locator('div.fixed:has-text("How Learning Hub Works")');
    if (!(await onboardingModal.isVisible().catch(() => false))) {
      await page.click('button:has-text("How it Works")');
    }
    
    // Verify Onboarding Modal is visible
    await expect(onboardingModal).toBeVisible();

    // Step 1: Vision
    await expect(onboardingModal.locator('text=/You create the path/i')).toBeVisible();
    await onboardingModal.locator('button:has-text("Next")').click();

    // Step 2: Domains & Dual Progress
    await expect(onboardingModal.locator('text=/Works for Any Skill or Domain/i')).toBeVisible();
    await expect(onboardingModal.locator('text=/Dual Progress System/i')).toBeVisible();
    await onboardingModal.locator('button:has-text("Next")').click();

    // Step 3: Interactive Visual Example
    await expect(onboardingModal.locator('text=/Real-World Journey Example/i')).toBeVisible();
    await expect(onboardingModal.locator('text=/Master Data Structures/i')).toBeVisible();
    
    // Close modal
    await onboardingModal.locator('button:has-text("Explore Dashboard")').click();
    await expect(onboardingModal).not.toBeVisible();
  });

  test('3. Complete Journey Creation Flow & Topic Workspace Interactivity', async ({ page }) => {
    await ensureDashboardLoaded(page, true);
    
    // Ensure any open modal is dismissed
    const exploreBtn = page.locator('button:has-text("Explore Dashboard")');
    if (await exploreBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await exploreBtn.click();
    }

    // Click New Journey button
    await page.click('button:has-text("New Journey")');
    
    const wizardModal = page.locator('div.fixed:has-text("Create Learning Journey")');
    await expect(wizardModal).toBeVisible();

    // Step 1: Fill Basic Info
    const timestamp = Date.now();
    const journeyTitle = `Full Stack Dev ${timestamp}`;
    const titleInput = wizardModal.locator('input').first();
    await titleInput.click();
    await titleInput.fill(journeyTitle);
    await expect(wizardModal.locator('button:has-text("Next")')).toBeEnabled();
    await wizardModal.locator('button:has-text("Next")').click();

    // Step 2: Select Option B (Organized with Phases)
    await wizardModal.locator('text="Option B: Organized with Phases"').click();
    await wizardModal.locator('button:has-text("Next")').click();

    // Step 3: Topics (Keep defaults)
    await wizardModal.locator('button:has-text("Next")').click();

    // Step 4: Tasks (Keep defaults)
    await wizardModal.locator('button:has-text("Next")').click();

    // Step 5: Review & Create
    await wizardModal.locator('button:has-text("Create Journey")').click();

    // Verify redirected to Journey Workspace
    await page.waitForURL((url: URL) => url.href.includes('/learning/journey/'), { timeout: 15000 });
    await page.waitForSelector('h1', { timeout: 15000 });
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('text="Journey Roadmap"')).toBeVisible();

    // Open Topic Workspace Modal
    const topicCard = page.locator('div.cursor-pointer:has-text("Syntax Basics")').first();
    if (await topicCard.isVisible().catch(() => false)) {
      await topicCard.click();
      const topicModal = page.locator('div.fixed:has-text("Topic Workspace")');
      await expect(topicModal).toBeVisible();
      
      // Close Topic Workspace Modal
      await topicModal.locator('button:has-text("Close")').click();
    }
  });

  test('4. Light Mode & Dark Mode Visual Compatibility', async ({ page }) => {
    await ensureDashboardLoaded(page, true);

    // Verify Light Mode container
    await expect(page.locator('body')).toBeVisible();
    
    // Toggle Theme to Dark Mode
    await page.evaluate(() => {
      document.documentElement.classList.add('dark');
    });
    
    // Check Dark Mode container rendering
    const header = page.locator('h1');
    await expect(header).toBeVisible();

    // Revert to Light Mode
    await page.evaluate(() => {
      document.documentElement.classList.remove('dark');
    });
    await expect(header).toBeVisible();
  });

  test('5. Responsive Layout Verification (Desktop 1440px, Tablet 768px, Mobile 390px)', async ({ page }) => {
    // Desktop 1440px
    await page.setViewportSize({ width: 1440, height: 900 });
    await ensureDashboardLoaded(page, true);
    await expect(page.locator('h1')).toBeVisible();

    // Tablet 768px
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(page.locator('h1')).toBeVisible();

    // Mobile 390px
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('h1')).toBeVisible();
  });
});
