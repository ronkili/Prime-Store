module.exports = {
  // =====================
  // PRIME STORE BOT
  // =====================

  clientId:
    "1554773701352882226",

  guildId:
    "1554772193953714196",

  // =====================
  // VERIFY
  // =====================

  memberRoleId:
    "1555515016717930496",

  // =====================
  // ANTI LINK
  // =====================

  antiLinkEnabled: true,

  // =====================
  // ANTI SPAM
  // =====================

  // יותר מ־5 תיוגים בהודעה אחת = מחיקה + Timeout לשעה
  antiMentionSpamEnabled: true,
  maxMentionsPerMessage: 5,

  // יותר מ־5 קישורים בהודעה אחת = מחיקה + Timeout לשעה
  antiLinkSpamEnabled: true,
  maxLinksPerMessage: 5,

  // =====================
  // XP + CASINO
  // Virtual XP only — no real money / no purchases / no cashout.
  // =====================

  xpPrefix: "!",

  xpPerMessageMin: 5,
  xpPerMessageMax: 15,

  xpMessageCooldownMs:
    60 * 1000,

  dailyXpMin: 250,
  dailyXpMax: 500,

  maxCasinoBet: 1000,

  casinoCooldownMs:
    5 * 1000,

  // =====================
  // TICKETS
  // =====================

  ticketCategoryId:
    "1555515149194887179",

  ticketStaffRoleId:
    "1555515002406965300",

  ticketLogsChannelId:
    "1555515153855029280"
};
