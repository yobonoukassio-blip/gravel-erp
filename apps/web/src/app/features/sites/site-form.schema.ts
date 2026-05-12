import type { FormlyFieldConfig } from '@ngx-formly/core';

/**
 * Curated minimal IANA timezone list for African + European tenants. The
 * server validates the wire value against the full IANA database; this list
 * is just the UI dropdown source.
 */
export const IANA_TIMEZONES = [
  'Africa/Abidjan',
  'Africa/Accra',
  'Africa/Lagos',
  'Africa/Bamako',
  'Africa/Ouagadougou',
  'Africa/Dakar',
  'Africa/Casablanca',
  'Africa/Johannesburg',
  'Europe/Paris',
  'Europe/London',
  'UTC',
] as const;

export const FUNCTIONAL_CURRENCIES = ['XOF', 'XAF', 'EUR', 'USD'] as const;

/**
 * Formly schema for the Site form (D-24). All labels reference i18n keys —
 * no inline strings, per Pitfall 9.
 */
export const siteFormSchema: FormlyFieldConfig[] = [
  {
    key: 'code',
    type: 'input',
    props: {
      label: 'sites.fields.code',
      required: true,
      pattern: '^[a-zA-Z0-9-_]{3,30}$',
      attributes: { 'data-testid': 'site-code-input' },
    },
  },
  {
    key: 'name',
    type: 'input',
    props: {
      label: 'sites.fields.name',
      required: true,
      attributes: { 'data-testid': 'site-name-input' },
    },
  },
  {
    key: 'countryId',
    type: 'select',
    props: {
      label: 'sites.fields.country',
      required: true,
      options: [],
      attributes: { 'data-testid': 'site-country-select' },
    },
  },
  {
    key: 'ianaTimezone',
    type: 'select',
    props: {
      label: 'sites.fields.timezone',
      required: true,
      options: IANA_TIMEZONES.map((tz) => ({ label: tz, value: tz })),
      attributes: { 'data-testid': 'site-timezone-select' },
    },
  },
  {
    key: 'functionalCurrency',
    type: 'select',
    props: {
      label: 'sites.fields.currency',
      required: true,
      options: FUNCTIONAL_CURRENCIES.map((c) => ({ label: c, value: c })),
      attributes: { 'data-testid': 'site-currency-select' },
    },
  },
  {
    key: 'gpsPoint',
    type: 'gps-picker-leaflet',
    props: {
      label: 'sites.fields.gps',
      required: true,
    },
  },
  {
    key: 'managerUserId',
    type: 'select',
    props: {
      label: 'sites.fields.manager',
      options: [],
      attributes: { 'data-testid': 'site-manager-select' },
    },
  },
  {
    key: 'capacityTPerDay',
    type: 'input',
    props: {
      label: 'sites.fields.capacity',
      type: 'number',
      min: 0,
      attributes: { 'data-testid': 'site-capacity-input' },
    },
  },
];
