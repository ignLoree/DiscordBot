const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { safeMessageReply } = require('../../Utils/Moderation/reply');
const IDs = require('../../Utils/Config/ids');

function formatUserList(list) {
  if (!Array.isArray(list) || list.length === 0) return 'None';
  const maxVisible = 5;
  const shown = list.slice(0, maxVisible);
  const lines = shown.map((entry, index) => (
    index === 0 ? `**${entry}**` : `<:space:1461733157840621608> **${entry}**`
  ));
  const remaining = list.length - shown.length;
  if (remaining > 0) lines.push(`<:space:1461733157840621608> \`+${remaining} users\``);
  return lines.join('\n');
}

function buildPromptEmbed(targetTag) {
  const targetText = Array.isArray(targetTag) ? formatUserList(targetTag) : targetTag;
  return new EmbedBuilder()
    .setColor('#6f4e37')
    .setTitle('Do you want to proceed?')
    .setFooter({ text: 'Click on either "Yes" or "No" to confirm! You have 10 seconds.' })
    .setDescription(`<:rightDoubleArrow:1465450678062288937> Target:\n${targetText}`);
}

function buildTimeoutEmbed() {
  return new EmbedBuilder().setColor('#6f4e37').setTitle('Action cancelled! [Timeout]');
}

function buildCancelledEmbed() {
  return new EmbedBuilder().setColor('#6f4e37').setTitle('Action cancelled!');
}

function buildResultEmbed(staffId, ownerId, successList, failList) {
  const successText = successList.length ? formatUserList(successList) : 'None';
  const failText = failList.length ? formatUserList(failList) : 'All users were verified!';
  const ownerMark = ownerId && staffId === ownerId ? ' <:owner:1465451914039787654>' : '';
  return new EmbedBuilder()
    .setColor('#6f4e37')
    .setTitle('Verification Result:')
    .setFields(
      { name: '<:trustedAdmin:1465451915428102156> Staff:', value: `<@${staffId}>${ownerMark}` },
      { name: '<:success:1461731530333229226> Successful verifications', value: `<:rightSort:1461726104422453298> ${successText}` },
      { name: '<:cancel:1461730653677551691> Unsuccessful verifications', value: `${failText}` }
    );
}

function buildNoMemberEmbed() {
  return new EmbedBuilder()
    .setColor('Red')
    .setTitle('Unsuccessful Operation!')
    .setDescription('No actual members were found! Try again!');
}

function buildConfirmRow(yesId, noId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(yesId).setLabel('Yes').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(noId).setLabel('No').setStyle(ButtonStyle.Danger)
  );
}

async function resolveTargetsFlexible(message, args) {
  if (!args || args.length === 0) return [];
  const guild = message.guild;
  if (!guild) return [];
  const members = new Map();
  const mentionMembers = message.mentions?.members;
  if (mentionMembers && mentionMembers.size > 0) {
    mentionMembers.forEach((member) => members.set(member.id, member));
  }
  const ids = args
    .map((raw) => raw.match(/^<@!?(\d+)>$/)?.[1] || (raw.match(/^\d{17,20}$/) ? raw : null))
    .filter(Boolean);
  for (const id of ids) {
    if (members.has(id)) continue;
    const member = await guild.members.fetch(id).catch(() => null);
    if (member) members.set(member.id, member);
  }
  if (members.size > 0) return Array.from(members.values());
  const raw = args[0];
  if (raw && raw.includes('#')) {
    const member = guild.members.cache.find((m) => m.user.tag === raw);
    return member ? [member] : [];
  }
  const query = args.join(' ').toLowerCase();
  let member = guild.members.cache.find(
    (m) => m.user.username.toLowerCase() === query || (m.displayName || '').toLowerCase() === query
  );
  if (member) return [member];
  const fetched = await guild.members.fetch({ query, limit: 10 }).catch(() => null);
  if (fetched && fetched.size > 0) {
    member = fetched.find(
      (m) => m.user.username.toLowerCase() === query || (m.displayName || '').toLowerCase() === query
    );
  }
  return member ? [member] : [];
}

async function runVerifyCommand(message, args, client) {
  if (!message?.inGuild?.() || !message.guild || !message.member) return false;

  const guildId = message.guild.id;
  const sponsorGuildIds = IDs.guilds?.sponsorGuildIds || [];
  const isSponsor = Array.isArray(sponsorGuildIds) && sponsorGuildIds.includes(guildId);
  if (!isSponsor) return false;

  const staffRoleId = (IDs.roles?.sponsorStaffRoleIds || {})[guildId];
  const verifyRoleId = (IDs.verificatoRoleIds || {})[guildId];
  if (!staffRoleId || !verifyRoleId) return false;

  const hasStaff = message.member.roles?.cache?.has(staffRoleId);
  if (!hasStaff) {
    await safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor('Red')
          .setDescription('<:vegax:1472992044140990526> Solo lo **staff** può usare il comando `-verify` su questo server.')
      ],
      allowedMentions: { repliedUser: false }
    });
    return true;
  }

  const restArgs = args.slice(1);
  await message.channel.sendTyping().catch(() => {});

  const targets = await resolveTargetsFlexible(message, restArgs);
  if (!targets.length) {
    const reply = await message.reply({ embeds: [buildNoMemberEmbed()] }).catch(() => null);
    await message.delete().catch(() => {});
    return true;
  }

  const role = message.guild.roles.cache.get(verifyRoleId) || await message.guild.roles.fetch(verifyRoleId).catch(() => null);
  if (!role?.id) {
    const sent = await message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor('Red')
          .setTitle('Unsuccessful Operation!')
          .setDescription('Ruolo verifica non configurato per questo server (verificatoRoleIds).')
      ]
    }).catch(() => null);
    await message.delete().catch(() => {});
    return true;
  }

  const yesId = `verify_yes:${message.id}:${message.author.id}`;
  const noId = `verify_no:${message.id}:${message.author.id}`;
  await message.delete().catch(() => {});
  const targetMentions = targets.map((m) => m.user?.username || m.displayName || m.id);
  const promptMsg = await message.channel.send({
    embeds: [buildPromptEmbed(targetMentions)],
    components: [buildConfirmRow(yesId, noId)]
  });

  const filter = (i) => i.user.id === message.author.id && (i.customId === yesId || i.customId === noId);
  const collector = promptMsg.createMessageComponentCollector({ filter, time: 10_000, max: 1 });

  collector.on('collect', async (i) => {
    if (i.customId === noId) {
      try {
        await i.update({ embeds: [buildCancelledEmbed()], components: [] });
      } catch {}
      return;
    }
    const success = [];
    const fail = [];
    for (const member of targets) {
      const displayName = member.user?.username || member.displayName || member.id;
      try {
        if (!member.roles.cache.has(verifyRoleId)) {
          await member.roles.add(verifyRoleId);
          success.push(displayName);
        } else {
          fail.push(displayName);
        }
      } catch (err) {
        global.logger?.error?.(err);
        fail.push(displayName);
      }
    }
    try {
      if (!i.deferred && !i.replied) await i.deferUpdate();
    } catch {}
    await promptMsg.delete().catch(() => {});
    await message.delete().catch(() => {});
    const resultMsg = await message.channel.send({
      embeds: [buildResultEmbed(message.author.id, message.guild?.ownerId, success, fail)],
      allowedMentions: { users: [] }
    });
    setTimeout(() => resultMsg.delete().catch(() => {}), 5000);
  });

  collector.on('end', async (collected) => {
    if (collected.size > 0) return;
    await promptMsg.edit({ embeds: [buildTimeoutEmbed()], components: [] }).catch(() => {});
  });

  return true;
}

module.exports = {
  name: 'verify',
  aliases: [],
  async execute(message, args, client, context = {}) {
    const invoked = String(context?.invokedName || 'verify').toLowerCase();
    return runVerifyCommand(message, [invoked, ...(Array.isArray(args) ? args : [])], client);
  }
};
