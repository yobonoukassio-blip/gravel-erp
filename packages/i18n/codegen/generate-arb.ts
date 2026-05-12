#!/usr/bin/env node
/**
 * Codegen: shared business labels (packages/i18n/labels/**) → outputs:
 *   - apps/mobile/lib/l10n/intl_fr.arb
 *   - apps/mobile/lib/l10n/intl_en.arb
 *   - apps/web/src/assets/i18n/labels-fr.json
 *   - apps/web/src/assets/i18n/labels-en.json
 *
 * Source of truth: packages/i18n/labels/<module>/<locale>.json
 *
 * Single source means: when a business label is added in FR/EN here, both
 * web AND mobile pick it up without manual sync (D-31 i18n source of truth).
 *
 * Usage:
 *   pnpm --filter @gravel/i18n run i18n:gen
 *   (CI step fails when generated files are out of date — see .github/workflows.)
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const LABELS_DIR = path.join(ROOT, 'labels');
const REPO_ROOT = path.resolve(ROOT, '..', '..');
const MOBILE_L10N = path.join(REPO_ROOT, 'apps', 'mobile', 'lib', 'l10n');
const WEB_ASSETS_I18N = path.join(REPO_ROOT, 'apps', 'web', 'src', 'assets', 'i18n');

const LOCALES = ['fr', 'en'] as const;
type Locale = (typeof LOCALES)[number];

interface LabelMap {
  [key: string]: string;
}

function readModule(moduleDir: string, locale: Locale): LabelMap {
  const file = path.join(moduleDir, `${locale}.json`);
  if (!fs.existsSync(file)) return {};
  const raw = fs.readFileSync(file, 'utf8');
  return JSON.parse(raw) as LabelMap;
}

function mergeAllModules(locale: Locale): LabelMap {
  const merged: LabelMap = {};
  for (const entry of fs.readdirSync(LABELS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const moduleDir = path.join(LABELS_DIR, entry.name);
    Object.assign(merged, readModule(moduleDir, locale));
  }
  return merged;
}

function toFlutterArbKey(jsonKey: string): string {
  // Flutter ARB keys must be valid Dart identifiers.
  return jsonKey.replace(/[^a-zA-Z0-9_]/g, '_');
}

function writeArb(locale: Locale, labels: LabelMap): void {
  fs.mkdirSync(MOBILE_L10N, { recursive: true });
  const arb: Record<string, string> = { '@@locale': locale };
  for (const [k, v] of Object.entries(labels)) {
    arb[toFlutterArbKey(k)] = v;
  }
  const target = path.join(MOBILE_L10N, `intl_${locale}.arb`);
  fs.writeFileSync(target, JSON.stringify(arb, null, 2) + '\n', 'utf8');
  console.log(`[i18n] wrote ${target} (${Object.keys(labels).length} keys)`);
}

function writeWebLabels(locale: Locale, labels: LabelMap): void {
  fs.mkdirSync(WEB_ASSETS_I18N, { recursive: true });
  const target = path.join(WEB_ASSETS_I18N, `labels-${locale}.json`);
  fs.writeFileSync(target, JSON.stringify(labels, null, 2) + '\n', 'utf8');
  console.log(`[i18n] wrote ${target} (${Object.keys(labels).length} keys)`);
}

function main(): void {
  for (const locale of LOCALES) {
    const merged = mergeAllModules(locale);
    writeArb(locale, merged);
    writeWebLabels(locale, merged);
  }
}

main();
