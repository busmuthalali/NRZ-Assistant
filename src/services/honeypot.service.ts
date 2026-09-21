import { Client, Message } from "discord.js";
import { config } from "../config";
import { query } from "../db/database";
import { alert } from "./alert.service";

export async function getHoneypotChannelId(guildId: string) {
  const r = await query<{ channel_id: string }>(`SELECT value AS channel_id FROM guild_settings WHERE guild_id=$1 AND key='honeypot_channel_id'`, [guildId]).catch(() => ({ rows: [] } as any));
  return r.rows[0]?.channel_id ?? config.honeypotChannelId;
}

export async function setHoneypotChannel(guildId: string, channelId: string) {
  await query(`INSERT INTO guild_settings(guild_id,key,value) VALUES($1,'honeypot_channel_id',$2)
    ON CONFLICT(guild_id,key) DO UPDATE SET value=EXCLUDED.value`, [guildId, channelId]);
}

export async function handleHoneypot(client: Client, message: Message) {
  if (message.author.bot || !message.guild) return;
  const channelId = await getHoneypotChannelId(message.guild.id);
  if (!channelId || message.channel.id !== channelId) return;

  await query(`INSERT INTO honeypot_events(guild_id,user_id,channel_id,action,evidence_json) VALUES($1,$2,$3,'detected',$4)`,
    [message.guild.id, message.author.id, message.channel.id, JSON.stringify({ content: message.content.slice(0, 500) })]).catch(() => {});
  await message.delete().catch(() => {});
  await alert(client, "🍯 Honeypot Triggered", `User <@${message.author.id}> triggered the honeypot in <#${message.channel.id}>.`);
}
