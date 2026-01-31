const { EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const VERIFY_ROLE_IDS = [
  '1442568949605597264',
  '1442568938457399299',
  '1442568955347865675',
  '1442568992459067423',
  '1442569008078393466',
  '1442569020636266531',
  '1442569027082911855'
];

module.exports = {
  skipPrefix: false,
  name: 'verify',
  prefixOverride: "w!",
  
  async execute(message, args) {
    await message.channel.sendTyping();
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return message.reply({ content: '<:vegax:1443934876440068179> Non hai i permessi per usare questo comando.' });
    }
    const targets = await resolveTargetsFlexible(message, args);
    if (!targets.length) {
      return message.reply({ embeds: [buildNoMemberEmbed()] });
    }
    const yesId = `verify_yes:${message.id}:${message.author.id}`;
    const noId = `verify_no:${message.id}:${message.author.id}`;
    const targetMentions = targets.map((member) => member.user?.username || member.displayName || member.id);
    const promptMsg = await message.channel.send({
      embeds: [buildPromptEmbed(targetMentions)],
      components: [buildConfirmRow(yesId, noId)]
    });
    const filter = (i) => i.user.id === message.author.id && (i.customId === yesId || i.customId === noId);
    const collector = promptMsg.createMessageComponentCollector({ filter, time: 10_000, max: 1 });
    collector.on('collect', async (i) => {
      if (i.customId === noId) {
        await i.update({ embeds: [buildCancelledEmbed()], components: [] });
        return;
      }
      const success = [];
      const fail = [];
      for (const member of targets) {
        const rolesToAdd = VERIFY_ROLE_IDS.filter((id) => !member.roles.cache.has(id));
        const displayName = member.user?.username || member.displayName || member.id;
        try {
          if (rolesToAdd.length > 0) {
            await member.roles.add(rolesToAdd);
            success.push(displayName);
          } else {
            fail.push(displayName);
          }
        } catch (err) {
          global.logger.error(err);
          fail.push(displayName);
        }
      }
      await i.deferUpdate();
      await promptMsg.delete().catch(() => {});
      await message.delete().catch(() => {});
      await message.channel.send({
        embeds: [buildResultEmbed(message.author.id, message.guild?.ownerId, success, fail)],
        allowedMentions: { users: [] }
      });
    });
    collector.on('end', async (collected) => {
      if (collected.size > 0) return;
      await promptMsg.edit({ embeds: [buildTimeoutEmbed()], components: [] }).catch(() => {});
    });
  }
};

function formatUserList(list) {
  if (!Array.isArray(list) || list.length === 0) return 'None';
  const maxVisible = 5;
  const shown = list.slice(0, maxVisible);
  const lines = shown.map((entry) => `<:space:1461733157840621608> ${entry}`);
  const remaining = list.length - shown.length;
  if (remaining > 0) {
    lines.push(`<:space:1461733157840621608> +${remaining} users`);
  }
  return lines.join('\n');
}

function buildPromptEmbed(targetTag) {
  const targetText = Array.isArray(targetTag) ? formatUserList(targetTag) : targetTag;
  return new EmbedBuilder()
    .setColor('#6f4e37')
    .setTitle('Do you want to proceed?')
    .setFooter({ text: `Click on either "Yes" or "No" to confirm! You have 10 seconds.`})
    .setDescription(`<:rightDoubleArrow:1465450678062288937> Target:
      ${targetText}`);
}

function buildTimeoutEmbed() {
  return new EmbedBuilder()
    .setColor('#6f4e37')
    .setTitle('Action cancelled! [Timeout]');
}

function buildCancelledEmbed() {
  return new EmbedBuilder()
    .setColor('#6f4e37')
    .setTitle('Action cancelled!');
}

function buildResultEmbed(staffId, ownerId, successList, failList) {
  const successText = successList.length ? formatUserList(successList) : 'None';
  const failText = failList.length ? formatUserList(failList) : 'All users were verified!';
  const ownerMark = ownerId && staffId === ownerId ? ' <:owner:1465451914039787654>' : '';
  return new EmbedBuilder()
    .setColor('#6f4e37')
    .setTitle('Verification Result:')
    .setFields(
      {
        name: '<:trustedAdmin:1465451915428102156> Staff:',
        value: `<@${staffId}>${ownerMark}`
      },
      {
        name: '<:success:1461731530333229226> Successful verifications',
        value: `<:rightSort:1461726104422453298> ${successText}`
      },
      {
        name: '<:cancel:1461730653677551691> Unsuccessful verifications',
        value: `${failText}`
      }
    );
}

function buildNoMemberEmbed() {
  return new EmbedBuilder()
    .setColor('Red')
    .setTitle('Unsuccessful Operation!')
    .setDescription('No actual members were found! Try again!');
}

function buildConfirmRow(yesId, noId, opts = {}) {
  const yesLabel = opts.yesLabel || 'Yes';
  const noLabel = opts.noLabel || 'No';
  const disabled = opts.disabled === true;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(yesId)
      .setLabel(yesLabel)
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(noId)
      .setLabel(noLabel)
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled)
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
  if (raw.includes('#')) {
    const member = guild.members.cache.find(m => m.user.tag === raw);
    return member ? [member] : [];
  }
  const query = args.join(' ').toLowerCase();
  let member = guild.members.cache.find(m =>
    m.user.username.toLowerCase() === query || m.displayName.toLowerCase() === query
  );
  if (member) return [member];
  const fetched = await guild.members.fetch({ query, limit: 10 }).catch(() => null);
  if (fetched && fetched.size > 0) {
    member = fetched.find(m =>
      m.user.username.toLowerCase() === query || m.displayName.toLowerCase() === query
    );
  }
  return member ? [member] : [];
}
