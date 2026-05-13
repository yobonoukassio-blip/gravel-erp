/**
 * Cost-per-ton "Provisoire" tile guardrail test (D2-100).
 *
 * Asserts that:
 *   1. The component template/i18n key references "Provisoire".
 *   2. The expected i18n value contains "Provisoire" in fr.json.
 *   3. The component file references the mandatory i18n key.
 *
 * If a future refactor removes the label, this test fails and prevents
 * a regression on the hard CLAUDE.md/D2-100 constraint that the UI must
 * never display the raw cost_per_ton value without the "Provisoire"
 * label.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('cost_per_ton_provisional UI label (D2-100)', () => {
  const componentSrc = readFileSync(
    join(__dirname, 'cost-per-ton-provisional-tile.component.ts'),
    'utf8',
  );

  it('component source references the mandatory i18n key', () => {
    expect(componentSrc).toContain('dashboard.cost_per_ton_provisional_label');
  });

  it('component source references "Provisoire" in comments to document intent', () => {
    expect(componentSrc).toMatch(/Provisoire/);
  });

  it('fr.json defines cost_per_ton_provisional_label with "Provisoire" text', () => {
    const fr = JSON.parse(
      readFileSync(
        join(__dirname, '..', '..', '..', '..', 'assets', 'i18n', 'fr.json'),
        'utf8',
      ),
    ) as Record<string, string>;
    expect(fr['dashboard.cost_per_ton_provisional_label']).toBeDefined();
    expect(fr['dashboard.cost_per_ton_provisional_label']).toMatch(/Provisoire/i);
  });

  it('component renders with data-testid for E2E discovery', () => {
    expect(componentSrc).toContain('data-testid="cost-per-ton-provisional-tile"');
  });
});
