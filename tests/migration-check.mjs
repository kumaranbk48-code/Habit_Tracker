/**
 * HabiZ — fresh-database migration check
 * Proves the SQL in /supabase can build a NEW database from zero (staging / disaster recovery)
 * and that every public table has Row Level Security + at least one policy.
 *
 * Setup:  npm i -D @electric-sql/pglite      (in-memory Postgres, no Docker/Supabase needed)
 * Run:    node tests/migration-check.mjs
 * Exit code 1 = failure. Edit ORDER to match the intended run order once the SQL is fixed.
 * (PGlite has no uuid-ossp extension, so that line is stripped here; real Supabase has it.)
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../supabase') + '/';
const ORDER = [
  'complete_security_schema.sql',
  'learning_hub_schema.sql',
  'fix_all_issues_schema.sql',
  'alarm_reminders_schema.sql',
  'reminders_enhancement_schema.sql',
  'auto_tracking_schema.sql',
  'push_notifications_schema.sql',
  'seasons_schema.sql',
];

const db = new PGlite();
await db.exec(`
  CREATE SCHEMA IF NOT EXISTS auth;
  CREATE TABLE IF NOT EXISTS auth.users(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
    AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;`);

let failed = false;
for (const f of ORDER) {
  try {
    await db.exec(readFileSync(DIR + f, 'utf8').replace(/CREATE EXTENSION IF NOT EXISTS "uuid-ossp";/gi, ''));
    console.log('OK   ', f);
  } catch (e) {
    failed = true;
    console.log('FAIL ', f, '->', String(e.message).slice(0, 160));
  }
}

const tables = (await db.query(`
  SELECT t.tablename, t.rowsecurity,
         (SELECT count(*) FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=t.tablename) AS policies
  FROM pg_tables t WHERE t.schemaname='public' ORDER BY 1`)).rows;
console.log(`\n${tables.length} public tables`);
for (const t of tables) {
  if (!t.rowsecurity || Number(t.policies) < 1) { failed = true; console.log('  NO RLS/POLICY:', t.tablename); }
}
// Tables the API code queries (api/_routes/*.js) — must all exist.
const REQUIRED = ['habits','habit_tracking','goals','goal_milestones','reminders','reminder_events','user_achievements',
  'push_subscriptions','learning_journeys','learning_phases','learning_topics','learning_tasks','learning_resources',
  'learning_notes','learning_activities','journey_habit_connections','seasons','season_habits','learning_practice_logs','profiles'];
const have = new Set(tables.map((t) => t.tablename));
for (const r of REQUIRED) if (!have.has(r)) { failed = true; console.log('  MISSING TABLE:', r); }

console.log(failed ? '\nRESULT: FAIL' : '\nRESULT: PASS');
process.exit(failed ? 1 : 0);
