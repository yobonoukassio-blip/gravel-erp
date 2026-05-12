/**
 * @gravel/i18n — entry point.
 * Exports raw label JSON for each (module, locale) pair.
 * Web/Mobile codegen consumes these to produce framework-specific bundles.
 */
const fr = require('./labels/common/fr.json');
const en = require('./labels/common/en.json');

module.exports = {
  common: { fr, en },
};
