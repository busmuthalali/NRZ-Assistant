import { Guild, GuildMember } from "discord.js";
import { collection } from "../db/database";
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
  const result = await collection<{user_id:string;[key:string]:unknown}>("activity_stats").find({guild_id:guild.id,period_type:"all"}).toArray();
  const values = new Map<string, number>(result.map(row => [row.user_id, Number(row[col]) || 0]));
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
  await collection("activity_stats").updateMany({guild_id:guildId,period_type:"all"},{$set:{[col]:0,updated_at:new Date()}});
  if (metric === "voice") await collection("voice_sessions").deleteMany({guild_id:guildId});
}

export async function leaderboard(guildId: string, metric: string, limit = 10) {
  const col = columns[metric as LeaderboardMetric] ?? "xp";
  const r = await collection<{user_id:string;[key:string]:unknown}>("activity_stats").find({guild_id:guildId,period_type:"all"}).sort({[col]:-1}).limit(limit).toArray();
  return r.map(row => ({user_id:row.user_id,value:String(row[col] ?? 0)}));
}

export function levelForXp(xp:number) { return Math.floor(Math.sqrt(Math.max(0,xp)/100))+1; }
