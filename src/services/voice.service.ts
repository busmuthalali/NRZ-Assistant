import { Client, Events, VoiceState } from "discord.js";
import { config } from "../config";
import { query } from "../db/database";

type Active = { joined:number; channelId:string; selfMute:boolean; selfDeaf:boolean; serverMute:boolean; serverDeaf:boolean; streaming:boolean; camera:boolean };
const active = new Map<string, Active>();
const key=(g:string,u:string)=>`${g}:${u}`;
const isIgnored=(id:string|null)=>!id || config.ignoreVoiceChannelIds.has(id);
function snapshot(state:VoiceState):Active { return {joined:Date.now(),channelId:state.channelId!,selfMute:state.selfMute ?? false,selfDeaf:state.selfDeaf ?? false,serverMute:state.serverMute ?? false,serverDeaf:state.serverDeaf ?? false,streaming:state.streaming ?? false,camera:state.selfVideo ?? false}; }

async function addVoice(guildId:string,userId:string,seconds:number) {
  await query(`INSERT INTO activity_stats(guild_id,user_id,period_type,period_start,voice_seconds) VALUES($1,$2,'all','1970-01-01',$3) ON CONFLICT(guild_id,user_id,period_type,period_start) DO UPDATE SET voice_seconds=activity_stats.voice_seconds+$3,updated_at=NOW()`,[guildId,userId,seconds]);
}
async function persistSession(guildId:string,userId:string,s:Active) {
  const seconds=Math.max(0,Math.floor((Date.now()-s.joined)/1000));
  const counted=seconds;
  if(seconds<=0)return;
  await query(`INSERT INTO voice_sessions(guild_id,user_id,channel_id,joined_at,left_at,duration_seconds,self_muted,self_deafened,server_muted,server_deafened,streaming,camera,counted_seconds) VALUES($1,$2,$3,TO_TIMESTAMP($4/1000.0),NOW(),$5,$6,$7,$8,$9,$10,$11,$12)`,[guildId,userId,s.channelId,s.joined,seconds,s.selfMute,s.selfDeaf,s.serverMute,s.serverDeaf,s.streaming,s.camera,counted]);
  if(counted) await addVoice(guildId,userId,counted);
}

export async function handleVoice(oldState:VoiceState,newState:VoiceState){
  const g=newState.guild.id,u=newState.id,k=key(g,u); if(newState.member?.user.bot)return;
  const oldC=oldState.channelId,newC=newState.channelId;
  if(oldC && oldC!==newC){const s=active.get(k);if(s){await persistSession(g,u,s).catch(e=>console.error("[Voice] save failed",e));active.delete(k);}}
  if(newC && !isIgnored(newC)){
    const s=active.get(k); if(!s) active.set(k,snapshot(newState)); else {s.channelId=newC;s.selfMute=newState.selfMute ?? false;s.selfDeaf=newState.selfDeaf ?? false;s.serverMute=newState.serverMute ?? false;s.serverDeaf=newState.serverDeaf ?? false;s.streaming=newState.streaming ?? false;s.camera=newState.selfVideo ?? false;}
    return;
  }
  active.delete(k);
}

export async function seedActiveVoice(client:Client){
  active.clear();
  for(const guild of client.guilds.cache.values()) for(const state of guild.voiceStates.cache.values()) if(state.channelId&&!isIgnored(state.channelId)&&!state.member?.user.bot) active.set(key(guild.id,state.id),snapshot(state));
  console.log(`[Voice] Tracking ${active.size} active voice sessions.`);
}
export async function flushActiveVoice(){for(const [k,s] of active.entries()){const [g,u]=k.split(":");await persistSession(g,u,s).catch(e=>console.error("[Voice] shutdown save failed",e));}active.clear();}
export function getActiveVoiceSeconds(guildId:string){const now=Date.now(),r=new Map<string,number>();for(const [k,s] of active){const [g,u]=k.split(":");if(g!==guildId)continue;r.set(u,(r.get(u)||0)+Math.max(0,Math.floor((now-s.joined)/1000)));}return r;}
export function getActiveVoiceMembers(guildId:string){const now=Date.now();const out:{userId:string;channelId:string;joined:number;seconds:number;channelName?:string}[]=[];for(const [k,s] of active){const [g,u]=k.split(":");if(g===guildId)out.push({userId:u,channelId:s.channelId,joined:s.joined,seconds:Math.max(0,Math.floor((now-s.joined)/1000))});}return out;}
export async function getVoiceStats(guildId:string,userId:string){const r=await query<{s:string}>(`SELECT COALESCE(SUM(counted_seconds),0)::text s FROM voice_sessions WHERE guild_id=$1 AND user_id=$2`,[guildId,userId]);const s=active.get(key(guildId,userId));return Number(r.rows[0]?.s||0)+(s?Math.max(0,Math.floor((Date.now()-s.joined)/1000)):0);}
export async function resetActiveVoiceLeaderboard(guildId:string){const now=Date.now();for(const [k,s] of active){const [g]=k.split(":");if(g===guildId)s.joined=now;}await query(`DELETE FROM voice_sessions WHERE guild_id=$1`,[guildId]);await query(`UPDATE activity_stats SET voice_seconds=0,updated_at=NOW() WHERE guild_id=$1 AND period_type='all'`,[guildId]);}
export function registerVoice(client:Client){client.on(Events.VoiceStateUpdate,(o,n)=>handleVoice(o,n).catch(console.error));client.once(Events.ClientReady,()=>seedActiveVoice(client).catch(console.error));}
