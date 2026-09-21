import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, Interaction, PermissionFlagsBits } from "discord.js";
import { collection } from "../db/database";

export async function createTicket(interaction: any) {
  if (!interaction.guild) return interaction.reply({ content: "Tickets can only be created inside a server.", ephemeral: true });

  const existing = await collection<{channel_id:string}>("tickets").findOne({guild_id:interaction.guild.id,user_id:interaction.user.id,status:"open"});
  const existingChannel = existing?.channel_id ? interaction.guild.channels.cache.get(existing.channel_id) : null;
  if (existingChannel) return interaction.reply({ content: `You already have an open ticket: <#${existingChannel.id}>`, ephemeral: true });

  let category = interaction.guild.channels.cache.find((c: any) => c.type === ChannelType.GuildCategory && c.name === "🎫 TICKETS");
  if (!category) category = await interaction.guild.channels.create({ name: "🎫 TICKETS", type: ChannelType.GuildCategory });

  const channel = await interaction.guild.channels.create({
    name: `ticket-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 80) || `ticket-${interaction.user.id}`,
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: [
      { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      { id: interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] }
    ]
  });

  await collection("tickets").insertOne({guild_id:interaction.guild.id,channel_id:channel.id,user_id:interaction.user.id,status:"open",created_at:new Date()});
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("ticket_close").setLabel("Close Ticket").setStyle(ButtonStyle.Danger)
  );
  await channel.send({ content: `🎫 Welcome <@${interaction.user.id}>! Please describe your issue.`, components: [row] });
  return interaction.reply({ content: `Ticket created: <#${channel.id}>`, ephemeral: true });
}

export async function handleTicketButton(interaction: Interaction) {
  if (!interaction.isButton() || interaction.customId !== "ticket_close") return false;
  if (!interaction.guild || !interaction.channel) return true;
  await collection("tickets").updateOne({guild_id:interaction.guild.id,channel_id:interaction.channel.id,status:"open"},{$set:{status:"closed",closed_at:new Date()}});
  await interaction.reply({ content: "🔒 Ticket closed. This channel will be deleted in 5 seconds." });
  setTimeout(() => interaction.channel?.delete("Ticket closed").catch(() => {}), 5000);
  return true;
}
