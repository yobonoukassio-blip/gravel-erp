// Local email/password auth migration + seed 3 demo users with bcrypt hashes.
// Idempotent. Safe to re-run.
import { Client } from 'pg';
import bcrypt from 'bcryptjs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(__dirname, 'src/modules/identity/migrations/1718400000000__local_auth_password.sql');
const sql = await readFile(sqlPath, 'utf8');

const TENANT_ID = '24cd97f8-0170-453e-89da-e9213dd710d7'; // Gravel Ivoire
const SITE_ID = '5213953c-3820-4da4-97ed-89bfbd605c07';   // Carrière Mobaye

// 3 demo accounts — same password for simplicity, can be changed in DB later.
const DEMO_PASSWORD = 'Gravel2026!';
const PASSWORD_HASH = await bcrypt.hash(DEMO_PASSWORD, 10);

const USERS = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'admin@gravel-ivoire.ci',
    displayName: 'Admin Gravel Ivoire',
    role: 'DIRECTION_GROUPE',
    groupScope: 'group',
    siteIds: [SITE_ID],
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    email: 'directeur.mobaye@gravel-ivoire.ci',
    displayName: 'Directeur Mobaye',
    role: 'DIRECTEUR_SITE',
    groupScope: null,
    siteIds: [SITE_ID],
  },
  {
    id: '00000000-0000-0000-0000-000000000003',
    email: 'chef.carriere@gravel-ivoire.ci',
    displayName: 'Chef Carrière',
    role: 'CHEF_CARRIERE',
    groupScope: null,
    siteIds: [SITE_ID],
  },
];

const c = new Client({ connectionString: DATABASE_URL });
await c.connect();

console.log('Applying local auth migration...');
await c.query(sql);

console.log('Seeding demo users...');
for (const u of USERS) {
  await c.query(
    `INSERT INTO users (id, tenant_id, keycloak_sub, email, display_name,
                        role, group_scope, site_ids, preferred_locale,
                        password_hash, created_at, updated_at)
     VALUES ($1, $2, NULL, $3, $4, $5, $6, $7, 'fr-CI', $8, now(), now())
     ON CONFLICT (id) DO UPDATE
       SET email = EXCLUDED.email,
           display_name = EXCLUDED.display_name,
           role = EXCLUDED.role,
           group_scope = EXCLUDED.group_scope,
           site_ids = EXCLUDED.site_ids,
           password_hash = EXCLUDED.password_hash,
           updated_at = now()`,
    [u.id, TENANT_ID, u.email, u.displayName, u.role, u.groupScope, u.siteIds, PASSWORD_HASH],
  );
  console.log(`  ✓ ${u.email} (${u.role})`);
}

console.log(`\nAll demo users password: ${DEMO_PASSWORD}\n`);
await c.end();
