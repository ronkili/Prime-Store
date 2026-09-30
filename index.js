require("dotenv").config();

const fs = require("fs");
const path = require("path");

const {
  Client,
  GatewayIntentBits,
  Events,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  AttachmentBuilder,
  MessageFlags
} = require("discord.js");

const config = require("./config");

// =====================
// CLIENT
// =====================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// =====================
// DATA / RAILWAY VOLUME
// =====================

const DATA_DIR =
  process.env.DATA_DIR ||
  "/app/data";

fs.mkdirSync(
  DATA_DIR,
  { recursive: true }
);

const XP_FILE =
  path.join(
    DATA_DIR,
    "xp.json"
  );

const STOCK_FILE =
  path.join(
    DATA_DIR,
    "stock.json"
  );

function loadJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) {
      return fallback;
    }

    return JSON.parse(
      fs.readFileSync(
        file,
        "utf8"
      )
    );
  } catch (error) {
    console.error(
      "❌ Failed to load JSON:",
      error
    );

    return fallback;
  }
}

function saveJson(file, data) {
  const temp =
    `${file}.tmp`;

  fs.writeFileSync(
    temp,
    JSON.stringify(
      data,
      null,
      2
    ),
    "utf8"
  );

  fs.renameSync(
    temp,
    file
  );
}

const xpData =
  loadJson(
    XP_FILE,
    {
      guilds: {}
    }
  );

const stockData =
  loadJson(
    STOCK_FILE,
    {
      discord: 0,
      roblox: 0,
      fortnite: 0
    }
  );

function normalizeStockData() {
  for (
    const key
    of [
      "discord",
      "roblox",
      "fortnite"
    ]
  ) {
    stockData[key] =
      Math.max(
        0,
        Math.floor(
          Number(
            stockData[key] || 0
          )
        )
      );
  }
}

normalizeStockData();

function saveStockData() {
  saveJson(
    STOCK_FILE,
    stockData
  );
}

const messageXpCooldowns =
  new Map();

const casinoCooldowns =
  new Map();

const blackjackGames =
  new Map();

function saveXpData() {
  saveJson(
    XP_FILE,
    xpData
  );
}

function getGuildXp(guildId) {
  if (!xpData.guilds[guildId]) {
    xpData.guilds[guildId] = {
      users: {}
    };
  }

  return xpData.guilds[guildId];
}

function getProfile(
  guildId,
  userId
) {
  const guildData =
    getGuildXp(guildId);

  if (!guildData.users[userId]) {
    guildData.users[userId] = {
      xp: 0,
      messages: 0,
      lastDailyAt: 0
    };
  }

  const profile =
    guildData.users[userId];

  profile.xp =
    Math.max(
      0,
      Number(profile.xp || 0)
    );

  profile.messages =
    Math.max(
      0,
      Number(
        profile.messages || 0
      )
    );

  profile.lastDailyAt =
    Math.max(
      0,
      Number(
        profile.lastDailyAt || 0
      )
    );

  return profile;
}

function changeXp(
  guildId,
  userId,
  amount
) {
  const profile =
    getProfile(
      guildId,
      userId
    );

  profile.xp =
    Math.max(
      0,
      profile.xp +
      Number(amount || 0)
    );

  saveXpData();

  return profile.xp;
}

function randomInt(min, max) {
  return Math.floor(
    Math.random() *
    (max - min + 1)
  ) + min;
}

function formatXp(value) {
  return Number(
    value || 0
  ).toLocaleString("en-US");
}

// =====================
// ACCESS
// =====================

function hasBlockedLink(message) {
  const text =
    String(
      message.content || ""
    );

  const linkRegex =
    /(?:https?:\/\/|www\.|discord\.gg\/|discord(?:app)?\.com\/invite\/|tenor\.com\/|giphy\.com\/|media\.tenor\.com\/|cdn\.discordapp\.com\/|media\.discordapp\.net\/)/i;

  if (linkRegex.test(text)) {
    return true;
  }

  for (
    const embed
    of message.embeds || []
  ) {
    const values = [
      embed.url,
      embed.image?.url,
      embed.thumbnail?.url,
      embed.video?.url
    ];

    if (
      values.some(
        value =>
          value &&
          /https?:\/\//i.test(
            String(value)
          )
      )
    ) {
      return true;
    }
  }

  return false;
}

function isStaff(
  member,
  guild
) {
  if (!member || !guild) {
    return false;
  }

  return Boolean(
    member.id === guild.ownerId ||
    member.permissions.has(
      PermissionFlagsBits.Administrator
    ) ||
    member.permissions.has(
      PermissionFlagsBits.ManageGuild
    ) ||
    (
      config.ticketStaffRoleId &&
      member.roles.cache.has(
        config.ticketStaffRoleId
      )
    )
  );
}

// =====================
// VERIFY
// =====================

function canEditChannelPermissions(
  channel
) {
  return Boolean(
    channel &&
    !channel.isThread?.() &&
    channel.permissionOverwrites &&
    typeof channel.permissionOverwrites.edit ===
      "function"
  );
}

async function setupVerifyPermissions(
  interaction
) {
  const guild =
    interaction.guild;

  const verifyChannel =
    interaction.channel;

  if (
    !guild ||
    !verifyChannel ||
    !verifyChannel.isTextBased()
  ) {
    throw new Error(
      "VERIFY_CHANNEL_INVALID"
    );
  }

  if (!config.memberRoleId) {
    throw new Error(
      "MEMBER_ROLE_NOT_CONFIGURED"
    );
  }

  const memberRole =
    await guild.roles
      .fetch(
        config.memberRoleId
      )
      .catch(() => null);

  if (!memberRole) {
    throw new Error(
      "MEMBER_ROLE_NOT_FOUND"
    );
  }

  if (memberRole.managed) {
    throw new Error(
      "MEMBER_ROLE_MANAGED"
    );
  }

  const botMember =
    await guild.members
      .fetchMe()
      .catch(() => null);

  if (!botMember) {
    throw new Error(
      "BOT_MEMBER_NOT_FOUND"
    );
  }

  if (
    !botMember.permissions.has(
      PermissionFlagsBits.ManageChannels
    )
  ) {
    throw new Error(
      "BOT_MISSING_MANAGE_CHANNELS"
    );
  }

  if (
    !botMember.permissions.has(
      PermissionFlagsBits.ManageRoles
    )
  ) {
    throw new Error(
      "BOT_MISSING_MANAGE_ROLES"
    );
  }

  if (
    memberRole.position >=
    botMember.roles.highest.position
  ) {
    throw new Error(
      "BOT_ROLE_TOO_LOW"
    );
  }

  const everyoneRole =
    guild.roles.everyone;

  const channels =
    await guild.channels.fetch();

  const publicChannels =
    [...channels.values()]
      .filter(channel => {
        if (
          !canEditChannelPermissions(
            channel
          )
        ) {
          return false;
        }

        if (
          channel.id ===
          verifyChannel.id
        ) {
          return false;
        }

        const permissions =
          channel.permissionsFor(
            everyoneRole
          );

        return Boolean(
          permissions?.has(
            PermissionFlagsBits.ViewChannel
          )
        );
      });

  await verifyChannel
    .permissionOverwrites
    .edit(
      everyoneRole,
      {
        ViewChannel: true,
        SendMessages: false,
        AddReactions: false,
        CreatePublicThreads: false,
        CreatePrivateThreads: false,
        SendMessagesInThreads: false
      },
      {
        reason:
          "Prime Store automatic Verify setup"
      }
    );

  let lockedChannels = 0;
  let failedChannels = 0;

  const ordered =
    publicChannels.sort(
      (a, b) => {
        const aCategory =
          a.type ===
          ChannelType.GuildCategory
            ? 0
            : 1;

        const bCategory =
          b.type ===
          ChannelType.GuildCategory
            ? 0
            : 1;

        return (
          aCategory -
          bCategory
        );
      }
    );

  for (
    const channel
    of ordered
  ) {
    try {
      await channel
        .permissionOverwrites
        .edit(
          everyoneRole,
          {
            ViewChannel: false
          },
          {
            reason:
              "Prime Store automatic Member-only setup"
          }
        );

      await channel
        .permissionOverwrites
        .edit(
          memberRole,
          {
            ViewChannel: true
          },
          {
            reason:
              "Prime Store Member-only channel"
          }
        );

      lockedChannels += 1;
    } catch (error) {
      failedChannels += 1;

      console.error(
        `❌ Verify setup failed for channel ${channel.id}:`,
        error
      );
    }
  }

  return {
    memberRole,
    verifyChannel,
    lockedChannels,
    failedChannels
  };
}

function verifyPanel() {
  return {
    embeds: [
      new EmbedBuilder()
        .setColor("Green")
        .setTitle(
          "✅ Prime Store • Verify"
        )
        .setDescription(
          [
            "ברוכים הבאים ל־**Prime Store**!",
            "",
            "לחצו על **Verify** כדי לקבל את רול ה־Member ולקבל גישה לשרת.",
            "",
            "לחיצה אחת וזהו — אין מספרים."
          ].join("\n")
        )
        .setFooter({
          text:
            "Prime Store • Verification System"
        })
        .setTimestamp()
    ],

    components: [
      new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(
              "verify_member"
            )
            .setLabel("Verify")
            .setEmoji("✅")
            .setStyle(
              ButtonStyle.Success
            )
        )
    ]
  };
}

function verifySetupResultEmbed(
  result
) {
  return new EmbedBuilder()
    .setColor(
      result.failedChannels
        ? "Orange"
        : "Green"
    )
    .setTitle(
      "✅ Verify Setup הושלם"
    )
    .setDescription(
      [
        `🔐 **${result.lockedChannels}** חדרים ציבוריים הפכו ל־Members בלבד.`,
        `⚠️ **${result.failedChannels}** חדרים לא עודכנו.`,
        "",
        `✅ חדר ה־Verify נשאר פתוח: ${result.verifyChannel}`,
        `👥 רול Member: ${result.memberRole}`,
        "",
        "חדרים שכבר היו פרטיים לפני ה־Setup נשארו פרטיים."
      ].join("\n")
    )
    .setTimestamp();
}

// =====================
// STOCK
// =====================

function stockPlatformInfo(
  platform
) {
  const map = {
    discord: {
      emoji: "💬",
      name: "Discord"
    },

    roblox: {
      emoji: "🎮",
      name: "Roblox"
    },

    fortnite: {
      emoji: "🕹️",
      name: "Fortnite"
    }
  };

  return map[platform] || null;
}

function stockEmbed() {
  return new EmbedBuilder()
    .setColor("Gold")
    .setTitle(
      "📦 Prime Store • מלאי"
    )
    .setDescription(
      [
        `💬 **Discord:** ${stockData.discord}`,
        `🎮 **Roblox:** ${stockData.roblox}`,
        `🕹️ **Fortnite:** ${stockData.fortnite}`,
        "",
        "המספרים מתעדכנים על ידי צוות החנות."
      ].join("\n")
    )
    .setFooter({
      text:
        "Prime Store • Stock"
    })
    .setTimestamp();
}

// =====================
// TICKET HELPERS
// =====================

const ticketTypes = {
  buy_user: {
    emoji: "🛒",
    name: "קניית משתמש",
    description:
      "פנייה בנושא קנייה דרך החנות"
  },

  question: {
    emoji: "❓",
    name: "שאלה",
    description:
      "שאלה, בירור או מידע כללי"
  },

  scam_report: {
    emoji: "⚠️",
    name: "דיווח על סקאם",
    description:
      "דיווח על ניסיון סקאם או בעיה בעסקה"
  },

  help: {
    emoji: "❗",
    name: "עזרה",
    description:
      "קבלת עזרה ותמיכה מהצוות"
  }
};

function safeChannelName(value) {
  return String(
    value || "user"
  )
    .toLowerCase()
    .replace(
      /[^a-z0-9א-ת_-]/g,
      "-"
    )
    .replace(
      /-+/g,
      "-"
    )
    .slice(0, 24);
}

function parseTicketTopic(channel) {
  const data = {};

  for (
    const part
    of String(
      channel?.topic || ""
    ).split(";")
  ) {
    const [
      key,
      ...rest
    ] =
      part.split("=");

    if (
      key &&
      rest.length
    ) {
      data[key.trim()] =
        rest.join("=")
          .trim();
    }
  }

  return data;
}

function buildTicketTopic({
  owner,
  type,
  created,
  claimed = ""
}) {
  return [
    "primeStoreTicket=1",
    `owner=${owner}`,
    `type=${type}`,
    `created=${created}`,
    `claimed=${claimed}`
  ].join(";");
}

function ticketControls(
  claimedBy = ""
) {
  return [
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            claimedBy
              ? "ticket_release"
              : "ticket_claim"
          )
          .setLabel(
            claimedBy
              ? "Release"
              : "Claim"
          )
          .setEmoji(
            claimedBy
              ? "🔓"
              : "🙋"
          )
          .setStyle(
            claimedBy
              ? ButtonStyle.Secondary
              : ButtonStyle.Success
          ),

        new ButtonBuilder()
          .setCustomId(
            "ticket_add_user"
          )
          .setLabel("Add User")
          .setEmoji("➕")
          .setStyle(
            ButtonStyle.Primary
          ),

        new ButtonBuilder()
          .setCustomId(
            "ticket_remove_user"
          )
          .setLabel("Remove User")
          .setEmoji("➖")
          .setStyle(
            ButtonStyle.Secondary
          ),

        new ButtonBuilder()
          .setCustomId(
            "ticket_close"
          )
          .setLabel("Close")
          .setEmoji("🔒")
          .setStyle(
            ButtonStyle.Danger
          )
      )
  ];
}

function ticketPanel() {
  return {
    embeds: [
      new EmbedBuilder()
        .setColor("Blue")
        .setTitle(
          "🎫 Prime Store • מרכז טיקטים"
        )
        .setDescription(
          [
            "ברוכים הבאים למרכז התמיכה של **Prime Store**.",
            "",
            "בחרו את סוג הפנייה המתאים באמצעות הכפתורים למטה.",
            "",
            "🛒 **קניית משתמש**",
            "לפנייה בנושא קנייה דרך החנות.",
            "",
            "❓ **שאלה**",
            "לשאלות כלליות ובירורים.",
            "",
            "⚠️ **דיווח על סקאם**",
            "לדיווח על ניסיון סקאם או בעיה בעסקה.",
            "",
            "❗ **עזרה**",
            "לקבלת עזרה ותמיכה מהצוות."
          ].join("\n")
        )
        .setFooter({
          text:
            "Prime Store • Ticket System"
        })
        .setTimestamp()
    ],

    components: [
      new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(
              "ticket_open:buy_user"
            )
            .setLabel(
              "קניית משתמש"
            )
            .setEmoji("🛒")
            .setStyle(
              ButtonStyle.Primary
            ),

          new ButtonBuilder()
            .setCustomId(
              "ticket_open:question"
            )
            .setLabel("שאלה")
            .setEmoji("❓")
            .setStyle(
              ButtonStyle.Primary
            ),

          new ButtonBuilder()
            .setCustomId(
              "ticket_open:scam_report"
            )
            .setLabel(
              "דיווח על סקאם"
            )
            .setEmoji("⚠️")
            .setStyle(
              ButtonStyle.Primary
            ),

          new ButtonBuilder()
            .setCustomId(
              "ticket_open:help"
            )
            .setLabel("עזרה")
            .setEmoji("❗")
            .setStyle(
              ButtonStyle.Primary
            )
        )
    ]
  };
}

function buyProductInfo(product) {
  const products = {
    discord: {
      emoji: "💬",
      name: "משתמש Discord"
    },

    roblox: {
      emoji: "🎮",
      name: "משתמש Roblox"
    },

    fortnite: {
      emoji: "🕹️",
      name: "משתמש Fortnite"
    }
  };

  return products[product] || null;
}

async function openTicket(
  interaction,
  type,
  options = {}
) {
  const info =
    ticketTypes[type];

  if (!info) {
    return interaction.reply({
      content:
        "❌ סוג הטיקט לא קיים.",
      flags:
        MessageFlags.Ephemeral
    });
  }

  const existing =
    interaction.guild.channels.cache.find(
      channel => {
        const data =
          parseTicketTopic(channel);

        return (
          data.primeStoreTicket ===
            "1" &&
          data.owner ===
            interaction.user.id
        );
      }
    );

  if (existing) {
    return interaction.reply({
      content:
        `❌ כבר יש לך טיקט פתוח: ${existing}`,
      flags:
        MessageFlags.Ephemeral
    });
  }

  const category =
    interaction.guild.channels.cache.get(
      config.ticketCategoryId
    );

  if (
    !category ||
    category.type !==
      ChannelType.GuildCategory
  ) {
    return interaction.reply({
      content:
        "❌ `ticketCategoryId` לא מוגדר נכון ב־config.js.",
      flags:
        MessageFlags.Ephemeral
    });
  }

  const permissionOverwrites = [
    {
      id:
        interaction.guild.id,
      deny: [
        PermissionFlagsBits.ViewChannel
      ]
    },

    {
      id:
        interaction.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks
      ]
    }
  ];

  if (
    config.ticketStaffRoleId
  ) {
    permissionOverwrites.push({
      id:
        config.ticketStaffRoleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages
      ]
    });
  }

  const created =
    Date.now();

  const productInfo =
    type === "buy_user"
      ? buyProductInfo(
          options.product
        )
      : null;

  const channel =
    await interaction.guild.channels.create({
      name:
        `${info.emoji}-${safeChannelName(
          interaction.user.username
        )}`,
      type:
        ChannelType.GuildText,
      parent:
        category.id,
      topic:
        buildTicketTopic({
          owner:
            interaction.user.id,
          type:
            productInfo
              ? `${type}_${options.product}`
              : type,
          created
        }),
      permissionOverwrites
    });

  await channel.send({
    content:
      config.ticketStaffRoleId
        ? `<@&${config.ticketStaffRoleId}>`
        : undefined,

    embeds: [
      new EmbedBuilder()
        .setColor("Blue")
        .setTitle(
          `${info.emoji} ${info.name}`
        )
        .setDescription(
          [
            `שלום ${interaction.user}, הטיקט שלך נפתח בהצלחה.`,
            "",
            `📌 **סוג הפנייה:** ${info.name}`,
            productInfo
              ? `🛒 **סוג המשתמש:** ${productInfo.emoji} ${productInfo.name}`
              : `📝 ${info.description}`,
            productInfo
              ? `📦 **כמות במלאי כרגע:** ${stockData[options.product] ?? 0}`
              : "",
            "",
            productInfo
              ? `📝 **מה חשוב שיהיה במשתמש:**\n${options.requirements}`
              : "כתוב כאן את כל הפרטים הרלוונטיים והצוות יגיע אליך בהקדם.",
            "",
            "הצוות יגיע אליך בהקדם."
          ].join("\n")
        )
        .setThumbnail(
          interaction.user.displayAvatarURL({
            size: 256
          })
        )
        .setFooter({
          text:
            "Prime Store • Ticket System"
        })
        .setTimestamp()
    ],

    components:
      ticketControls(),

    allowedMentions: {
      roles:
        config.ticketStaffRoleId
          ? [
              config.ticketStaffRoleId
            ]
          : []
    }
  });

  return interaction.reply({
    content:
      `✅ הטיקט נפתח: ${channel}`,
    flags:
      MessageFlags.Ephemeral
  });
}

async function createTranscript(
  channel
) {
  const messages = [];
  let before = null;

  while (true) {
    const batch =
      await channel.messages.fetch({
        limit: 100,
        before
      });

    if (!batch.size) {
      break;
    }

    messages.push(
      ...batch.values()
    );

    before =
      batch.last().id;

    if (batch.size < 100) {
      break;
    }
  }

  messages.sort(
    (a, b) =>
      a.createdTimestamp -
      b.createdTimestamp
  );

  const lines = [
    "Prime Store Ticket Transcript",
    `Channel: #${channel.name}`,
    `Channel ID: ${channel.id}`,
    ""
  ];

  for (const message of messages) {
    lines.push(
      `[${message.createdAt.toLocaleString()}] ${message.author.tag}: ${message.content || "[No text]"}`
    );

    for (
      const attachment
      of message.attachments.values()
    ) {
      lines.push(
        `Attachment: ${attachment.url}`
      );
    }
  }

  return Buffer.from(
    lines.join("\n"),
    "utf8"
  );
}

// =====================
// CASINO
// Virtual XP only
// =====================

function casinoCheck(
  guildId,
  userId,
  bet
) {
  const amount =
    Number(bet);

  if (
    !Number.isInteger(amount) ||
    amount <= 0
  ) {
    return {
      ok: false,
      message:
        "❌ סכום ה־XP חייב להיות מספר שלם וחיובי."
    };
  }

  const maxBet =
    Number(
      config.maxCasinoBet ||
      1000
    );

  if (amount > maxBet) {
    return {
      ok: false,
      message:
        `❌ המקסימום למשחק הוא **${formatXp(maxBet)} XP**.`
    };
  }

  const profile =
    getProfile(
      guildId,
      userId
    );

  if (
    profile.xp < amount
  ) {
    return {
      ok: false,
      message:
        `❌ אין לך מספיק XP. יש לך **${formatXp(profile.xp)} XP**.`
    };
  }

  const key =
    `${guildId}:${userId}`;

  const cooldownMs =
    Number(
      config.casinoCooldownMs ||
      5000
    );

  const last =
    casinoCooldowns.get(key) ||
    0;

  const left =
    cooldownMs -
    (
      Date.now() -
      last
    );

  if (left > 0) {
    return {
      ok: false,
      message:
        `⏳ חכה עוד **${Math.ceil(left / 1000)} שניות** לפני משחק נוסף.`
    };
  }

  casinoCooldowns.set(
    key,
    Date.now()
  );

  return {
    ok: true,
    bet: amount
  };
}

function casinoInfoEmbed() {
  return new EmbedBuilder()
    .setColor("Gold")
    .setTitle(
      "🎰 Prime Store Casino"
    )
    .setDescription(
      [
        "כל המשחקים משתמשים ב־**XP וירטואלי בלבד**.",
        "אין כסף אמיתי ואין Cashout.",
        "",
        "**פקודות:**",
        "`!xp` / `!balance`",
        "`!daily`",
        "`!coinflip <xp> <heads/tails>`",
        "`!dice <xp> <1-6>`",
        "`!slots <xp>`",
        "`!roulette <xp> <red/black/green>`",
        "`!blackjack <xp>` / `!bj <xp>`",
        "`!leaderboard` / `!lb`",
        "`!casino`",
        "",
        `💰 Max Bet: **${formatXp(config.maxCasinoBet || 1000)} XP**`
      ].join("\n")
    )
    .setFooter({
      text:
        "Prime Store • Virtual XP only"
    })
    .setTimestamp();
}

function drawCard() {
  const cards = [
    2, 3, 4, 5, 6, 7,
    8, 9, 10,
    10, 10, 10,
    11
  ];

  return cards[
    randomInt(
      0,
      cards.length - 1
    )
  ];
}

function handValue(cards) {
  let total =
    cards.reduce(
      (sum, value) =>
        sum + value,
      0
    );

  let aces =
    cards.filter(
      value =>
        value === 11
    ).length;

  while (
    total > 21 &&
    aces > 0
  ) {
    total -= 10;
    aces -= 1;
  }

  return total;
}

function blackjackButtons(userId) {
  return [
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            `bj_hit:${userId}`
          )
          .setLabel("Hit")
          .setEmoji("🃏")
          .setStyle(
            ButtonStyle.Primary
          ),

        new ButtonBuilder()
          .setCustomId(
            `bj_stand:${userId}`
          )
          .setLabel("Stand")
          .setEmoji("✋")
          .setStyle(
            ButtonStyle.Success
          )
      )
  ];
}

function blackjackEmbed(
  game,
  finishedText = null
) {
  return new EmbedBuilder()
    .setColor(
      finishedText
        ? "Gold"
        : "Blue"
    )
    .setTitle(
      "🃏 Prime Store Blackjack"
    )
    .setDescription(
      [
        `💰 הימור: **${formatXp(game.bet)} XP**`,
        "",
        `👤 היד שלך: **${game.player.join(" • ")}**`,
        `סה״כ: **${handValue(game.player)}**`,
        "",
        finishedText
          ? `🤖 הדילר: **${game.dealer.join(" • ")}**\nסה״כ: **${handValue(game.dealer)}**`
          : `🤖 הדילר: **${game.dealer[0]} • ?**`,
        "",
        finishedText ||
          "בחר **Hit** או **Stand**."
      ].join("\n")
    )
    .setFooter({
      text:
        "Virtual XP only"
    })
    .setTimestamp();
}

async function finishBlackjack(
  interaction,
  game
) {
  while (
    handValue(
      game.dealer
    ) < 17
  ) {
    game.dealer.push(
      drawCard()
    );
  }

  const player =
    handValue(
      game.player
    );

  const dealer =
    handValue(
      game.dealer
    );

  let text;

  if (player > 21) {
    changeXp(
      game.guildId,
      game.userId,
      -game.bet
    );

    text =
      `💥 עברת 21. הפסדת **${formatXp(game.bet)} XP**.`;
  } else if (
    dealer > 21 ||
    player > dealer
  ) {
    changeXp(
      game.guildId,
      game.userId,
      game.bet
    );

    text =
      `🏆 ניצחת וקיבלת **${formatXp(game.bet)} XP**.`;
  } else if (
    player < dealer
  ) {
    changeXp(
      game.guildId,
      game.userId,
      -game.bet
    );

    text =
      `❌ הדילר ניצח. הפסדת **${formatXp(game.bet)} XP**.`;
  } else {
    text =
      "🤝 תיקו — ה־XP לא השתנה.";
  }

  blackjackGames.delete(
    `${game.guildId}:${game.userId}`
  );

  return interaction.update({
    embeds: [
      blackjackEmbed(
        game,
        text
      )
    ],
    components: []
  });
}

// =====================
// READY
// =====================

client.once(
  Events.ClientReady,
  readyClient => {
    console.log(
      `✅ Prime Store Bot online as ${readyClient.user.tag}`
    );
  }
);

// =====================
// MESSAGE COMMANDS
// =====================

client.on(
  Events.MessageCreate,
  async message => {
    if (
      !message.guild ||
      message.author.bot
    ) {
      return;
    }

    if (
      config.antiLinkEnabled !== false &&
      hasBlockedLink(message) &&
      !isStaff(
        message.member,
        message.guild
      )
    ) {
      await message.delete()
        .catch(() => {});

      const warning =
        await message.channel.send({
          content:
            `🚫 ${message.author}, אסור לשלוח קישורים או קישורי GIF.`
        })
        .catch(() => null);

      if (warning) {
        setTimeout(
          () => {
            warning.delete()
              .catch(() => {});
          },
          5000
        );
      }

      return;
    }

    const guildId =
      message.guild.id;

    const userId =
      message.author.id;

    const cooldownKey =
      `${guildId}:${userId}`;

    const lastXp =
      messageXpCooldowns.get(
        cooldownKey
      ) || 0;

    const xpCooldownMs =
      Number(
        config.xpMessageCooldownMs ||
        60000
      );

    if (
      Date.now() -
      lastXp >=
      xpCooldownMs
    ) {
      const min =
        Number(
          config.xpPerMessageMin ||
          5
        );

      const max =
        Number(
          config.xpPerMessageMax ||
          15
        );

      const profile =
        getProfile(
          guildId,
          userId
        );

      profile.xp +=
        randomInt(
          Math.min(min, max),
          Math.max(min, max)
        );

      profile.messages += 1;

      messageXpCooldowns.set(
        cooldownKey,
        Date.now()
      );

      saveXpData();
    }

    const prefix =
      String(
        config.xpPrefix ||
        "!"
      );

    if (
      !message.content.startsWith(
        prefix
      )
    ) {
      return;
    }

    const parts =
      message.content
        .slice(
          prefix.length
        )
        .trim()
        .split(/\s+/);

    const command =
      String(
        parts.shift() ||
        ""
      ).toLowerCase();

    if (!command) {
      return;
    }

    const profile =
      getProfile(
        guildId,
        userId
      );

    if (
      command === "xp" ||
      command === "balance" ||
      command === "bal"
    ) {
      return message.reply(
        `💰 יש לך **${formatXp(profile.xp)} XP**.`
      );
    }

    if (
      command === "stock"
    ) {
      return message.reply({
        embeds: [
          stockEmbed()
        ]
      });
    }

    if (
      command === "casino"
    ) {
      return message.reply({
        embeds: [
          casinoInfoEmbed()
        ]
      });
    }

    if (
      command === "daily"
    ) {
      const dayMs =
        24 *
        60 *
        60 *
        1000;

      const left =
        dayMs -
        (
          Date.now() -
          profile.lastDailyAt
        );

      if (left > 0) {
        const hours =
          Math.floor(
            left /
            3600000
          );

        const minutes =
          Math.ceil(
            (
              left %
              3600000
            ) /
            60000
          );

        return message.reply(
          `⏳ כבר לקחת Daily. חזור בעוד **${hours} שעות ו־${minutes} דקות**.`
        );
      }

      const reward =
        randomInt(
          Number(
            config.dailyXpMin ||
            250
          ),
          Number(
            config.dailyXpMax ||
            500
          )
        );

      profile.xp += reward;
      profile.lastDailyAt =
        Date.now();

      saveXpData();

      return message.reply(
        `🎁 קיבלת **${formatXp(reward)} XP**. עכשיו יש לך **${formatXp(profile.xp)} XP**.`
      );
    }

    if (
      command === "leaderboard" ||
      command === "lb"
    ) {
      const top =
        Object.entries(
          getGuildXp(guildId)
            .users
        )
          .sort(
            (a, b) =>
              Number(
                b[1].xp || 0
              ) -
              Number(
                a[1].xp || 0
              )
          )
          .slice(0, 10);

      if (!top.length) {
        return message.reply(
          "📊 עדיין אין נתוני XP."
        );
      }

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("Gold")
            .setTitle(
              "🏆 Prime Store XP Leaderboard"
            )
            .setDescription(
              top.map(
                (
                  [id, data],
                  index
                ) =>
                  `**${index + 1}.** <@${id}> — **${formatXp(data.xp)} XP**`
              ).join("\n")
            )
            .setTimestamp()
        ]
      });
    }

    if (
      command === "coinflip"
    ) {
      const check =
        casinoCheck(
          guildId,
          userId,
          parts[0]
        );

      if (!check.ok) {
        return message.reply(
          check.message
        );
      }

      const choice =
        String(
          parts[1] || ""
        ).toLowerCase();

      const normalized = {
        heads: "heads",
        head: "heads",
        tails: "tails",
        tail: "tails",
        "עץ": "heads",
        "פלי": "tails"
      }[choice];

      if (!normalized) {
        casinoCooldowns.delete(
          `${guildId}:${userId}`
        );

        return message.reply(
          `❌ שימוש: \`${prefix}coinflip <xp> <heads/tails>\``
        );
      }

      const result =
        Math.random() < 0.5
          ? "heads"
          : "tails";

      const won =
        result ===
        normalized;

      changeXp(
        guildId,
        userId,
        won
          ? check.bet
          : -check.bet
      );

      return message.reply(
        `${won ? "🏆" : "❌"} יצא **${result}** — ${
          won
            ? `ניצחת ${formatXp(check.bet)} XP`
            : `הפסדת ${formatXp(check.bet)} XP`
        }.`
      );
    }

    if (
      command === "dice"
    ) {
      const check =
        casinoCheck(
          guildId,
          userId,
          parts[0]
        );

      if (!check.ok) {
        return message.reply(
          check.message
        );
      }

      const guess =
        Number(parts[1]);

      if (
        !Number.isInteger(
          guess
        ) ||
        guess < 1 ||
        guess > 6
      ) {
        casinoCooldowns.delete(
          `${guildId}:${userId}`
        );

        return message.reply(
          `❌ שימוש: \`${prefix}dice <xp> <1-6>\``
        );
      }

      const result =
        randomInt(1, 6);

      const won =
        result === guess;

      const change =
        won
          ? check.bet * 5
          : -check.bet;

      changeXp(
        guildId,
        userId,
        change
      );

      return message.reply(
        `🎲 יצא **${result}** — ${
          won
            ? `🏆 קיבלת ${formatXp(check.bet * 5)} XP`
            : `❌ הפסדת ${formatXp(check.bet)} XP`
        }.`
      );
    }

    if (
      command === "slots"
    ) {
      const check =
        casinoCheck(
          guildId,
          userId,
          parts[0]
        );

      if (!check.ok) {
        return message.reply(
          check.message
        );
      }

      const symbols = [
        "🍒",
        "🍋",
        "🔔",
        "⭐",
        "💎"
      ];

      const spin = [
        symbols[
          randomInt(
            0,
            symbols.length - 1
          )
        ],
        symbols[
          randomInt(
            0,
            symbols.length - 1
          )
        ],
        symbols[
          randomInt(
            0,
            symbols.length - 1
          )
        ]
      ];

      const allSame =
        spin[0] === spin[1] &&
        spin[1] === spin[2];

      const pair =
        spin[0] === spin[1] ||
        spin[0] === spin[2] ||
        spin[1] === spin[2];

      let change;
      let resultText;

      if (allSame) {
        change =
          check.bet * 3;

        resultText =
          `🏆 JACKPOT! קיבלת **${formatXp(change)} XP**.`;
      } else if (pair) {
        change =
          check.bet;

        resultText =
          `✨ זוג! קיבלת **${formatXp(change)} XP**.`;
      } else {
        change =
          -check.bet;

        resultText =
          `❌ הפסדת **${formatXp(check.bet)} XP**.`;
      }

      changeXp(
        guildId,
        userId,
        change
      );

      return message.reply(
        `🎰 ${spin.join(" | ")}\n${resultText}`
      );
    }

    if (
      command === "roulette"
    ) {
      const check =
        casinoCheck(
          guildId,
          userId,
          parts[0]
        );

      if (!check.ok) {
        return message.reply(
          check.message
        );
      }

      const choice =
        String(
          parts[1] || ""
        ).toLowerCase();

      if (
        ![
          "red",
          "black",
          "green"
        ].includes(choice)
      ) {
        casinoCooldowns.delete(
          `${guildId}:${userId}`
        );

        return message.reply(
          `❌ שימוש: \`${prefix}roulette <xp> <red/black/green>\``
        );
      }

      const roll =
        randomInt(0, 36);

      const result =
        roll === 0
          ? "green"
          : (
              roll % 2 === 0
                ? "black"
                : "red"
            );

      const won =
        result === choice;

      const reward =
        choice === "green"
          ? check.bet * 14
          : check.bet;

      changeXp(
        guildId,
        userId,
        won
          ? reward
          : -check.bet
      );

      return message.reply(
        `🎡 יצא **${roll} • ${result}** — ${
          won
            ? `🏆 קיבלת ${formatXp(reward)} XP`
            : `❌ הפסדת ${formatXp(check.bet)} XP`
        }.`
      );
    }

    if (
      command === "blackjack" ||
      command === "bj"
    ) {
      const check =
        casinoCheck(
          guildId,
          userId,
          parts[0]
        );

      if (!check.ok) {
        return message.reply(
          check.message
        );
      }

      const key =
        `${guildId}:${userId}`;

      if (
        blackjackGames.has(
          key
        )
      ) {
        casinoCooldowns.delete(
          key
        );

        return message.reply(
          "❌ כבר יש לך משחק Blackjack פעיל."
        );
      }

      const game = {
        guildId,
        userId,
        bet:
          check.bet,
        player: [
          drawCard(),
          drawCard()
        ],
        dealer: [
          drawCard(),
          drawCard()
        ]
      };

      blackjackGames.set(
        key,
        game
      );

      return message.reply({
        embeds: [
          blackjackEmbed(
            game
          )
        ],
        components:
          blackjackButtons(
            userId
          )
      });
    }
  }
);

// =====================
// INTERACTIONS
// =====================

client.on(
  Events.InteractionCreate,
  async interaction => {
    try {
      // ---------- SLASH ----------

      if (
        interaction.isChatInputCommand()
      ) {
        if (
          interaction.commandName ===
          "stock"
        ) {
          return interaction.reply({
            embeds: [
              stockEmbed()
            ]
          });
        }

        if (
          interaction.commandName ===
          "stock-set"
        ) {
          if (
            !isStaff(
              interaction.member,
              interaction.guild
            )
          ) {
            return interaction.reply({
              content:
                "❌ רק Staff/Admin יכולים לעדכן את המלאי.",
              flags:
                MessageFlags.Ephemeral
            });
          }

          const platform =
            interaction.options
              .getString(
                "platform",
                true
              );

          const amount =
            interaction.options
              .getInteger(
                "amount",
                true
              );

          const info =
            stockPlatformInfo(
              platform
            );

          if (!info) {
            return interaction.reply({
              content:
                "❌ פלטפורמה לא תקינה.",
              flags:
                MessageFlags.Ephemeral
            });
          }

          stockData[platform] =
            Math.max(
              0,
              amount
            );

          saveStockData();

          return interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor("Green")
                .setTitle(
                  "✅ המלאי עודכן"
                )
                .setDescription(
                  `${info.emoji} **${info.name}: ${stockData[platform]} משתמשים במלאי**`
                )
                .addFields(
                  {
                    name:
                      "📦 המלאי הנוכחי",
                    value:
                      [
                        `💬 Discord: **${stockData.discord}**`,
                        `🎮 Roblox: **${stockData.roblox}**`,
                        `🕹️ Fortnite: **${stockData.fortnite}**`
                      ].join("\n")
                  }
                )
                .setFooter({
                  text:
                    `Updated by ${interaction.user.tag}`
                })
                .setTimestamp()
            ],
            flags:
              MessageFlags.Ephemeral
          });
        }

        if (
          interaction.commandName ===
          "setup-verify"
        ) {
          if (
            !isStaff(
              interaction.member,
              interaction.guild
            )
          ) {
            return interaction.reply({
              content:
                "❌ אין לך גישה להריץ Setup Verify.",
              flags:
                MessageFlags.Ephemeral
            });
          }

          await interaction.deferReply({
            flags:
              MessageFlags.Ephemeral
          });

          try {
            const result =
              await setupVerifyPermissions(
                interaction
              );

            await interaction.channel.send(
              verifyPanel()
            );

            return interaction.editReply({
              embeds: [
                verifySetupResultEmbed(
                  result
                )
              ]
            });
          } catch (error) {
            console.error(
              "❌ setup-verify error:",
              error
            );

            const errors = {
              MEMBER_ROLE_NOT_CONFIGURED:
                "❌ חסר `memberRoleId` ב־config.js.",
              MEMBER_ROLE_NOT_FOUND:
                "❌ רול Member לא נמצא.",
              MEMBER_ROLE_MANAGED:
                "❌ רול Member הוא Managed Role.",
              BOT_MEMBER_NOT_FOUND:
                "❌ לא הצלחתי לטעון את הבוט.",
              BOT_MISSING_MANAGE_CHANNELS:
                "❌ לבוט חסר `Manage Channels`.",
              BOT_MISSING_MANAGE_ROLES:
                "❌ לבוט חסר `Manage Roles`.",
              BOT_ROLE_TOO_LOW:
                "❌ רול Prime Store Bot חייב להיות מעל Member.",
              VERIFY_CHANNEL_INVALID:
                "❌ תריץ את הפקודה בתוך חדר Verify."
            };

            return interaction.editReply({
              content:
                errors[error.message] ||
                "❌ הייתה שגיאה בזמן הגדרת Verify."
            });
          }
        }

        if (
          interaction.commandName ===
          "verify-panel"
        ) {
          if (
            !isStaff(
              interaction.member,
              interaction.guild
            )
          ) {
            return interaction.reply({
              content:
                "❌ אין לך גישה.",
              flags:
                MessageFlags.Ephemeral
            });
          }

          await interaction.channel.send(
            verifyPanel()
          );

          return interaction.reply({
            content:
              "✅ פאנל ה־Verify נשלח.",
            flags:
              MessageFlags.Ephemeral
          });
        }

        if (
          interaction.commandName ===
          "ticket-panel"
        ) {
          if (
            !isStaff(
              interaction.member,
              interaction.guild
            )
          ) {
            return interaction.reply({
              content:
                "❌ אין לך גישה לשלוח את הפאנל.",
              flags:
                MessageFlags.Ephemeral
            });
          }

          await interaction.channel.send(
            ticketPanel()
          );

          return interaction.reply({
            content:
              "✅ פאנל הטיקטים נשלח.",
            flags:
              MessageFlags.Ephemeral
          });
        }
      }

      // ---------- VERIFY ----------

      if (
        interaction.isButton() &&
        interaction.customId ===
          "verify_member"
      ) {
        if (!config.memberRoleId) {
          return interaction.reply({
            content:
              "❌ חסר `memberRoleId` ב־config.js.",
            flags:
              MessageFlags.Ephemeral
          });
        }

        const member =
          await interaction.guild.members
            .fetch(
              interaction.user.id
            )
            .catch(() => null);

        const role =
          await interaction.guild.roles
            .fetch(
              config.memberRoleId
            )
            .catch(() => null);

        const botMember =
          await interaction.guild.members
            .fetchMe()
            .catch(() => null);

        if (
          !member ||
          !role ||
          !botMember
        ) {
          return interaction.reply({
            content:
              "❌ לא הצלחתי לטעון את נתוני ה־Verify.",
            flags:
              MessageFlags.Ephemeral
          });
        }

        if (
          member.roles.cache.has(
            role.id
          )
        ) {
          return interaction.reply({
            content:
              "✅ אתה כבר מאומת.",
            flags:
              MessageFlags.Ephemeral
          });
        }

        if (
          role.managed ||
          !botMember.permissions.has(
            PermissionFlagsBits.ManageRoles
          ) ||
          role.position >=
            botMember.roles.highest.position
        ) {
          return interaction.reply({
            content:
              "❌ ודא שלבוט יש `Manage Roles` ושהרול שלו מעל Member.",
            flags:
              MessageFlags.Ephemeral
          });
        }

        await member.roles.add(
          role,
          "Prime Store Verify"
        );

        return interaction.reply({
          content:
            "✅ אומתת בהצלחה! קיבלת גישה לשרת.",
          flags:
            MessageFlags.Ephemeral
        });
      }

      // ---------- BLACKJACK ----------

      if (
        interaction.isButton() &&
        (
          interaction.customId.startsWith(
            "bj_hit:"
          ) ||
          interaction.customId.startsWith(
            "bj_stand:"
          )
        )
      ) {
        const ownerId =
          interaction.customId
            .split(":")[1];

        if (
          interaction.user.id !==
          ownerId
        ) {
          return interaction.reply({
            content:
              "❌ זה לא משחק ה־Blackjack שלך.",
            flags:
              MessageFlags.Ephemeral
          });
        }

        const key =
          `${interaction.guild.id}:${ownerId}`;

        const game =
          blackjackGames.get(
            key
          );

        if (!game) {
          return interaction.update({
            content:
              "❌ המשחק כבר הסתיים.",
            embeds: [],
            components: []
          });
        }

        if (
          interaction.customId.startsWith(
            "bj_hit:"
          )
        ) {
          game.player.push(
            drawCard()
          );

          if (
            handValue(
              game.player
            ) >= 21
          ) {
            return finishBlackjack(
              interaction,
              game
            );
          }

          return interaction.update({
            embeds: [
              blackjackEmbed(
                game
              )
            ],
            components:
              blackjackButtons(
                ownerId
              )
          });
        }

        return finishBlackjack(
          interaction,
          game
        );
      }

      // ---------- BUY USER: CHOOSE PLATFORM ----------

      if (
        interaction.isButton() &&
        interaction.customId ===
          "ticket_open:buy_user"
      ) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor("Green")
              .setTitle(
                "🛒 איזה משתמש תרצה לקנות?"
              )
              .setDescription(
                [
                  "בחר את סוג המשתמש:",
                  "",
                  `💬 Discord — **${stockData.discord} במלאי**`,
                  `🎮 Roblox — **${stockData.roblox} במלאי**`,
                  `🕹️ Fortnite — **${stockData.fortnite} במלאי**`
                ].join("\n")
              )
          ],

          components: [
            new ActionRowBuilder()
              .addComponents(
                new ButtonBuilder()
                  .setCustomId(
                    "buy_user_type:discord"
                  )
                  .setLabel("Discord")
                  .setEmoji("💬")
                  .setStyle(
                    ButtonStyle.Primary
                  ),

                new ButtonBuilder()
                  .setCustomId(
                    "buy_user_type:roblox"
                  )
                  .setLabel("Roblox")
                  .setEmoji("🎮")
                  .setStyle(
                    ButtonStyle.Primary
                  ),

                new ButtonBuilder()
                  .setCustomId(
                    "buy_user_type:fortnite"
                  )
                  .setLabel("Fortnite")
                  .setEmoji("🕹️")
                  .setStyle(
                    ButtonStyle.Primary
                  )
              )
          ],

          flags:
            MessageFlags.Ephemeral
        });
      }

      // ---------- BUY USER: FREE-TEXT REQUIREMENTS ----------

      if (
        interaction.isButton() &&
        interaction.customId.startsWith(
          "buy_user_type:"
        )
      ) {
        const product =
          interaction.customId
            .split(":")[1];

        const productInfo =
          buyProductInfo(
            product
          );

        if (!productInfo) {
          return interaction.reply({
            content:
              "❌ סוג המשתמש לא קיים.",
            flags:
              MessageFlags.Ephemeral
          });
        }

        const modal =
          new ModalBuilder()
            .setCustomId(
              `buy_user_modal:${product}`
            )
            .setTitle(
              `קניית ${productInfo.name}`.slice(
                0,
                45
              )
            );

        const requirements =
          new TextInputBuilder()
            .setCustomId(
              "requirements"
            )
            .setLabel(
              "מה חשוב לך שיהיה במשתמש?"
            )
            .setPlaceholder(
              "לדוגמה: ותק, פריטים, סקינים, רמה, משחקים, דברים מיוחדים..."
            )
            .setStyle(
              TextInputStyle.Paragraph
            )
            .setRequired(true)
            .setMinLength(3)
            .setMaxLength(1000);

        modal.addComponents(
          new ActionRowBuilder()
            .addComponents(
              requirements
            )
        );

        return interaction.showModal(
          modal
        );
      }

      // ---------- OPEN OTHER TICKETS ----------

      if (
        interaction.isButton() &&
        interaction.customId.startsWith(
          "ticket_open:"
        )
      ) {
        const type =
          interaction.customId
            .split(":")[1];

        return openTicket(
          interaction,
          type
        );
      }

      // ---------- CLAIM ----------

      if (
        interaction.isButton() &&
        interaction.customId ===
          "ticket_claim"
      ) {
        if (
          !isStaff(
            interaction.member,
            interaction.guild
          )
        ) {
          return interaction.reply({
            content:
              "❌ רק צוות יכול לקחת טיקט.",
            flags:
              MessageFlags.Ephemeral
          });
        }

        const data =
          parseTicketTopic(
            interaction.channel
          );

        if (data.claimed) {
          return interaction.reply({
            content:
              `❌ הטיקט כבר נלקח על ידי <@${data.claimed}>.`,
            flags:
              MessageFlags.Ephemeral
          });
        }

        data.claimed =
          interaction.user.id;

        await interaction.channel
          .setTopic(
            buildTicketTopic({
              owner:
                data.owner,
              type:
                data.type,
              created:
                data.created,
              claimed:
                data.claimed
            })
          );

        return interaction.update({
          embeds:
            interaction.message.embeds,
          components:
            ticketControls(
              interaction.user.id
            )
        });
      }

      // ---------- RELEASE ----------

      if (
        interaction.isButton() &&
        interaction.customId ===
          "ticket_release"
      ) {
        if (
          !isStaff(
            interaction.member,
            interaction.guild
          )
        ) {
          return interaction.reply({
            content:
              "❌ רק צוות יכול לשחרר טיקט.",
            flags:
              MessageFlags.Ephemeral
          });
        }

        const data =
          parseTicketTopic(
            interaction.channel
          );

        if (
          data.claimed &&
          data.claimed !==
            interaction.user.id &&
          !interaction.member.permissions.has(
            PermissionFlagsBits.Administrator
          )
        ) {
          return interaction.reply({
            content:
              "❌ רק מי שלקח את הטיקט או Administrator יכול לשחרר אותו.",
            flags:
              MessageFlags.Ephemeral
          });
        }

        data.claimed = "";

        await interaction.channel
          .setTopic(
            buildTicketTopic({
              owner:
                data.owner,
              type:
                data.type,
              created:
                data.created,
              claimed: ""
            })
          );

        return interaction.update({
          embeds:
            interaction.message.embeds,
          components:
            ticketControls()
        });
      }

      // ---------- ADD USER ----------

      if (
        interaction.isButton() &&
        interaction.customId ===
          "ticket_add_user"
      ) {
        if (
          !isStaff(
            interaction.member,
            interaction.guild
          )
        ) {
          return interaction.reply({
            content:
              "❌ רק צוות יכול להוסיף משתמש.",
            flags:
              MessageFlags.Ephemeral
          });
        }

        const modal =
          new ModalBuilder()
            .setCustomId(
              "ticket_add_user_modal"
            )
            .setTitle(
              "Add User"
            );

        const input =
          new TextInputBuilder()
            .setCustomId(
              "user_id"
            )
            .setLabel(
              "User ID"
            )
            .setStyle(
              TextInputStyle.Short
            )
            .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder()
            .addComponents(
              input
            )
        );

        return interaction.showModal(
          modal
        );
      }

      // ---------- REMOVE USER ----------

      if (
        interaction.isButton() &&
        interaction.customId ===
          "ticket_remove_user"
      ) {
        if (
          !isStaff(
            interaction.member,
            interaction.guild
          )
        ) {
          return interaction.reply({
            content:
              "❌ רק צוות יכול להסיר משתמש.",
            flags:
              MessageFlags.Ephemeral
          });
        }

        const modal =
          new ModalBuilder()
            .setCustomId(
              "ticket_remove_user_modal"
            )
            .setTitle(
              "Remove User"
            );

        const input =
          new TextInputBuilder()
            .setCustomId(
              "user_id"
            )
            .setLabel(
              "User ID"
            )
            .setStyle(
              TextInputStyle.Short
            )
            .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder()
            .addComponents(
              input
            )
        );

        return interaction.showModal(
          modal
        );
      }

      // ---------- CLOSE ----------

      if (
        interaction.isButton() &&
        interaction.customId ===
          "ticket_close"
      ) {
        if (
          !isStaff(
            interaction.member,
            interaction.guild
          )
        ) {
          return interaction.reply({
            content:
              "❌ רק צוות יכול לסגור טיקט.",
            flags:
              MessageFlags.Ephemeral
          });
        }

        const modal =
          new ModalBuilder()
            .setCustomId(
              "ticket_close_modal"
            )
            .setTitle(
              "Close Ticket"
            );

        const input =
          new TextInputBuilder()
            .setCustomId(
              "reason"
            )
            .setLabel(
              "סיבת סגירה"
            )
            .setStyle(
              TextInputStyle.Paragraph
            )
            .setRequired(true)
            .setMaxLength(500);

        modal.addComponents(
          new ActionRowBuilder()
            .addComponents(
              input
            )
        );

        return interaction.showModal(
          modal
        );
      }

      // ---------- MODALS ----------

      if (
        interaction.isModalSubmit() &&
        interaction.customId.startsWith(
          "buy_user_modal:"
        )
      ) {
        const product =
          interaction.customId
            .split(":")[1];

        const productInfo =
          buyProductInfo(
            product
          );

        if (!productInfo) {
          return interaction.reply({
            content:
              "❌ סוג המשתמש לא קיים.",
            flags:
              MessageFlags.Ephemeral
          });
        }

        const requirements =
          interaction.fields
            .getTextInputValue(
              "requirements"
            )
            .trim();

        return openTicket(
          interaction,
          "buy_user",
          {
            product,
            requirements
          }
        );
      }

      if (
        interaction.isModalSubmit()
      ) {
        if (
          interaction.customId ===
          "ticket_add_user_modal"
        ) {
          const userId =
            interaction.fields
              .getTextInputValue(
                "user_id"
              )
              .trim();

          if (
            !/^\d{17,20}$/.test(
              userId
            )
          ) {
            return interaction.reply({
              content:
                "❌ User ID לא תקין.",
              flags:
                MessageFlags.Ephemeral
            });
          }

          const member =
            await interaction.guild.members
              .fetch(userId)
              .catch(() => null);

          if (!member) {
            return interaction.reply({
              content:
                "❌ המשתמש לא נמצא בשרת.",
              flags:
                MessageFlags.Ephemeral
            });
          }

          await interaction.channel
            .permissionOverwrites.edit(
              member.id,
              {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true,
                AttachFiles: true,
                EmbedLinks: true
              }
            );

          return interaction.reply({
            content:
              `✅ ${member} נוסף לטיקט.`,
            flags:
              MessageFlags.Ephemeral
          });
        }

        if (
          interaction.customId ===
          "ticket_remove_user_modal"
        ) {
          const userId =
            interaction.fields
              .getTextInputValue(
                "user_id"
              )
              .trim();

          const data =
            parseTicketTopic(
              interaction.channel
            );

          if (
            userId === data.owner
          ) {
            return interaction.reply({
              content:
                "❌ אי אפשר להסיר את פותח הטיקט.",
              flags:
                MessageFlags.Ephemeral
            });
          }

          await interaction.channel
            .permissionOverwrites
            .delete(userId)
            .catch(() => {});

          return interaction.reply({
            content:
              `✅ <@${userId}> הוסר מהטיקט.`,
            flags:
              MessageFlags.Ephemeral
          });
        }

        if (
          interaction.customId ===
          "ticket_close_modal"
        ) {
          const reason =
            interaction.fields
              .getTextInputValue(
                "reason"
              );

          const channel =
            interaction.channel;

          const data =
            parseTicketTopic(
              channel
            );

          await interaction.reply({
            content:
              "🔒 סוגר את הטיקט ושומר Transcript...",
            flags:
              MessageFlags.Ephemeral
          });

          const transcript =
            await createTranscript(
              channel
            ).catch(
              () => null
            );

          const logs =
            config.ticketLogsChannelId
              ? interaction.guild.channels.cache.get(
                  config.ticketLogsChannelId
                )
              : null;

          if (
            logs &&
            logs.isTextBased()
          ) {
            const files = [];

            if (transcript) {
              files.push(
                new AttachmentBuilder(
                  transcript,
                  {
                    name:
                      `${channel.name}-transcript.txt`
                  }
                )
              );
            }

            await logs.send({
              embeds: [
                new EmbedBuilder()
                  .setColor("Red")
                  .setTitle(
                    "🔒 Prime Store Ticket Closed"
                  )
                  .addFields(
                    {
                      name:
                        "פותח הטיקט",
                      value:
                        data.owner
                          ? `<@${data.owner}>`
                          : "לא ידוע",
                      inline: true
                    },
                    {
                      name:
                        "נסגר על ידי",
                      value:
                        `${interaction.user}`,
                      inline: true
                    },
                    {
                      name:
                        "סיבה",
                      value:
                        reason
                    }
                  )
                  .setTimestamp()
              ],
              files
            }).catch(
              () => {}
            );
          }

          setTimeout(
            () => {
              channel.delete(
                `Closed by ${interaction.user.tag}`
              ).catch(
                () => {}
              );
            },
            2000
          );
        }
      }
    } catch (error) {
      console.error(
        "❌ Interaction error:",
        error
      );

      if (
        interaction.isRepliable()
      ) {
        const payload = {
          content:
            "❌ קרתה שגיאה. בדוק את הלוגים.",
          flags:
            MessageFlags.Ephemeral
        };

        if (
          interaction.replied ||
          interaction.deferred
        ) {
          await interaction
            .followUp(
              payload
            )
            .catch(
              () => {}
            );
        } else {
          await interaction
            .reply(
              payload
            )
            .catch(
              () => {}
            );
        }
      }
    }
  }
);

// =====================
// ERRORS + LOGIN RETRY
// =====================

client.on(
  "error",
  error => {
    console.error(
      "❌ Discord client error:",
      error
    );
  }
);

process.on(
  "unhandledRejection",
  error => {
    console.error(
      "❌ Unhandled rejection:",
      error
    );
  }
);

async function loginWithRetry() {
  let attempt = 0;

  while (true) {
    attempt += 1;

    try {
      console.log(
        `🔌 Discord login attempt ${attempt}...`
      );

      await client.login(
        process.env.TOKEN
      );

      return;
    } catch (error) {
      console.error(
        "❌ Discord login error:",
        error
      );

      const delay =
        Math.min(
          60000,
          attempt * 10000
        );

      console.log(
        `🔁 Retrying in ${delay / 1000}s...`
      );

      await new Promise(
        resolve =>
          setTimeout(
            resolve,
            delay
          )
      );
    }
  }
}

loginWithRetry();
