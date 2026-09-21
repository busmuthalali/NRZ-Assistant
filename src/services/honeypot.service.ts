import { Client, Message } from "discord.js";
import { config } from "../config";
import { collection } from "../db/database";
import { alert } from "./alert.service";

export async function getHoneypotChannelId(guildId: string) {
  const r = await collection<{value:string}>("guild_settings").findOne({guild_id:guildId,key:"honeypot_channel_id"}).catch(() => null);
  return r?.value ?? config.honeypotChannelId;
}

export async function setHoneypotChannel(guildId: string, channelId: string) {
  await collection("guild_settings").updateOne({guild_id:guildId,key:"honeypot_channel_id"},{$set:{value:channelId}},{upsert:true});
}

export async function handleHoneypot(client: Client, message: Message) {
  if (message.author.bot || !message.guild) return;
  const channelId = await getHoneypotChannelId(message.guild.id);
  if (!channelId || message.channel.id !== channelId) return;

  await collection("honeypot_events").insertOne({guild_id:message.guild.id,user_id:message.author.id,channel_id:message.channel.id,action:"detected",evidence:{content:message.content.slice(0,500)},created_at:new Date()}).catch(() => {});
  await message.delete().catch(() => {});
  await alert(client, "🍯 Honeypot Triggered", `User <@${message.author.id}> triggered the honeypot in <#${message.channel.id}>.`);
}
