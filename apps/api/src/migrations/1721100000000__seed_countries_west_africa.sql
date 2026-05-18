-- Seed countries for every existing tenant so the Site form's country
-- dropdown has options out of the box. Idempotent: ON CONFLICT skip via
-- the UNIQUE(tenant_id, iso_alpha2) index.

INSERT INTO countries (tenant_id, iso_alpha2, name, default_currency, default_timezone)
SELECT t.id, c.iso, c.name, c.cur, c.tz
FROM tenants t
CROSS JOIN (
  VALUES
    ('CI', 'Côte d''Ivoire',           'XOF', 'Africa/Abidjan'),
    ('BF', 'Burkina Faso',             'XOF', 'Africa/Ouagadougou'),
    ('ML', 'Mali',                     'XOF', 'Africa/Bamako'),
    ('SN', 'Sénégal',                  'XOF', 'Africa/Dakar'),
    ('GH', 'Ghana',                    'GHS', 'Africa/Accra'),
    ('NG', 'Nigeria',                  'NGN', 'Africa/Lagos'),
    ('TG', 'Togo',                     'XOF', 'Africa/Lome'),
    ('BJ', 'Bénin',                    'XOF', 'Africa/Porto-Novo'),
    ('NE', 'Niger',                    'XOF', 'Africa/Niamey'),
    ('GN', 'Guinée',                   'GNF', 'Africa/Conakry'),
    ('CM', 'Cameroun',                 'XAF', 'Africa/Douala'),
    ('GA', 'Gabon',                    'XAF', 'Africa/Libreville'),
    ('CD', 'République démocratique du Congo', 'CDF', 'Africa/Kinshasa'),
    ('MA', 'Maroc',                    'MAD', 'Africa/Casablanca'),
    ('FR', 'France',                   'EUR', 'Europe/Paris')
) AS c(iso, name, cur, tz)
ON CONFLICT (tenant_id, iso_alpha2) DO NOTHING;
