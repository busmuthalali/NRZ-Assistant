import "dotenv/config";

const csv = (v?: string) => (v ?? "").split(",").map(x => x.trim()).filter(Boolean);

export const config = {
  token: process.env.DISCORD_TOKEN ?? "",
  clientId: process.env.DISCORD_CLIENT_ID ?? "",
  guildId: process.env.DISCORD_GUILD_ID ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  port: Number(process.env.PORT ?? 3000),
  fivemUrl: process.env.FIVEM_SERVER_URL ?? "",
  logChannelId: process.env.LOG_CHANNEL_ID ?? "",
  alertChannelId: process.env.ALERT_CHANNEL_ID ?? "",
  freeGamesChannelId: process.env.FREE_GAMES_CHANNEL_ID ?? "",
  honeypotChannelId: process.env.HONEYPOT_CHANNEL_ID ?? "",
  welcomeChannelId: process.env.WELCOME_CHANNEL_ID ?? "",
  statsCategoryId: process.env.STATS_CATEGORY_ID ?? "",
  ignoreVoiceChannelIds: new Set(csv(process.env.IGNORE_VOICE_CHANNEL_IDS)),
  ownerIds: new Set(csv(process.env.BOT_OWNER_IDS)),
  xpCooldownSeconds: Number(process.env.XP_COOLDOWN_SECONDS ?? 60),
  voiceMinSessionSeconds: Number(process.env.VOICE_MIN_SESSION_SECONDS ?? 60)
};

if (!config.token) console.warn("DISCORD_TOKEN is not configured.");
