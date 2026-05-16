import { expect, test } from '@playwright/test';

/**
 * Playwright E2E — Finance Direction Groupe flow (Phase 4).
 *
 * Covers the golden path for a Direction Groupe user landing on the
 * consolidated finance section:
 *   1. Login auto-bypassed (mockAuth env), redirected to /dashboard
 *   2. Navigate to /finance — defaults to /finance/consolidation
 *   3. Pivot switch XOF / EUR triggers a refresh + new aggregation call
 *   4. Tab strip allows switching to Budget vs Réel + OHADA Export
 *   5. OHADA target picker lets user pick Sage / Ciel / Odoo
 *
 * API calls are mocked via page.route so the test runs without a live API.
 */

test.describe('Finance Direction Groupe flow', () => {
  const CONSOLIDATION_BASE = {
    pivotCurrency: 'XOF',
    periodFrom: '2026-04-01',
    periodTo: '2026-05-16',
    bySite: [
      {
        siteId: '5213953c-3820-4da4-97ed-89bfbd605c07',
        revenueMinor: '12500000',
        costMinor: '8400000',
        marginMinor: '4100000',
        tonnageT: 2450,
      },
      {
        siteId: '8c19a921-1111-4f1a-aaaa-bbbbcccc0000',
        revenueMinor: '7300000',
        costMinor: '6900000',
        marginMinor: '400000',
        tonnageT: 1480,
      },
    ],
    totalRevenueMinor: '19800000',
    totalCostMinor: '15300000',
    totalMarginMinor: '4500000',
    marginPct: 22.7,
  };

  test.beforeEach(async ({ page }) => {
    await page.route('**/api/analytics/consolidation*', async (route) => {
      const url = new URL(route.request().url());
      const pivot = url.searchParams.get('pivot') ?? 'XOF';
      const body = {
        ...CONSOLIDATION_BASE,
        pivotCurrency: pivot,
        // EUR pivot scales to ~1/655 the XOF amount in cents — fake but distinct
        ...(pivot === 'EUR'
          ? {
              totalRevenueMinor: '3025000',
              totalCostMinor: '2340000',
              totalMarginMinor: '685000',
            }
          : {}),
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    });

    await page.route('**/api/analytics/budget/comparison*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            category: 'carburant',
            budgetMinor: '5000000',
            actualMinor: '5200000',
            variancePct: 4.0,
            status: 'on_track',
          },
          {
            category: 'maintenance',
            budgetMinor: '3000000',
            actualMinor: '3650000',
            variancePct: 21.7,
            status: 'over',
          },
        ]),
      });
    });
  });

  test('lands on consolidation tab, shows revenue + margin totals', async ({ page }) => {
    await page.goto('/finance');
    await expect(page).toHaveURL(/\/finance\/consolidation/);
    await expect(page.getByText(/Consolidation Multi-Sites/i)).toBeVisible();
    await expect(page.getByText('Revenue total')).toBeVisible();
    await expect(page.getByText('Marge')).toBeVisible();
    await expect(page.locator('[data-testid="consolidation-grid"]')).toBeVisible();
  });

  test('pivot switch XOF → EUR refetches with new aggregate', async ({ page }) => {
    await page.goto('/finance/consolidation');
    // Wait first XOF load
    await expect(page.getByText('Revenue total')).toBeVisible();

    let euroCallReceived = false;
    await page.route('**/api/analytics/consolidation*pivot=EUR*', async (route) => {
      euroCallReceived = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...CONSOLIDATION_BASE,
          pivotCurrency: 'EUR',
          totalRevenueMinor: '3025000',
          totalCostMinor: '2340000',
          totalMarginMinor: '685000',
          marginPct: 22.6,
        }),
      });
    });

    await page.getByRole('button', { name: 'EUR' }).click();
    await expect.poll(() => euroCallReceived, { timeout: 5_000 }).toBe(true);
  });

  test('tab strip routes to Budget vs Réel + OHADA Export', async ({ page }) => {
    await page.goto('/finance/consolidation');
    await page.getByRole('link', { name: /Budget vs Réel/i }).click();
    await expect(page).toHaveURL(/\/finance\/budget/);
    await expect(
      page.locator('[data-testid="provisional-badge"]'),
    ).toBeVisible();

    await page.getByRole('link', { name: /Export OHADA/i }).click();
    await expect(page).toHaveURL(/\/finance\/ohada-export/);
    await expect(page.getByText('Sage 100 OHADA')).toBeVisible();
    await expect(page.getByText('Ciel')).toBeVisible();
    await expect(page.getByText('Odoo')).toBeVisible();
  });

  test('OHADA target picker selects Sage by default + lets user pick Ciel', async ({ page }) => {
    await page.goto('/finance/ohada-export');
    const sageCard = page.getByRole('radio', { name: /Sage 100 OHADA/i });
    await expect(sageCard).toHaveAttribute('aria-checked', 'true');

    const cielCard = page.getByRole('radio', { name: /^Ciel/i });
    await cielCard.click();
    await expect(cielCard).toHaveAttribute('aria-checked', 'true');
    await expect(sageCard).toHaveAttribute('aria-checked', 'false');
  });
});
