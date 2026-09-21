import { Client, EmbedBuilder } from "discord.js";
import { config } from "../config";

export async function alert(client:Client, title:string, description:string) {
  if (!config.alertChannelId) return;
  const ch = await client.channels.fetch(config.alertChannelId).catch(()=>null);
  if (!ch?.isSendable()) return;
  await ch.send({embeds:[new EmbedBuilder().setTitle(title).setDescription(description).setTimestamp()]}).catch(()=>{});
}
