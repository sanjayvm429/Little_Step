import { test, expect } from '@playwright/test';
import { loginAs } from '../utils/auth';

test.describe('Teacher dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'teacher');
  });

  test('dashboard shows classrooms and stats', async ({ page }) => {
    await expect(page.locator('text=My Classrooms')).toBeVisible();
    await expect(page.locator('text=Sunshine')).toBeVisible();
    await expect(page.locator('text=Rainbow')).toBeVisible();
  });

  test('children page lists assigned children', async ({ page }) => {
    await page.goto('/teacher/children');
    await expect(page.locator('text=Aarav Sharma')).toBeVisible();
    await expect(page.locator('text=Kabir Singh')).toBeVisible();
  });

  test('can mark attendance check-in', async ({ page }) => {
    await page.goto('/teacher/attendance');
    await expect(page.locator('text=Aarav Sharma')).toBeVisible();
    // If already checked in, check-out button should exist; otherwise check-in
    const checkInBtn = page.locator('button:has-text("In")').first();
    const checkOutBtn = page.locator('button:has-text("Out")').first();
    if (await checkInBtn.isVisible().catch(() => false)) {
      await checkInBtn.click();
      await expect(page.locator('text=Checked in successfully')).toBeVisible({ timeout: 10_000 });
    } else if (await checkOutBtn.isVisible().catch(() => false)) {
      await checkOutBtn.click();
      await expect(page.locator('text=Checked out successfully')).toBeVisible({ timeout: 10_000 });
    }
  });

  test('can create activity', async ({ page }) => {
    await page.goto('/teacher/activities');
    await page.click('text=Add activity');
    await page.selectOption('select >> nth=0', { index: 1 });
    await page.selectOption('select >> nth=1', 'learning');
    await page.fill('input[placeholder*="Color sorting"]', 'Playwright test activity');
    await page.click('button:has-text("Save activity")');
    await expect(page.locator('text=Activity recorded')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=Playwright test activity')).toBeVisible();
  });
});
