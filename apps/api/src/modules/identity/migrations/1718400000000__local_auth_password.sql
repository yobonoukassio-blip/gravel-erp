-- Local email/password auth alongside Keycloak (FND-01 demo path).
-- Adds password_hash + last_login_at columns to users so a custom
-- /auth/login endpoint can mint a local HS256 JWT. Keycloak SSO still
-- works for users with a non-null keycloak_sub.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_hash TEXT,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

-- keycloak_sub becomes nullable so local-only users (no SSO) can exist
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = 'users'
       AND column_name = 'keycloak_sub'
       AND is_nullable = 'NO'
  ) THEN
    EXECUTE 'ALTER TABLE users ALTER COLUMN keycloak_sub DROP NOT NULL';
  END IF;
END $$;
