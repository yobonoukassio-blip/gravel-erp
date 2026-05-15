#!/usr/bin/env node
// Verify a fresh Supabase Postgres password and emit the DATABASE_URL ready
// to paste into Railway / GitHub secrets / Vercel env.
//
// Usage:
//   NEW_PASSWORD='xxx' node apps/api/scripts/verify-supabase-password.mjs
//
// Optional overrides:
//   SUPABASE_PROJECT_REF (default: qrkfkfhzavqjorhrlluj)
//   SUPABASE_REGION      (default: aws-0-eu-west-1)
//
// Does NOT write anything: prints the DATABASE_URL plus a checklist of the
// 3 places to update. Password rotation itself happens in the Supabase
// dashboard — this script just validates the rotation worked.

import dns from 'node:dns';
import { Client } from 'pg';

dns.setDefaultResultOrder('ipv4first');
process.env.NODE_TLS_REJECT_UNAUTHORIZED ??= '0';

const password = process.env.NEW_PASSWORD;
if (!password) {
  console.error('FATAL: NEW_PASSWORD env var is required.');
  console.error('Example:');
  console.error('  NEW_PASSWORD=YourNewPassword node apps/api/scripts/verify-supabase-password.mjs');
  process.exit(1);
}

const projectRef = process.env.SUPABASE_PROJECT_REF ?? 'qrkfkfhzavqjorhrlluj';
const region     = process.env.SUPABASE_REGION      ?? 'aws-0-eu-west-1';

const encoded = encodeURIComponent(password);
const dsn = `postgresql://postgres.${projectRef}:${encoded}@${region}.pooler.supabase.com:6543/postgres?sslmode=require`;

console.log(`Testing connection as postgres.${projectRef} against ${region}.pooler.supabase.com:6543 …`);

const c = new Client({ connectionString: dsn });
try {
  await c.connect();
  const r = await c.query("SELECT current_user, current_database(), version()");
  console.log('\nConnection OK.');
  console.log(`  user:    ${r.rows[0].current_user}`);
  console.log(`  db:      ${r.rows[0].current_database}`);
  console.log(`  version: ${r.rows[0].version.split(',')[0]}`);

  const od = await c.query(
    "SELECT count(*)::int AS n FROM operational_days WHERE business_date = CURRENT_DATE",
  );
  console.log(`  operational_days for today: ${od.rows[0].n}`);

  await c.end();
} catch (err) {
  console.error('\nFATAL: cannot connect with the supplied NEW_PASSWORD.');
  console.error(`  reason: ${err.message}`);
  console.error('\nMake sure you reset the Supabase DB password before running this script.');
  process.exit(1);
}

console.log('\n────────────────────────────────────────────────────────────────');
console.log('DATABASE_URL to paste (copy the next line, ONE line):');
console.log('────────────────────────────────────────────────────────────────');
console.log(dsn);
console.log('────────────────────────────────────────────────────────────────');

console.log('\nUpdate this value in EXACTLY 3 places:');
console.log('  1. Railway → project "kind-balance" → service "gravel-erp" → Variables → DATABASE_URL');
console.log('     (Railway will auto-redeploy the API.)');
console.log('  2. GitHub → repo Settings → Secrets and variables → Actions → DATABASE_URL');
console.log('     (Used by .github/workflows/deploy.yml `migrate` job.)');
console.log('  3. Vercel → project "gravel-erp-web" → Settings → Environment Variables → DATABASE_URL');
console.log('     (Optional — only if any Vercel Edge / Serverless Function reads the DB. Today: no.)');
console.log('\nAfter step 1 + 2, push any commit (or trigger a workflow re-run) to verify the migrate');
console.log('job + Railway redeploy both succeed with the new credential.');
