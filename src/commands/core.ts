import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { collection } from "../db/database";
import { getLeaderboard, LeaderboardMetric, resetLeaderboard } from "../services/leaderboard.service";
import { getFiveMInfo } from "../services/fivem.service";
import { config } from "../config";
import { showApplication } from "../services/forms.service";
import { createTicket } from "../services/ticket.service";
import { setHoneypotChannel } from "../services/honeypot.service";
import { getVoiceStats, getActiveVoiceMembers, resetActiveVoiceLeaderboard, syncActiveVoice } from "../services/voice.service";

const VOICE_LEADERBOARD_REFRESH_MS=10*1000;
const labels:Record<LeaderboardMetric,string>={voice:"Voice Activity",messages:"Messages",xp:"XP",fivem:"FiveM Time"};
const fmt=(s:number)=>{const h=Math.floor(s/3600),m=Math.floor(s%3600/60),sec=s%60;return `${h}h ${m}m ${sec}s`;};
const roles=(m:any)=>{const names=[...m.roles.cache.values()].map((r:any)=>String(r.name).toLowerCase());return {nrz:names.includes("nrz"),verified:names.includes("verified")};};

async function buildLeaderboard(guild:any,metric:LeaderboardMetric){
  if(metric==="voice") syncActiveVoice(guild);
  const entries=await getLeaderboard(guild,metric);
  const active=getActiveVoiceMembers(guild.id);
  const activeMap=new Map(active.map(x=>[x.userId,x]));

  // Only the two requested role groups. Members with both roles are placed in
  // NRZ first so nobody is duplicated between the two leaderboard sections.
  const nrz:any[]=[];
  const verified:any[]=[];
  for(const e of entries){
    const names=[...e.member.roles.cache.values()].map((r:any)=>String(r.name).trim().toLowerCase());
    const item={...e,active:activeMap.get(e.userId)};
    if(names.includes("nrz")) nrz.push(item);
    else if(names.includes("verified")) verified.push(item);
  }

  const lines=(arr:any[])=>arr.map((e,i)=>{
    const activeText=e.active?` — 🎙️ <#${e.active.channelId}> — **${fmt(e.active.seconds)}**`:"";
    return `**${i+1}.** <@${e.userId}> — **${metric==='voice'||metric==='fivem'?fmt(e.value):e.value.toLocaleString()}**${activeText}`;
  });

  const sections:string[]=[];
  const addSection=(title:string,arr:any[])=>{
    if(!arr.length)return;
    sections.push(`### ${title}\n${lines(arr).join("\n")}`);
  };
  addSection("🟥 NRZ Members",nrz);
  addSection("🟩 Verified Members",verified);

  const activeLines=active.map(x=>{
    const channel=guild.channels.cache.get(x.channelId);
    return `• <@${x.userId}> — 🎙️ ${channel ? channel.name : `<#${x.channelId}>`} — **${fmt(x.seconds)}**`;
  });
  if(activeLines.length) sections.push(`### 🔊 Currently Connected to Voice\n${activeLines.join("\n")}`);

  let description=sections.join("\n\n");
  if(!description) description="No NRZ or Verified members found.";
  if(description.length>5800) description=description.slice(0,5750)+"\n\n⚠️ Discord's embed limit was reached; some entries cannot fit on one message.";

  return {
    embeds:[new EmbedBuilder().setTitle(`${labels[metric]} Leaderboard`).setDescription(description)]
  };
}

export const commands=[
new SlashCommandBuilder().setName("help").setDescription("Show bot features"),new SlashCommandBuilder().setName("stats").setDescription("Show server statistics"),
new SlashCommandBuilder().setName("warn").setDescription("Warn a member").addUserOption(o=>o.setName("user").setDescription("Member").setRequired(true)).addStringOption(o=>o.setName("reason").setDescription("Reason").setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
new SlashCommandBuilder().setName("warnings").setDescription("Show warnings").addUserOption(o=>o.setName("user").setDescription("Member").setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
new SlashCommandBuilder().setName("clear").setDescription("Delete messages").addIntegerOption(o=>o.setName("amount").setDescription("1-100").setMinValue(1).setMaxValue(100).setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
new SlashCommandBuilder().setName("leaderboard").setDescription("Show live activity leaderboard").addStringOption(o=>o.setName("metric").setDescription("Metric").setRequired(true).addChoices({name:"Voice",value:"voice"},{name:"Messages",value:"messages"},{name:"XP",value:"xp"},{name:"FiveM",value:"fivem"})),
new SlashCommandBuilder().setName("leaderboard-reset").setDescription("Reset an activity leaderboard").addStringOption(o=>o.setName("metric").setDescription("Metric to reset").setRequired(true).addChoices({name:"Voice",value:"voice"},{name:"Messages",value:"messages"},{name:"XP",value:"xp"},{name:"FiveM",value:"fivem"},{name:"All",value:"all"})).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
new SlashCommandBuilder().setName("voicestats").setDescription("Show voice activity").addUserOption(o=>o.setName("user").setDescription("Optional member")),new SlashCommandBuilder().setName("apply").setDescription("Open the server application form"),new SlashCommandBuilder().setName("ticket").setDescription("Create a private support ticket"),new SlashCommandBuilder().setName("setup-honeypot").setDescription("Make this channel the honeypot channel").setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),new SlashCommandBuilder().setName("serverstatus").setDescription("Show FiveM server status"),new SlashCommandBuilder().setName("players").setDescription("List FiveM players")].map(c=>c.toJSON());

export async function handleCommand(i:ChatInputCommandInteraction){switch(i.commandName){
case"help":return i.reply({ephemeral:true,content:"🎮 Gaming Bot • Moderation • Logs • Voice • Live Leaderboards • Tickets • Forms • Honeypot"});
case"stats":{const g=i.guild!;return i.reply(`👥 Members: **${g.memberCount}**\n🟢 Online: **${g.presences.cache.filter(p=>p.status!=="offline").size}**`);}
case"warn":{const u=i.options.getUser("user",true),r=i.options.getString("reason",true);await collection("warnings").insertOne({guild_id:i.guildId,user_id:u.id,moderator_id:i.user.id,reason:r,created_at:new Date()});return i.reply(`⚠️ <@${u.id}> warned. Reason: ${r}`);}
case"warnings":{const u=i.options.getUser("user",true),r=await collection<{reason:string;created_at:Date}>("warnings").find({guild_id:i.guildId,user_id:u.id}).sort({created_at:-1}).limit(20).toArray();return i.reply(r.length?r.map((x,n)=>`${n+1}. ${x.reason} — ${new Date(x.created_at).toLocaleString()}`).join("\n"):"No warnings.");}
case"clear":{const amount=i.options.getInteger("amount",true);if(!i.channel?.isTextBased()||!("bulkDelete"in i.channel))return i.reply({content:"This command requires a text channel.",ephemeral:true});const d=await(i.channel as any).bulkDelete(amount,true);return i.reply({content:`🧹 Deleted ${d.size} messages.`,ephemeral:true});}
case"leaderboard":{await i.deferReply();const metric=i.options.getString("metric",true)as LeaderboardMetric;const payload=await buildLeaderboard(i.guild!,metric);const msg=await i.editReply(payload);if(metric==="voice"){const timer=setInterval(async()=>{try{await msg.edit(await buildLeaderboard(i.guild!,metric));}catch(error){if((error as any)?.code===10008||(error as any)?.status===404){clearInterval(timer);return;}console.error("[Voice] leaderboard refresh failed",error);}},VOICE_LEADERBOARD_REFRESH_MS);}return;}
case"leaderboard-reset":{const metric=i.options.getString("metric",true);if(metric==="all"){for(const m of ["voice","messages","xp","fivem"]as LeaderboardMetric[])await resetLeaderboard(i.guildId!,m);await resetActiveVoiceLeaderboard(i.guildId!);}else if(metric==="voice"){await resetActiveVoiceLeaderboard(i.guildId!);}else await resetLeaderboard(i.guildId!,metric as LeaderboardMetric);return i.reply({content:`♻️ **${metric}** leaderboard has been reset.`,ephemeral:true});}
case"voicestats":{await i.deferReply({ephemeral:true});const u=i.options.getUser("user")??i.user,s=await getVoiceStats(i.guildId!,u.id);return i.editReply(`🎙️ <@${u.id}> voice time: **${fmt(s)}**`);}
case"apply":return showApplication(i);case"ticket":return createTicket(i);case"setup-honeypot":await setHoneypotChannel(i.guildId!,i.channelId);return i.reply({content:`🍯 <#${i.channelId}> is now the honeypot channel.`,ephemeral:true});
case"serverstatus":{await i.deferReply();const f=await getFiveMInfo(config.fivemUrl);return i.editReply(f?`🟢 FiveM online — **${f.count}** players`:"🔴 FiveM server unavailable");}
case"players":{await i.deferReply();const f=await getFiveMInfo(config.fivemUrl);return i.editReply(f?`🎮 Players online: **${f.count}**\n${f.players.slice(0,30).map((p:any)=>`• ${p.name??"Unknown"}`).join("\n")||"None"}`:"🔴 FiveM server unavailable");}
default:return;}}

