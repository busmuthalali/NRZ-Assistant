import { EmbedBuilder, Client, TextChannel } from "discord.js";
import { config } from "../config";
import { query } from "../db/database";

export async function logEvent(client: Client, guildId: string, type: string, data: {
  actorId?: string; targetId?: string; channelId?: string; description?: string; fields?: Record<string,string>;
}) {
  try {
    await query(
      `INSERT INTO audit_logs(guild_id,event_type,actor_id,target_id,channel_id,data_json)
       VALUES($1,$2,$3,$4,$5,$6)`,
      [guildId,type,data.actorId ?? null,data.targetId ?? null,data.channelId ?? null,
       JSON.stringify(data.fields ?? {})]
    );
  } catch {}

  const id = config.logChannelId;
  if (!id) return;
  const ch = await client.channels.fetch(id).catch(() => null);
  if (!ch || !ch.isTextBased()) return;
  const embed = new EmbedBuilder().setTitle(`📋 ${type}`).setDescription(data.description ?? "Server event")
    .setTimestamp();
  if (data.fields) for (const [k,v] of Object.entries(data.fields).slice(0,25)) embed.addFields({name:k,value:v.slice(0,1024)});
  await (ch as TextChannel).send({embeds:[embed]}).catch(() => {});
}
