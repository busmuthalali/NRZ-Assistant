import { Pool, QueryResultRow } from "pg";
import { config } from "../config";

export const pool = new Pool({ connectionString: config.databaseUrl });

export async function initDb() {
  if (!config.databaseUrl) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS warnings (
      id SERIAL PRIMARY KEY, guild_id TEXT NOT NULL, user_id TEXT NOT NULL,
      moderator_id TEXT NOT NULL, reason TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS voice_sessions (
      id BIGSERIAL PRIMARY KEY, guild_id TEXT NOT NULL, user_id TEXT NOT NULL,
      channel_id TEXT NOT NULL, joined_at TIMESTAMPTZ NOT NULL,
      left_at TIMESTAMPTZ, duration_seconds BIGINT DEFAULT 0,
      self_muted BOOLEAN DEFAULT FALSE, self_deafened BOOLEAN DEFAULT FALSE,
      server_muted BOOLEAN DEFAULT FALSE, server_deafened BOOLEAN DEFAULT FALSE,
      streaming BOOLEAN DEFAULT FALSE, camera BOOLEAN DEFAULT FALSE,
      counted_seconds BIGINT DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS activity_stats (
      guild_id TEXT NOT NULL, user_id TEXT NOT NULL, period_type TEXT NOT NULL,
      period_start DATE NOT NULL, messages BIGINT DEFAULT 0,
      voice_seconds BIGINT DEFAULT 0, fivem_seconds BIGINT DEFAULT 0,
      xp BIGINT DEFAULT 0, updated_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY(guild_id,user_id,period_type,period_start)
    );
    CREATE TABLE IF NOT EXISTS xp_accounts (
      guild_id TEXT NOT NULL, user_id TEXT NOT NULL, xp BIGINT DEFAULT 0,
      level BIGINT DEFAULT 1, last_message_at TIMESTAMPTZ,
      PRIMARY KEY(guild_id,user_id)
    );
    CREATE TABLE IF NOT EXISTS fivem_sessions (
      id BIGSERIAL PRIMARY KEY, guild_id TEXT NOT NULL, user_id TEXT,
      server_id TEXT, joined_at TIMESTAMPTZ, left_at TIMESTAMPTZ,
      duration_seconds BIGINT DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGSERIAL PRIMARY KEY, guild_id TEXT NOT NULL, event_type TEXT NOT NULL,
      actor_id TEXT, target_id TEXT, channel_id TEXT, data_json JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS honeypot_events (
      id BIGSERIAL PRIMARY KEY, guild_id TEXT NOT NULL, user_id TEXT NOT NULL,
      channel_id TEXT NOT NULL, action TEXT NOT NULL, evidence_json JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS forms (
      id BIGSERIAL PRIMARY KEY, guild_id TEXT NOT NULL, type TEXT NOT NULL,
      user_id TEXT NOT NULL, data_json JSONB NOT NULL, status TEXT DEFAULT 'pending',
      reviewer_id TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS tickets (
      id BIGSERIAL PRIMARY KEY, guild_id TEXT NOT NULL, channel_id TEXT NOT NULL,
      user_id TEXT NOT NULL, claimed_by TEXT, status TEXT DEFAULT 'open',
      created_at TIMESTAMPTZ DEFAULT NOW(), closed_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS guild_settings (
      guild_id TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL,
      PRIMARY KEY(guild_id,key)
    );
    CREATE TABLE IF NOT EXISTS free_games (
      id BIGSERIAL PRIMARY KEY, store TEXT NOT NULL, external_id TEXT,
      title TEXT NOT NULL, url TEXT NOT NULL, starts_at TIMESTAMPTZ,
      ends_at TIMESTAMPTZ, posted_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(store, external_id)
    );
  `);
}

export async function query<T extends QueryResultRow = any>(text: string, params: any[] = []) {
  return pool.query<T>(text, params);
}
