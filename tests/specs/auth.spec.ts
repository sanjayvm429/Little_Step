import { test, expect } from '@playwright/test';
import { login, loginAs, TEST_USERS, uniqueEmail } from '../utils/auth';

test.describe('Authentication', () => {
  test('landing page loads', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('LittleSteps');
    await expect(page.locator('text=Watch your little ones')).toBeVisible();
  });

  test('signup page shows validation errors', async ({ page }) => {
    await page.goto('/signup');
    await page.click('button[type="submit"]');
    await expect(page.locator('text=Name is required')).toBeVisible();
    await expect(page.locator('text=Enter a valid email')).toBeVisible();
  });

  test('signup with valid data succeeds', async ({ page }) => {
    await page.goto('/signup');
    const email = uniqueEmail('parent');
    await page.fill('input[placeholder="Your full name"]', 'Test Parent');
    await page.fill('input[type="email"]', email);
    await page.fill('input[placeholder="+91 98765 43210"]', '9876543210');
    await page.fill('input[placeholder*="Min 8"]', 'Password123');
    await page.fill('input[placeholder="Repeat password"]', 'Password123');
    await page.check('input[type="checkbox"]');
    await page.click('button[type="submit"]');
    await expect(page.locator('text=Account created')).toBeVisible({ timeout: 10_000 });
  });

  test('duplicate email registration is rejected', async ({ page }) => {
    await page.goto('/signup');
    await page.fill('input[placeholder="Your full name"]', 'Dup User');
    await page.fill('input[type="email"]', TEST_USERS.parent.email);
    await page.fill('input[placeholder="+91 98765 43210"]', '9876543210');
    await page.fill('input[placeholder*="Min 8"]', 'Password123');
    await page.fill('input[placeholder="Repeat password"]', 'Password123');
    await page.check('input[type="checkbox"]');
    await page.click('button[type="submit"]');
    await expect(page.locator('text=already exists')).toBeVisible({ timeout: 10_000 });
  });

  test('login with invalid credentials fails', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'wrong@example.com');
    await page.fill('input[type="password"]', 'WrongPass123');
    await page.click('button[type="submit"]');
    await expect(page.locator('text=Invalid email or password')).toBeVisible({ timeout: 10_000 });
  });

  test('login as parent redirects to parent dashboard', async ({ page }) => {
    await loginAs(page, 'parent');
    await expect(page).toHaveURL(/\/parent\/dashboard/);
    await expect(page.locator('text=Welcome back')).toBeVisible();
  });

  test('login as teacher redirects to teacher dashboard', async ({ page }) => {
    await loginAs(page, 'teacher');
    await expect(page).toHaveURL(/\/teacher\/dashboard/);
    await expect(page.locator('text=Welcome')).toBeVisible();
  });

  test('login as admin redirects to admin dashboard', async ({ page }) => {
    await loginAs(page, 'admin');
    await expect(page).toHaveURL(/\/admin\/dashboard/);
    await expect(page.locator('text=Welcome')).toBeVisible();
  });

  test('logout returns to login', async ({ page }) => {
    await loginAs(page, 'parent');
    await page.click('text=Logout');
    await page.waitForURL(/\/login/, { timeout: 10_000 });
  });

  test('protected route redirects unauthenticated user', async ({ page }) => {
    await page.goto('/parent/dashboard');
    await page.waitForURL(/\/login/, { timeout: 10_000 });
  });
});
