const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder } = require("discord.js");
const { DEFAULT_EMBED_COLOR, LASTFM_API_KEY } = require("./lastfm");
const SIGNUP_URL = "http://last.fm/join";

function buildSignUpButton() {
  return new ButtonBuilder()
    .setLabel("Sign up")
    .setStyle(ButtonStyle.Link)
    .setURL(SIGNUP_URL);
}
function buildConnectButton() {
  return new ButtonBuilder()
    .setCustomId("lfm_connect")
    .setLabel("Connect Last.fm account")
    .setStyle(ButtonStyle.Success);
}
function buildConnectLinkButton(url) {
  return new ButtonBuilder()
    .setLabel("Connect Last.fm account to Vinili & Caffè Bot")
    .setStyle(ButtonStyle.Link)
    .setURL(url);
}
function buildSettingsButton() {
  return new ButtonBuilder()
    .setCustomId("lfm_settings")
    .setLabel("Settings, customization and importing")
    .setStyle(ButtonStyle.Secondary);
}

function buildWelcomePayload() {
  const embed = new EmbedBuilder()
    .setColor(DEFAULT_EMBED_COLOR)
    .setDescription(
      "Welcome to Vinili & Caffè Bot. To use Vinili & Caffè Bot, a Last.fm account is required.\n\n" +
      "Use the buttons below to sign up or connect your existing Last.fm account."
    );
  const row = new ActionRowBuilder().addComponents(
    buildSignUpButton(),
    buildConnectButton()
  );
  return { embeds: [embed], components: [row] };
}
function buildAlreadyConnectedPayload() {
  const embed = new EmbedBuilder()
    .setColor(DEFAULT_EMBED_COLOR)
    .setDescription(
      "You have already connected a Last.fm account. To change the account you've " +
      "connected to Vinili & Caffè Bot, use the buttons below.\n\n" +
      "Using Spotify and having problems with your music not being tracked or it lagging " +
      "behind? Re-logging in again will not fix this, please use .outofsync for help instead."
    );
  const row = new ActionRowBuilder().addComponents(
    buildSignUpButton(),
    buildConnectButton()
  );
  return { embeds: [embed], components: [row] };
}
function buildConnectPayload(token) {
  const url = `https://www.last.fm/api/auth?api_key=${LASTFM_API_KEY}&token=${token}`;
  const embed = new EmbedBuilder()
    .setColor(DEFAULT_EMBED_COLOR)
    .setDescription(
      "Use the button below to add your Last.fm account to Vinili & Caffè Bot.\n\n" +
      "This link will expire in 5 minutes. If you see Token expired or you refreshed the page, " +
      "return to Discord and run .login again to generate a new link.\n\n" +
      "Please wait a moment after allowing access..."
    );
  const row = new ActionRowBuilder().addComponents(buildConnectLinkButton(url));
  return { embeds: [embed], components: [row] };
}
function buildLoggedInPayload(username) {
  const profileUrl = `https://www.last.fm/user/${encodeURIComponent(username)}`;
  const embed = new EmbedBuilder()
    .setColor(DEFAULT_EMBED_COLOR)
    .setDescription(
      `<:vegacheckmark:1443666279058772028> You have been logged in to Vinili & Caffè Bot with the username **[${username}](${profileUrl})**!\n\n` +
      "Use the button below to start configuring your settings, to customize your Vinili & Caffè Bot " +
      "experience and to import your history.\n\n" +
      "Please note that Vinili & Caffè Bot is not affiliated with Last.fm."
    );
  const row = new ActionRowBuilder().addComponents(
    buildSettingsButton()
  );
  return { embeds: [embed], components: [row] };
}
function buildFetchingPayload(username) {
  const embed = new EmbedBuilder()
    .setColor(DEFAULT_EMBED_COLOR)
    .setDescription(
      `<a:VC_Loading:1462504528774430962> Fetching Last.fm data for **${username}**...\n\n` +
      "Use the button below to start configuring your settings, to customize your Vinili & Caffè Bot " +
      "experience and to import your history.\n\n" +
      "Please note that Vinili & Caffè Bot is not affiliated with Last.fm."
    );
  const row = new ActionRowBuilder().addComponents(
    buildSettingsButton()
  );
  return { embeds: [embed], components: [row] };
}
function buildSettingsPayload(displayName, lastFmUsername) {
  const embed = new EmbedBuilder()
    .setColor(DEFAULT_EMBED_COLOR)
    .setTitle(`Vinili & Caffè Bot user settings - ${displayName}`)
    .setDescription(
      `Connected with Last.fm account **${lastFmUsername}**. Use .login to change.\n\n` +
      "Click the dropdown below to change your user settings.\n\n" +
      "Use `.configuration` for server-wide settings."
    );
  const select = new StringSelectMenuBuilder()
    .setCustomId("lfm_settings_select")
    .setPlaceholder("Select setting to view or change")
    .addOptions(
      { label: "Toggle Global Privacy", value: "privacy" },
      { label: "Toggle FM Mode", value: "fmmode" },
      { label: "Toggle Number Format", value: "numberformat" },
      { label: "Set Timezone (use .localization)", value: "timezone" },
      { label: "Disconnect Last.fm", value: "disconnect" }
    );
  const row = new ActionRowBuilder().addComponents(select);
  return { embeds: [embed], components: [row] };
}

module.exports = { buildWelcomePayload, buildAlreadyConnectedPayload, buildConnectPayload, buildLoggedInPayload, buildFetchingPayload, buildSettingsPayload };