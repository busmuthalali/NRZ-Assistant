import { Client, GatewayIntentBits, Partials, Events, ChatInputCommandInteraction } from "discord.js";
import { config } from "./config";
import { initDb } from "./db/database";
import { registerEvents } from "./events/register";
import { registerVoice, flushActiveVoice } from "./services/voice.service";
import { startStats } from "./services/stats.service";
import { handleCommand } from "./commands/core";
import { startDashboard } from "./web/dashboard";

async function main() {
  if (!config.databaseUrl) throw new Error("MONGODB_URI is not configured. Create a .env file from .env.example.");
  await initDb();
  const client=new Client({
    intents:[
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildPresences,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildVoiceStates
    ],
    partials:[Partials.Message,Partials.Channel]
  });

  client.once(Events.ClientReady, async c => {
    console.log(`Logged in as ${c.user.tag}`);
    startStats(client);
  });


  client.on(Events.InteractionCreate, async i => {
    if (!i.isChatInputCommand()) return;
    await handleCommand(i as ChatInputCommandInteraction).catch(async e=>{
      console.error(e);
      if (i.isRepliable() && !i.replied && !i.deferred) await i.reply({content:"An error occurred.",ephemeral:true}).catch(()=>{});
    });
  });

  registerEvents(client);
  registerVoice(client);
  startDashboard();
  await client.login(config.token);
  const shutdown = async () => {
    await flushActiveVoice().catch(console.error);
    await client.destroy();
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
main().catch(console.error);
