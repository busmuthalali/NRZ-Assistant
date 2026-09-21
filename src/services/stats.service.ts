import {
  ChannelType,
  Client,
  Guild,
  CategoryChannel,
  PermissionFlagsBits,
  VoiceChannel
} from "discord.js";

const CATEGORY_NAME = "📊 SERVER STATS";
const MEMBER_PREFIX = "👥 Members:";
const ONLINE_PREFIX = "🟢 Online:";
const accessFixed = new Set<string>();

type StatsChannels = {
  category: CategoryChannel;
  member: VoiceChannel;
  online: VoiceChannel;
};

async function ensureBotChannelAccess(
  channel: CategoryChannel | VoiceChannel,
  botId: string
): Promise<void> {
  // Explicitly grant the bot access to the stats category/counters.
  // This prevents "Missing Access" when the server/category has restrictive
  // permission overwrites.
  const key = `${channel.id}:${botId}`;
  if (accessFixed.has(key)) return;

  await channel.permissionOverwrites.edit(
    botId,
    {
      ViewChannel: true,
      ManageChannels: true
    },
    { reason: "Allow stats bot to manage server statistics channels" }
  );

  accessFixed.add(key);
}

async function getOrCreateCategory(guild: Guild, botId: string): Promise<CategoryChannel> {
  let category = guild.channels.cache.find(
    c => c.type === ChannelType.GuildCategory && c.name === CATEGORY_NAME
  ) as CategoryChannel | undefined;

  if (!category) {
    category = await guild.channels.create({
      name: CATEGORY_NAME,
      type: ChannelType.GuildCategory,
      permissionOverwrites: [
        {
          id: botId,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels]
        }
      ],
      reason: "Create server statistics category"
    });

    console.log(`[Stats] Created category ${category.id} in ${guild.name}`);
  } else {
    await ensureBotChannelAccess(category, botId);
  }

  return category;
}

async function createCounter(
  guild: Guild,
  category: CategoryChannel,
  botId: string,
  name: string
): Promise<VoiceChannel> {
  const channel = await guild.channels.create({
    name,
    type: ChannelType.GuildVoice,
    parent: category.id,
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.Connect]
      },
      {
        id: botId,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels]
      }
    ],
    reason: "Create server statistics counter"
  });

  console.log(`[Stats] Created counter ${channel.name} (${channel.id})`);
  return channel;
}

export async function setupStats(guild: Guild): Promise<StatsChannels> {
  const me = guild.members.me ?? await guild.members.fetchMe();

  if (!me.permissions.has(PermissionFlagsBits.ManageChannels)) {
    throw new Error(
      `[Stats] ${guild.name}: bot needs the Manage Channels permission.`
    );
  }

  const category = await getOrCreateCategory(guild, me.id);

  // Make sure existing counters also explicitly grant access to the bot.
  await ensureBotChannelAccess(category, me.id);

  const children = [...guild.channels.cache.values()].filter(
    c => c.parentId === category.id
  );

  let member = children.find(
    c =>
      c.type === ChannelType.GuildVoice &&
      c.name.startsWith(MEMBER_PREFIX)
  ) as VoiceChannel | undefined;

  let online = children.find(
    c =>
      c.type === ChannelType.GuildVoice &&
      c.name.startsWith(ONLINE_PREFIX)
  ) as VoiceChannel | undefined;

  if (!member) {
    member = await createCounter(
      guild,
      category,
      me.id,
      `${MEMBER_PREFIX} 0`
    );
  } else {
    await ensureBotChannelAccess(member, me.id);
  }

  if (!online) {
    online = await createCounter(
      guild,
      category,
      me.id,
      `${ONLINE_PREFIX} 0`
    );
  } else {
    await ensureBotChannelAccess(online, me.id);
  }

  // Remove counters from previous stats versions only.
  const obsoletePrefixes = [
    "🤖 Bots",
    "🎮 FiveM",
    "🤖 Bot Status",
    "🎙️ Voice",
    "📈 Voice",
    "💬 Messages",
    "⭐ XP",
    "🟣",
    "🔵"
  ];

  for (const child of children) {
    if (child.id === member.id || child.id === online.id) continue;

    if (obsoletePrefixes.some(prefix => child.name.startsWith(prefix))) {
      await child
        .delete("Remove obsolete server stats counter")
        .catch(err =>
          console.error(
            `[Stats] Could not remove old stats channel ${child.id}:`,
            err
          )
        );
    }
  }

  return { category, member, online };
}

function countOnline(guild: Guild): number {
  // Do not fetch all members here. Presence data is already delivered by
  // Discord through the GuildPresences intent.
  return guild.presences.cache.filter(
    presence =>
      presence.status === "online" ||
      presence.status === "idle" ||
      presence.status === "dnd"
  ).size;
}

export async function updateStats(_client: Client, guild: Guild): Promise<void> {
  // guild.memberCount is Discord's authoritative total member count.
  // It does not require a gateway member fetch.
  const members = guild.memberCount;
  const online = countOnline(guild);

  const stats = await setupStats(guild);

  const memberName = `${MEMBER_PREFIX} ${members}`;
  const onlineName = `${ONLINE_PREFIX} ${online}`;

  if (stats.member.name !== memberName) {
    await stats.member.setName(memberName, "Update total member count");
  }

  if (stats.online.name !== onlineName) {
    await stats.online.setName(onlineName, "Update online member count");
  }

  console.log(
    `[Stats] ${guild.name}: ${members} members | ${online} online`
  );
}

export function startStats(client: Client): void {
  const run = async () => {
    for (const guild of client.guilds.cache.values()) {
      try {
        await updateStats(client, guild);
      } catch (err) {
        console.error(`[Stats] Update failed for ${guild.name}:`, err);
      }
    }
  };

  void run();

  setInterval(() => {
    void run();
  }, 60_000);
}
