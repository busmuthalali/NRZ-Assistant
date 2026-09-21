import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle, Client, Interaction } from "discord.js";
import { query } from "../db/database";

export async function showApplication(interaction:Interaction) {
  if (!interaction.isChatInputCommand()) return;
  const modal = new ModalBuilder().setCustomId("form_application").setTitle("Gaming Server Application");
  const name = new TextInputBuilder().setCustomId("name").setLabel("Character / Name").setStyle(TextInputStyle.Short).setRequired(true);
  const reason = new TextInputBuilder().setCustomId("reason").setLabel("Why should we accept you?").setStyle(TextInputStyle.Paragraph).setRequired(true);
  const experience = new TextInputBuilder().setCustomId("experience").setLabel("RP / Gaming experience").setStyle(TextInputStyle.Paragraph).setRequired(false);
  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(name),new ActionRowBuilder<TextInputBuilder>().addComponents(reason),new ActionRowBuilder<TextInputBuilder>().addComponents(experience));
  await interaction.showModal(modal);
}

export async function handleForm(interaction:Interaction, client:Client) {
  if (!interaction.isModalSubmit() || interaction.customId!=="form_application") return false;
  const data={name:interaction.fields.getTextInputValue("name"),reason:interaction.fields.getTextInputValue("reason"),experience:interaction.fields.getTextInputValue("experience")};
  await query(`INSERT INTO forms(guild_id,type,user_id,data_json) VALUES($1,'application',$2,$3)`,[interaction.guildId,interaction.user.id,JSON.stringify(data)]);
  const row=new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("form_accept").setLabel("Accept").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("form_deny").setLabel("Deny").setStyle(ButtonStyle.Danger)
  );
  const ch=interaction.channel;
  if (ch?.isSendable()) await ch.send({content:`📋 New application from <@${interaction.user.id}>`,components:[row]});
  await interaction.reply({content:"Your application has been submitted.",ephemeral:true});
  return true;
}
