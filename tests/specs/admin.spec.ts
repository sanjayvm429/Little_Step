import { test, expect } from '@playwright/test';
import { loginAs } from '../utils/auth';

test.describe('Admin dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin');
  });

  test('dashboard shows stats', async ({ page }) => {
    await expect(page.locator('text=Total Children')).toBeVisible();
    await expect(page.locator('text=Total Parents')).toBeVisible();
    await expect(page.locator('text=Total Teachers')).toBeVisible();
    await expect(page.locator('text=Cameras Online')).toBeVisible();
  });

  test('can create classroom', async ({ page }) => {
    await page.goto('/admin/classrooms');
    await page.click('text=Add classroom');
    await page.fill('input[placeholder="e.g. Sunshine"]', 'Playwright Class');
    await page.fill('input[placeholder="e.g. 2-3 years"]', '4-5 years');
    await page.fill('input[type="number"]', '20');
    await page.click('button:has-text("Create classroom")');
    await expect(page.locator('text=Classroom created')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=Playwright Class')).toBeVisible();
  });

  test('can register child', async ({ page }) => {
    await page.goto('/admin/children');
    await page.click('text=Add child');
    await page.fill('input >> nth=0', 'Test Child PW');
    await page.fill('input[type="date"]', '2021-01-01');
    await page.fill('input[placeholder="LS-XXX"]', `PW-${Date.now()}`);
    await page.click('button:has-text("Register child")');
    await expect(page.locator('text=Child registered')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=Test Child PW')).toBeVisible();
  });

  test('can register camera', async ({ page }) => {
    await page.goto('/admin/cameras');
    await page.click('text=Add camera');
    await page.fill('input[placeholder="e.g. Sunshine Main Camera"]', 'PW Camera');
    await page.fill('input[placeholder="CAM-001"]', `CAM-PW-${Date.now()}`);
    await page.fill('input[placeholder="e.g. Sunshine Classroom"]', 'Test Room');
    await page.fill('input[placeholder="e.g. sunshine-main"]', `pw-cam-${Date.now()}`);
    await page.check('input[type="checkbox"]');
    await page.click('button:has-text("Register camera")');
    await expect(page.locator('text=Camera registered')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=PW Camera')).toBeVisible();
  });

  test('access requests page loads', async ({ page }) => {
    await page.goto('/admin/access-requests');
    await expect(page.locator('text=Parent-Child Access Requests')).toBeVisible();
    await expect(page.locator('text=Pickup Authorization Requests')).toBeVisible();
  });
});
