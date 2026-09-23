import { Client, Events, Guild, VoiceState } from "discord.js";
import { config } from "../config";
import { collection } from "../db/database";

type Active = { joined:number; channelId:string; selfMute:boolean; selfDeaf:boolean; serverMute:boolean; serverDeaf:boolean; streaming:boolean; camera:boolean };
const active = new Map<string, Active>();
const activityListeners = new Set<(guild:Guild) => void | Promise<void>>();
const key=(g:string,u:string)=>`${g}:${u}`;
const isIgnored=(id:string|null)=>!id || config.ignoreVoiceChannelIds.has(id);
function snapshot(state:VoiceState):Active { return {joined:Date.now(),channelId:state.channelId!,selfMute:state.selfMute ?? false,selfDeaf:state.selfDeaf ?? false,serverMute:state.serverMute ?? false,serverDeaf:state.serverDeaf ?? false,streaming:state.streaming ?? false,camera:state.selfVideo ?? false}; }

export function onVoiceActivity(listener:(guild:Guild) => void | Promise<void>) {
  activityListeners.add(listener);
  return () => activityListeners.delete(listener);
}

function notifyVoiceActivity(guild:Guild) {
  for(const listener of activityListeners) void Promise.resolve(listener(guild)).catch(error=>console.error("[Voice] activity refresh failed",error));
}

async function addVoice(guildId:string,userId:string,seconds:number) {
  await collection("activity_stats").updateOne({guild_id:guildId,user_id:userId,period_type:"all",period_start:"1970-01-01"},{$inc:{voice_seconds:seconds},$set:{updated_at:new Date()},$setOnInsert:{messages:0,xp:0,fivem_seconds:0}},{upsert:true});
}
async function persistSession(guildId:string,userId:string,s:Active) {
  const seconds=Math.max(0,Math.floor((Date.now()-s.joined)/1000));
  const counted=seconds;
  if(seconds<=0)return;
  await collection("voice_sessions").insertOne({guild_id:guildId,user_id:userId,channel_id:s.channelId,joined_at:new Date(s.joined),left_at:new Date(),duration_seconds:seconds,self_muted:s.selfMute,self_deafened:s.selfDeaf,server_muted:s.serverMute,server_deafened:s.serverDeaf,streaming:s.streaming,camera:s.camera,counted_seconds:counted});
  if(counted) await addVoice(guildId,userId,counted);
}

export async function handleVoice(oldState:VoiceState,newState:VoiceState){
  const g=newState.guild.id,u=newState.id,k=key(g,u); if(newState.member?.user.bot)return;
  const oldC=oldState.channelId,newC=newState.channelId;
  if(oldC && oldC!==newC){const s=active.get(k);if(s){await persistSession(g,u,s).catch(e=>console.error("[Voice] save failed",e));active.delete(k);}}
  if(newC && !isIgnored(newC)){
    const s=active.get(k); if(!s) active.set(k,snapshot(newState)); else {s.channelId=newC;s.selfMute=newState.selfMute ?? false;s.selfDeaf=newState.selfDeaf ?? false;s.serverMute=newState.serverMute ?? false;s.serverDeaf=newState.serverDeaf ?? false;s.streaming=newState.streaming ?? false;s.camera=newState.selfVideo ?? false;}
    notifyVoiceActivity(newState.guild);
    return;
  }
  active.delete(k);
  notifyVoiceActivity(newState.guild);
}

export async function seedActiveVoice(client:Client){
  active.clear();
  for(const guild of client.guilds.cache.values()) for(const state of guild.voiceStates.cache.values()) if(state.channelId&&!isIgnored(state.channelId)&&!state.member?.user.bot) active.set(key(guild.id,state.id),snapshot(state));
  console.log(`[Voice] Tracking ${active.size} active voice sessions.`);
}
export function syncActiveVoice(guild:Guild){
  const currentKeys=new Set<string>();
  for(const state of guild.voiceStates.cache.values()){
    const k=key(guild.id,state.id);
    if(state.channelId&&!isIgnored(state.channelId)&&!state.member?.user.bot){
      currentKeys.add(k);
      const session=active.get(k);
      if(session) {
        session.channelId=state.channelId;
        session.selfMute=state.selfMute ?? false;
        session.selfDeaf=state.selfDeaf ?? false;
        session.serverMute=state.serverMute ?? false;
        session.serverDeaf=state.serverDeaf ?? false;
        session.streaming=state.streaming ?? false;
        session.camera=state.selfVideo ?? false;
      } else active.set(k,snapshot(state));
    }
  }
  for(const k of active.keys()){
    if(k.startsWith(`${guild.id}:`)&&!currentKeys.has(k)) active.delete(k);
  }
}
export async function flushActiveVoice(){for(const [k,s] of active.entries()){const [g,u]=k.split(":");await persistSession(g,u,s).catch(e=>console.error("[Voice] shutdown save failed",e));}active.clear();}
export function getActiveVoiceSeconds(guildId:string){const now=Date.now(),r=new Map<string,number>();for(const [k,s] of active){const [g,u]=k.split(":");if(g!==guildId)continue;r.set(u,(r.get(u)||0)+Math.max(0,Math.floor((now-s.joined)/1000)));}return r;}
export function getActiveVoiceMembers(guildId:string){const now=Date.now();const out:{userId:string;channelId:string;joined:number;seconds:number;channelName?:string}[]=[];for(const [k,s] of active){const [g,u]=k.split(":");if(g===guildId)out.push({userId:u,channelId:s.channelId,joined:s.joined,seconds:Math.max(0,Math.floor((now-s.joined)/1000))});}return out;}
export async function getVoiceStats(guildId:string,userId:string){const r=await collection<{counted_seconds?:number}>("voice_sessions").aggregate([{ $match:{guild_id:guildId,user_id:userId} },{ $group:{_id:null,total:{$sum:"$counted_seconds"}}}]).toArray();const s=active.get(key(guildId,userId));return Number(r[0]?.total||0)+(s?Math.max(0,Math.floor((Date.now()-s.joined)/1000)):0);}
export async function resetActiveVoiceLeaderboard(guildId:string){const now=Date.now();for(const [k,s] of active){const [g]=k.split(":");if(g===guildId)s.joined=now;}await collection("voice_sessions").deleteMany({guild_id:guildId});await collection("activity_stats").updateMany({guild_id:guildId,period_type:"all"},{$set:{voice_seconds:0,updated_at:new Date()}});}
export function registerVoice(client:Client){client.on(Events.VoiceStateUpdate,(o,n)=>handleVoice(o,n).catch(console.error));client.once(Events.ClientReady,()=>seedActiveVoice(client).catch(console.error));}
