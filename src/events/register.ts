import { Client, Events } from "discord.js";
import { logEvent } from "../services/logger.service";
import { alert } from "../services/alert.service";
import { handleHoneypot } from "../services/honeypot.service";
import { handleForm } from "../services/forms.service";
import { handleTicketButton } from "../services/ticket.service";
import { query } from "../db/database";
import { config } from "../config";
import { handleLeaderboardButton } from "../commands/core";

export function registerEvents(client:Client) {
  client.on(Events.GuildMemberAdd, async m => {
    await logEvent(client,m.guild.id,"MEMBER_JOIN",{targetId:m.id,description:`${m.user.tag} joined.`});
    await alert(client,"🟢 Member Joined",`${m.user.tag} joined the server.`);
  });
  client.on(Events.GuildMemberRemove, async m => {
    await logEvent(client,m.guild.id,"MEMBER_LEAVE",{
      targetId:m.id,
      description:`${m.user.tag} left the server.`
    });
  });
  client.on(Events.GuildBanAdd, async b => { await logEvent(client,b.guild.id,"BAN",{targetId:b.user.id,description:`${b.user.tag} was banned.`}); });
  client.on(Events.GuildMemberUpdate, async (oldM,newM) => {
    if (oldM.nickname!==newM.nickname) await logEvent(client,newM.guild.id,"NICKNAME_CHANGE",{targetId:newM.id,description:`${oldM.nickname ?? oldM.user.username} → ${newM.nickname ?? newM.user.username}`});
    if (oldM.roles.cache.size!==newM.roles.cache.size) await logEvent(client,newM.guild.id,"ROLE_CHANGE",{targetId:newM.id,description:`Roles changed for ${newM.user.tag}.`});
  });
  client.on(Events.MessageCreate, async m => {
    await handleHoneypot(client,m).catch(console.error);
    if (!m.guild || m.author.bot) return;
    const last = await query(`SELECT last_message_at FROM xp_accounts WHERE guild_id=$1 AND user_id=$2`,[m.guild.id,m.author.id]).catch(()=>null);
    const now=Date.now(), prev=last?.rows?.[0]?.last_message_at ? new Date(last.rows[0].last_message_at).getTime() : 0;
    if (now-prev < config.xpCooldownSeconds*1000) return;
    const xp=10;
    await query(`INSERT INTO xp_accounts(guild_id,user_id,xp,last_message_at) VALUES($1,$2,$3,NOW()) ON CONFLICT(guild_id,user_id) DO UPDATE SET xp=xp_accounts.xp+$3,last_message_at=NOW()`,[m.guild.id,m.author.id,xp]).catch(()=>{});
    await query(`INSERT INTO activity_stats(guild_id,user_id,period_type,period_start,messages,xp) VALUES($1,$2,'all','1970-01-01',1,$3) ON CONFLICT(guild_id,user_id,period_type,period_start) DO UPDATE SET messages=activity_stats.messages+1,xp=activity_stats.xp+$3,updated_at=NOW()`,[m.guild.id,m.author.id,xp]).catch(()=>{});
  });
  client.on(Events.MessageDelete, async m => { if (m.guild) await logEvent(client,m.guild.id,"MESSAGE_DELETE",{targetId:m.author?.id,channelId:m.channel.id,description:`Message deleted in <#${m.channel.id}>.`}); });
  client.on(Events.ChannelCreate, async c => { if ("guild" in c) await logEvent(client,c.guild.id,"CHANNEL_CREATE",{channelId:c.id,description:`Channel created: ${c.name}`}); });
  client.on(Events.ChannelDelete, async c => { if ("guild" in c) await logEvent(client,c.guild.id,"CHANNEL_DELETE",{channelId:c.id,description:`Channel deleted: ${c.name}`}); });
  client.on(Events.GuildRoleCreate, async r => { await logEvent(client,r.guild.id,"ROLE_CREATE",{targetId:r.id,description:`Role created: ${r.name}`}); });
  client.on(Events.GuildRoleDelete, async r => { await logEvent(client,r.guild.id,"ROLE_DELETE",{targetId:r.id,description:`Role deleted: ${r.name}`}); });
  client.on(Events.VoiceStateUpdate, async (o,n) => { if (n.guild) await logEvent(client,n.guild.id,"VOICE_UPDATE",{targetId:n.id,channelId:n.channelId ?? o.channelId ?? undefined,description:`Voice state changed for <@${n.id}>.`}); });
  client.on(Events.InteractionCreate, async i => {
    if (i.isModalSubmit()) await handleForm(i,client).catch(console.error);
    if (i.isButton() && i.customId.startsWith("lb_")) {
      await handleLeaderboardButton(i).catch(async err => {
        console.error(err);
        if (!i.replied && !i.deferred) await i.reply({content:"Could not refresh the leaderboard.",ephemeral:true}).catch(()=>{});
      });
      return;
    }
    if (i.isButton()) await handleTicketButton(i).catch(console.error);
    if (i.isButton() && ["form_accept","form_deny"].includes(i.customId)) {
      const status=i.customId==="form_accept"?"accepted":"denied";
      await query(`UPDATE forms SET status=$1,reviewer_id=$2,updated_at=NOW() WHERE id=(SELECT id FROM forms WHERE guild_id=$3 AND status='pending' ORDER BY created_at DESC LIMIT 1)`,[status,i.user.id,i.guildId]).catch(async()=>{});
      if (!i.replied) await i.reply({content:`Form marked **${status}** by <@${i.user.id}>.`});
    }
  });
}
