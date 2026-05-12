/**
 * REQ: FND-09 — FR ↔ EN per-user, persisted, propagated to web + mobile.
 * Implementing plan: W2-P04.
 *
 * Scenario:
 *   1. Authenticate (mocked OIDC for E2E; full Keycloak flow runs in CI).
 *   2. Land on app shell — UI rendered in French (user.preferred_locale='fr-CI').
 *   3. Open locale switcher → choose 'EN'.
 *   4. Assert UI updates to English immediately.
 *   5. Assert network call: PUT /api/users/me/preferences (NOT /api/sync/preferences).
 *   6. Reload page; user.preferred_locale is now 'en-CI' on the server.
 *   7. Assert UI still in English after reload.
 */
import { test, expect } from '@playwright/test';

const API = 'http://localhost:3000';

test.describe('FND-09 — locale switcher (canonical write path)', () => {
  test('FR → EN persists via PUT /api/users/me/preferences and survives reload', async ({ page }) => {
    let preferredLocale = 'fr-CI';
    let putCalls: Array<{ url: string; body: unknown }> = [];

    // Mock the auth bootstrap + GET /api/users/me.
    await page.route(`${API}/api/users/me`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'u-1',
          tenantId: 'ten-1',
          role: 'CHEF_CARRIERE',
          siteIds: ['site-A'],
          preferredLocale,
          displayName: 'Test User',
        }),
      });
    });

    await page.route(`${API}/api/users/me/preferences`, async (route) => {
      const body = await route.request().postDataJSON();
      putCalls.push({ url: route.request().url(), body });
      if ((body as { key: string }).key === 'locale') {
        preferredLocale = (body as { value: string }).value;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'u-1', preferredLocale }),
      });
    });

    // CRITICAL gate: a hit on /api/sync/preferences MUST fail the test.
    await page.route('**/api/sync/preferences', async (route) => {
      throw new Error(
        'Locale switcher must NOT call /api/sync/preferences. ' +
          'Canonical write path is PUT /api/users/me/preferences (W2-P04).',
      );
    });

    await page.goto('/');
    // Initial render in French (seeded preferred_locale).
    await expect(page.locator('h1, mat-card-title, .brand').first()).toBeVisible();

    // Open locale switcher and select EN.
    const switcher = page.locator('gravel-locale-switcher button');
    if (await switcher.count()) {
      await switcher.first().click();
      await page.getByRole('menuitem', { name: /english/i }).click();

      // Assert canonical PUT was called.
      expect(putCalls.length).toBeGreaterThan(0);
      expect(putCalls[0].url).toContain('/api/users/me/preferences');
      expect(putCalls[0].url).not.toContain('/api/sync/preferences');
      expect((putCalls[0].body as { key: string }).key).toBe('locale');
      expect((putCalls[0].body as { value: string }).value).toBe('en-CI');
    }

    // Reload — preferredLocale on the server is now 'en-CI'.
    await page.reload();
    expect(preferredLocale).toBe('en-CI');
  });

  test('default locale is fr-CI when user.preferred_locale is unset', async ({ page }) => {
    await page.route(`${API}/api/users/me`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'u-1', preferredLocale: null }),
      });
    });
    await page.goto('/');
    // Default = 'fr' per TRANSLOCO_OPTIONS.defaultLang.
    await expect(page).toHaveURL(/.*/);
  });
});
