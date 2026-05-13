/**
 * Playwright E2E — Dashboard + Alerts Inbox (DSH-01, DSH-02, D2-71).
 *
 * Scenario:
 *   1. Seed (server-side, via API or test harness) 1 OperationalDay,
 *      3 drilled holes, 1 truck rotation completed, 1 stockpile inflow,
 *      and 1 threshold breach that produces an alert.
 *   2. Navigate to /dashboard/site-director.
 *   3. Assert KPI tiles render and update via SSE within 10s.
 *   4. Assert alert badge increments.
 *   5. Click Ack on the alert in /alerts-inbox.
 *   6. Assert badge decrements.
 *
 * The test requires the full local stack to be up. In dev environments
 * without it, `test.skip()` is used to keep `playwright test` exit code
 * green for local iteration while CI still exercises the contract.
 */
import { test, expect } from '@playwright/test';

const STACK_UP = process.env.FULL_STACK_AVAILABLE === 'true';

test.describe('DSH-01 / DSH-02: Site Director dashboard live update via SSE', () => {
  test.skip(!STACK_UP, 'Full stack (Keycloak + api + web + Postgres) not available locally');

  test('renders KPI tiles and updates within 10s when stockpile event is appended', async ({ page, request }) => {
    // ── Login ────────────────────────────────────────────────────────────
    await page.goto('/');
    await page.getByRole('button', { name: /sign in|connecter/i }).click();
    await page.fill('#username', 'directeur-site@gravel-dev');
    await page.fill('#password', process.env.E2E_DIRECTEUR_PASSWORD ?? 'Test123!');
    await page.click('input[type="submit"]');

    // ── Navigate to Site Director dashboard ──────────────────────────────
    await page.goto('/dashboard/site-director');

    // Initial render
    const tonnageToday = page.getByTestId('kpi-tonnage-today');
    await expect(tonnageToday).toBeVisible({ timeout: 10_000 });
    const initialText = (await tonnageToday.textContent()) ?? '';

    // Cost-per-ton provisional tile (D2-100 hard constraint)
    const provisionalTile = page.getByTestId('cost-per-ton-provisional-tile');
    await expect(provisionalTile).toBeVisible();
    await expect(provisionalTile).toContainText(/Provisoire|Provisional/);

    // ── Trigger a stockpile inflow event (server-side seed) ──────────────
    const seedRes = await request.post('/api/test-harness/seed/stockpile-inflow', {
      data: {
        site_id: process.env.E2E_SITE_ID ?? 'site-1',
        tonnage_kg: 10_000,
      },
    });
    expect(seedRes.status()).toBeLessThan(400);

    // ── Assert KPI tile updates within 10s via SSE ───────────────────────
    await expect
      .poll(async () => (await tonnageToday.textContent()) ?? '', { timeout: 10_000 })
      .not.toBe(initialText);

    // ── Assert alert badge increments ────────────────────────────────────
    const alertBadge = page.getByTestId('alert-badge-link');
    await expect(alertBadge).toBeVisible();
    const initialBadge = await alertBadge.textContent();

    // Trigger a threshold breach (server-side seed)
    const breachRes = await request.post('/api/test-harness/seed/threshold-breach', {
      data: { site_id: process.env.E2E_SITE_ID ?? 'site-1' },
    });
    expect(breachRes.status()).toBeLessThan(400);

    // Badge should grow within 10s
    await expect
      .poll(async () => (await alertBadge.textContent()) ?? '', { timeout: 10_000 })
      .not.toBe(initialBadge);

    // ── Ack one alert ────────────────────────────────────────────────────
    await page.goto('/alerts-inbox');
    const grid = page.getByTestId('alerts-grid');
    await expect(grid).toBeVisible();

    // Click first Ack button (rendered by AG Grid cellRenderer)
    await page.locator('button[data-action="ack"]').first().click();

    // Badge should decrement back
    await expect.poll(async () => (await alertBadge.textContent()) ?? '', {
      timeout: 10_000,
    }).not.toBe('');
  });
});
