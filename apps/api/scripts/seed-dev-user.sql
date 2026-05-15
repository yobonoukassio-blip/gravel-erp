-- Seed du user DEV (DEV_BYPASS_JWT injecte ces UUIDs)
-- À exécuter dans Supabase SQL Editor

INSERT INTO users (id, tenant_id, role, preferred_locale, status, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  '24cd97f8-0170-453e-89da-e9213dd710d7',
  'DIRECTION_GROUPE',
  'fr-CI',
  'active',
  now(),
  now()
)
ON CONFLICT (id) DO NOTHING;

-- Lier le user au site Carrière Mobaye via user_site (si la table existe)
INSERT INTO user_sites (user_id, site_id, created_at)
SELECT
  '00000000-0000-0000-0000-000000000001',
  '5213953c-3820-4da4-97ed-89bfbd605c07',
  now()
WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_sites')
ON CONFLICT DO NOTHING;

SELECT id, role, preferred_locale, status FROM users WHERE id = '00000000-0000-0000-0000-000000000001';
