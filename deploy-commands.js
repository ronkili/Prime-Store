require("dotenv").config();

const {
  REST,
  Routes,
  SlashCommandBuilder
} = require("discord.js");

const config = require("./config");

const commands = [
  new SlashCommandBuilder()
    .setName("setup-verify")
    .setDescription(
      "מגדיר Verify וסוגר את החדרים הציבוריים ל־Members"
    ),

  new SlashCommandBuilder()
    .setName("verify-panel")
    .setDescription(
      "שולח את פאנל ה־Verify"
    ),

  new SlashCommandBuilder()
    .setName("ticket-panel")
    .setDescription(
      "שולח את פאנל הטיקטים של Prime Store"
    )
].map(
  command =>
    command.toJSON()
);

const rest =
  new REST({
    version: "10"
  }).setToken(
    process.env.TOKEN
  );

(async () => {
  try {
    console.log(
      "🔄 Deploying Prime Store commands..."
    );

    await rest.put(
      Routes.applicationGuildCommands(
        config.clientId,
        config.guildId
      ),
      {
        body: commands
      }
    );

    console.log(
      "✅ Prime Store commands deployed."
    );
  } catch (error) {
    console.error(
      "❌ Deploy error:",
      error
    );

    process.exitCode = 1;
  }
})();
