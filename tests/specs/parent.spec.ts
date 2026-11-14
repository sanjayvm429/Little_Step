import { test, expect } from '@playwright/test';
import { loginAs } from '../utils/auth';

test.describe('Parent dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'parent');
  });

  test('dashboard shows stats and children', async ({ page }) => {
    await expect(page.locator('text=My Children')).toBeVisible();
    await expect(page.locator('text=Aarav Sharma')).toBeVisible();
    await expect(page.locator('text=Diya Patel')).toBeVisible();
  });

  test('children page lists children', async ({ page }) => {
    await page.goto('/parent/children');
    await expect(page.locator('text=Aarav Sharma')).toBeVisible();
    await expect(page.locator('text=LS-001')).toBeVisible();
  });

  test('live monitoring shows cameras', async ({ page }) => {
    await page.goto('/parent/live');
    await expect(page.locator('text=Sunshine Main Camera')).toBeVisible();
    await expect(page.locator('text=Rainbow Activity Camera')).toBeVisible();
  });

  test('camera stream access issues token', async ({ page }) => {
    await page.goto('/parent/live');
    await page.click('text=Sunshine Main Camera');
    await expect(page.locator('text=Simulated camera stream')).toBeVisible({ timeout: 10_000 });
  });

  test('attendance page shows records', async ({ page }) => {
    await page.goto('/parent/attendance');
    await expect(page.locator('text=Aarav Sharma')).toBeVisible();
  });

  test('activities page shows timeline', async ({ page }) => {
    await page.goto('/parent/activities');
    await expect(page.locator('text=Breakfast')).toBeVisible();
  });

  test('notifications page loads', async ({ page }) => {
    await page.goto('/parent/notifications');
    await expect(page.locator('h2')).toContainText('Notifications');
  });

  test('pickup page shows authorized persons', async ({ page }) => {
    await page.goto('/parent/pickup');
    await expect(page.locator('text=Grandma Rao')).toBeVisible();
  });
});
