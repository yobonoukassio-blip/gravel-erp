/**
 * @gravel/i18n — entry point.
 * Exports raw label JSON for each (module, locale) pair.
 * Web/Mobile codegen consumes these to produce framework-specific bundles.
 *
 * Codegen: `packages/i18n/codegen/generate-arb.ts`
 *   → apps/mobile/lib/l10n/intl_{fr,en}.arb
 *   → apps/web/src/assets/i18n/labels-{fr,en}.json
 */
const commonFr = require('./labels/common/fr.json');
const commonEn = require('./labels/common/en.json');
const authFr = require('./labels/auth/fr.json');
const authEn = require('./labels/auth/en.json');

module.exports = {
  common: { fr: commonFr, en: commonEn },
  auth: { fr: authFr, en: authEn },
  merged: {
    fr: { ...commonFr, ...authFr },
    en: { ...commonEn, ...authEn },
  },
};
