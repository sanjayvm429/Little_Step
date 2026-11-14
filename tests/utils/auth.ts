import { Page, expect } from '@playwright/test';

export const TEST_USERS = {
  admin: { email: 'admin@littlesteps.com', password: 'Password123' },
  teacher: { email: 'teacher@littlesteps.com', password: 'Password123' },
  parent: { email: 'parent@littlesteps.com', password: 'Password123' },
};

export async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(parent|teacher|admin)\/dashboard/, { timeout: 10_000 });
}

export async function loginAs(page: Page, role: keyof typeof TEST_USERS) {
  const u = TEST_USERS[role];
  await login(page, u.email, u.password);
}

export function uniqueEmail(prefix = 'test') {
  return `${prefix}-${Date.now()}@example.com`;
}
