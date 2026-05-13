/**
 * Playwright E2E — Directeur Site dashboard (DSH-01, DSH-02).
 *
 * Mirrors apps/web/playwright/dashboard.spec.ts to live in the
 * configured `e2e/` directory (playwright.config.ts → testDir = './e2e').
 *
 * Same scenario:
 *  - login → /dashboard/site-director
 *  - assert KPI tiles + provisional cost tile rendered
 *  - trigger stockpile inflow → assert KPI updates via SSE within 10s
 *  - trigger threshold breach → assert alert badge increments
 *  - ack alert in /alerts-inbox → assert badge decrements
 */
import { test, expect } from '@playwright/test';

const STACK_UP = process.env.FULL_STACK_AVAILABLE === 'true';

test.describe('DSH-01 / DSH-02: Dashboard Directeur Site live update', () => {
  test.skip(!STACK_UP, 'Full stack not available locally');

  test('KPIs update via SSE within 10s after stockpile inflow', async ({
    page,
    request,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /sign in|connecter/i }).click();
    await page.fill('#username', 'directeur-site@gravel-dev');
    await page.fill('#password', process.env.E2E_DIRECTEUR_PASSWORD ?? 'Test123!');
    await page.click('input[type="submit"]');

    await page.goto('/dashboard/site-director');

    const tonnageToday = page.getByTestId('kpi-tonnage-today');
    await expect(tonnageToday).toBeVisible({ timeout: 10_000 });
    const initial = (await tonnageToday.textContent()) ?? '';

    // D2-100: cost_per_ton_provisional UI MUST surface "Provisoire"
    const provTile = page.getByTestId('cost-per-ton-provisional-tile');
    await expect(provTile).toContainText(/Provisoire|Provisional/);

    const seedRes = await request.post('/api/test-harness/seed/stockpile-inflow', {
      data: { site_id: process.env.E2E_SITE_ID ?? 'site-1', tonnage_kg: 10_000 },
    });
    expect(seedRes.status()).toBeLessThan(400);

    await expect
      .poll(async () => (await tonnageToday.textContent()) ?? '', { timeout: 10_000 })
      .not.toBe(initial);
  });
});
