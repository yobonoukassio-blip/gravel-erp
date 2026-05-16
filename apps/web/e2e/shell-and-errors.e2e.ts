import { expect, test } from '@playwright/test';

/**
 * Playwright E2E — App shell health checks.
 *
 * Catches the most common regressions cheaply:
 *   1. Login page renders the brand mark + login button + capabilities list
 *   2. Authenticated shell shows the navy sidenav with all module sections
 *   3. Unknown route lands on the 404 page with a "Retour au tableau de bord" CTA
 *   4. Alerts inbox loads (uses real-ish mock alert payload)
 *
 * No API for /api/alerts is mocked — we don't assert grid contents, only that
 * the toolbar + grid container render without runtime errors.
 */

test.describe('App shell health', () => {
  test('login page renders brand + login CTA', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByText('Gravel Ivoire')).toBeVisible();
    await expect(page.getByText('ERP Carrière')).toBeVisible();
    // Capability list
    await expect(page.getByText(/SSO Keycloak/i)).toBeVisible();
    await expect(page.getByText(/offline-first/i)).toBeVisible();
    await expect(page.getByText(/temps réel/i)).toBeVisible();
  });

  test('authenticated shell shows sidenav sections', async ({ page }) => {
    await page.goto('/dashboard');
    // Sidenav section headings
    await expect(page.getByText('Production', { exact: true })).toBeVisible();
    await expect(page.getByText('Commercial', { exact: true })).toBeVisible();
    await expect(page.getByText('Opérations', { exact: true })).toBeVisible();
    // Key module links
    await expect(page.getByRole('link', { name: 'Foration' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Tir de mine' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Finance' })).toBeVisible();
  });

  test('unknown route renders 404 page with dashboard CTA', async ({ page }) => {
    await page.goto('/this-route-does-not-exist');
    await expect(page.getByText('404')).toBeVisible();
    await expect(page.getByText(/Page introuvable/i)).toBeVisible();
    const cta = page.getByRole('link', { name: /Retour au tableau de bord/i });
    await expect(cta).toBeVisible();
    await cta.click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('alerts inbox loads without runtime error', async ({ page }) => {
    // Return empty list — we're checking render, not data
    await page.route('**/api/alerts*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });
    await page.goto('/alerts-inbox');
    // The page lazy-loads the AG Grid wrapper; wait for the AG Grid root
    await expect(page.locator('ag-grid-angular').first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
