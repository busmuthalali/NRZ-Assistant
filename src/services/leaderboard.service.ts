import { Guild, GuildMember } from "discord.js";
import { query } from "../db/database";
import { getActiveVoiceSeconds, getActiveVoiceMembers } from "./voice.service";

export type LeaderboardMetric = "voice" | "messages" | "xp" | "fivem";
export type LeaderboardEntry = { userId: string; value: number; member: GuildMember; activeChannel?: string };

const columns: Record<LeaderboardMetric, string> = {
  voice: "voice_seconds", messages: "messages", xp: "xp", fivem: "fivem_seconds"
};

export async function getLeaderboard(guild: Guild, metric: LeaderboardMetric): Promise<LeaderboardEntry[]> {
  await guild.members.fetch();
  const members = [...guild.members.cache.values()].filter(m => !m.user.bot);
  const col = columns[metric];
  const result = await query<{ user_id: string; value: string }>(
    `SELECT user_id, COALESCE(${col},0)::text AS value FROM activity_stats WHERE guild_id=$1 AND period_type='all'`,
    [guild.id]
  );
  const values = new Map<string, number>(result.rows.map(row => [row.user_id, Number(row.value) || 0]));
  const active = new Map(getActiveVoiceMembers(guild.id).map(x => [x.userId, x]));
  if (metric === "voice") {
    for (const [userId, seconds] of getActiveVoiceSeconds(guild.id)) values.set(userId, (values.get(userId) ?? 0) + seconds);
  }
  return members.map(member => ({
    userId: member.id,
    value: values.get(member.id) ?? 0,
    member,
    activeChannel: metric === "voice" ? active.get(member.id)?.channelName : undefined
  })).sort((a,b) => b.value-a.value || a.member.displayName.localeCompare(b.member.displayName));
}

export async function resetLeaderboard(guildId: string, metric: LeaderboardMetric) {
  const col = columns[metric];
  await query(`UPDATE activity_stats SET ${col}=0, updated_at=NOW() WHERE guild_id=$1 AND period_type='all'`, [guildId]);
  if (metric === "voice") await query(`DELETE FROM voice_sessions WHERE guild_id=$1`, [guildId]);
}

export async function leaderboard(guildId: string, metric: string, limit = 10) {
  const col = columns[metric as LeaderboardMetric] ?? "xp";
  const r = await query(`SELECT user_id, ${col} AS value FROM activity_stats WHERE guild_id=$1 AND period_type='all' ORDER BY ${col} DESC LIMIT $2`, [guildId, limit]);
  return r.rows as { user_id: string, value: string }[];
}

export function levelForXp(xp:number) { return Math.floor(Math.sqrt(Math.max(0,xp)/100))+1; }
