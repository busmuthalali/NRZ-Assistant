import { EmbedBuilder, Client, TextChannel } from "discord.js";
import { config } from "../config";
import { collection } from "../db/database";

export async function logEvent(client: Client, guildId: string, type: string, data: {
  actorId?: string; targetId?: string; channelId?: string; description?: string; fields?: Record<string,string>;
}) {
  try {
    await collection("audit_logs").insertOne({guild_id:guildId,event_type:type,actor_id:data.actorId ?? null,target_id:data.targetId ?? null,channel_id:data.channelId ?? null,data:data.fields ?? {},created_at:new Date()});
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
