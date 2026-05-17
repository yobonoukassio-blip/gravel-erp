import { FxRateService } from './fx-rate.service';

/**
 * ThreeRepAmounts (FND-07).
 *
 * Resolves the three monetary representations for an analytical entry:
 *   - amount_original_minor         : entered amount in source currency
 *   - amount_site_functional_minor  : converted to the site's functional currency
 *   - amount_group_minor            : converted to the group reporting currency (XOF)
 *
 * Plus two fx_rate_id references (one per conversion hop) and the two
 * target currencies. The writer ALSO returns the legacy
 * `amount_minor_units` + `currency` pair = site-functional, so old consumers
 * keep working.
 */
export interface ThreeRepAmounts {
  /** Legacy single-rep — set to site-functional for backward compat. */
  readonly amount_minor_units: string;
  readonly currency: string;
  /** New 3-rep columns. */
  readonly amount_original_minor: string;
  readonly amount_site_functional_minor: string;
  readonly amount_group_minor: string;
  readonly site_currency: string;
  readonly group_currency: string;
  /** Last fx_rate row touched (group hop preferred; null when identity). */
  readonly fx_rate_id: string | null;
}

/**
 * Compute the three representations for `amountMinor` paid in `sourceCurrency`,
 * given the site's functional currency and the group reporting currency.
 *
 * Defaults `groupCurrency` to XOF (the canonical group reporting currency for
 * Gravel Ivoire) when not supplied. Identity-fallback rates produce
 * `fx_rate_id = null` — that signals operations to backfill `fx_rate` later.
 */
export async function buildThreeRepAmounts(args: {
  fx: FxRateService;
  tenantId: string;
  entryDate: string; // YYYY-MM-DD
  amountMinor: bigint;
  sourceCurrency: string;
  siteCurrency: string;
  groupCurrency?: string;
}): Promise<ThreeRepAmounts> {
  const groupCurrency = args.groupCurrency ?? 'XOF';

  const toFunctional = await args.fx.convert({
    tenantId: args.tenantId,
    rateDate: args.entryDate,
    fromCurrency: args.sourceCurrency,
    toCurrency: args.siteCurrency,
    amountMinor: args.amountMinor,
  });

  const toGroup = await args.fx.convert({
    tenantId: args.tenantId,
    rateDate: args.entryDate,
    fromCurrency: args.siteCurrency,
    toCurrency: groupCurrency,
    amountMinor: toFunctional.convertedMinor,
  });

  return {
    amount_minor_units: toFunctional.convertedMinor.toString(),
    currency: args.siteCurrency,
    amount_original_minor: args.amountMinor.toString(),
    amount_site_functional_minor: toFunctional.convertedMinor.toString(),
    amount_group_minor: toGroup.convertedMinor.toString(),
    site_currency: args.siteCurrency,
    group_currency: groupCurrency,
    fx_rate_id: toGroup.fxRateId ?? toFunctional.fxRateId,
  };
}
