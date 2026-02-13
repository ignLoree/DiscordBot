const { EmbedBuilder } = require('discord.js');
const { safeMessageReply } = require('../../Utils/Moderation/reply');
const { ExpUser } = require('../../Schemas/Community/communitySchemas');
const { getLevelInfo, syncLevelRolesForMember } = require('../../Services/Community/expService');
const IDs = require('../../Utils/Config/ids');
const LEVEL_UP_CHANNEL_ID = IDs.channels.commands;
const LEVEL_ROLE_MAP = new Map([
  [10, IDs.roles.Level10],
  [20, IDs.roles.Level20],
  [30, IDs.roles.Level30],
  [50, IDs.roles.Level50],
  [70, IDs.roles.Level70],
  [100, IDs.roles.Level100]
]);

function roundToNearest50(value) {
  return Math.round(value / 50) * 50;
}

function getLevelStep(level) {
  const safeLevel = Math.max(1, Math.floor(Number(level || 1)));
  let step = 90 + Math.floor(safeLevel * 12) + (safeLevel % 4) * 15;

  if (safeLevel >= 10) {
    const over10 = safeLevel - 9;
    step += 120 + (over10 * 28) + Math.floor((over10 * over10) * 1.3);
  }
  if (safeLevel >= 30) {
    step += 120 + ((safeLevel - 30) * 18);
  }
  if (safeLevel >= 50) {
    step += 220 + ((safeLevel - 50) * 25);
  }

  return Math.max(110, step);
}

function getTotalExpForLevel(level) {
  const targetLevel = Math.max(0, Math.floor(Number(level || 0)));
  if (targetLevel <= 0) return 0;

  let threshold = 100;
  for (let l = 1; l < targetLevel; l += 1) {
    threshold = roundToNearest50(threshold + Math.max(110, getLevelStep(l)));
  }
  return threshold;
}

async function resolveTargetUser(message, raw) {
  const fromMention = message.mentions?.users?.first();
  if (fromMention) return fromMention;
  const id = String(raw || '').replace(/[<@!>]/g, '');
  if (!/^\d{16,20}$/.test(id)) return null;
  return message.client.users.fetch(id).catch(() => null);
}

async function addLevelRoleIfPossible(guild, member, roleId) {
  if (!guild || !member || !roleId) return false;
  const me = guild.members.me;
  if (!me) return false;
  if (!me.permissions.has('ManageRoles')) return false;
  const role = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
  if (!role) return false;
  if (role.position >= me.roles.highest.position) return false;
  if (member.roles.cache.has(roleId)) return true;
  await member.roles.add(role).catch(() => {});
  return member.roles.cache.has(roleId);
}

module.exports = {
  name: 'addlevel',
  aliases: ['addlvl', 'leveladd'],

  async execute(message, args = []) {
    await message.channel.sendTyping().catch(() => {});

    const target = await resolveTargetUser(message, args[0]);
    const amount = Number(args[1]);

    if (!target || !Number.isInteger(amount) || amount <= 0) {
      const help = new EmbedBuilder()
        .setColor('Red')
        .setDescription('<:vegax:1443934876440068179> Uso corretto: `+addlevel <@utente|id> <livelli>`');
      await safeMessageReply(message, { embeds: [help], allowedMentions: { repliedUser: false } });
      return;
    }

    const guildId = message.guild?.id;
    if (!guildId) return;

    let doc = await ExpUser.findOne({ guildId, userId: target.id });
    if (!doc) {
      doc = new ExpUser({ guildId, userId: target.id });
    }

    const currentExp = Number(doc.totalExp || 0);
    const currentLevel = getLevelInfo(currentExp).level;
    const targetLevel = currentLevel + amount;
    const targetExp = getTotalExpForLevel(targetLevel);
    const finalExp = Math.max(currentExp, targetExp);
    const addedExp = Math.max(0, finalExp - currentExp);

    doc.totalExp = finalExp;
    doc.level = getLevelInfo(finalExp).level;
    await doc.save();
    await syncLevelRolesForMember(message.guild, target.id, doc.level);

    const levelUpChannel = message.guild.channels.cache.get(LEVEL_UP_CHANNEL_ID)
      || await message.guild.channels.fetch(LEVEL_UP_CHANNEL_ID).catch(() => null);
    if (levelUpChannel) {
      const levelUpEmbed = new EmbedBuilder()
        .setColor('#6f4e37')
        .setTitle(`${target.username} leveled up!`)
        .setThumbnail(target.displayAvatarURL({ size: 256 }))
        .setDescription([
          `<a:VC_PandaClap:1331620157398712330> **Complimenti ${target}!**`,
          `<:VC_LevelUp2:1443701876892762243> Hai appena raggiunto il **livello** \`${doc.level}\``,
          `<:dot:1443660294596329582> Livelli assegnati dallo staff: **+${amount}**`
        ].join('\n'))
        .setFooter({ text: `Azione staff: ${message.author.tag}` });

      await levelUpChannel.send({
        content: `${target} sei salito/a di livello! <a:VC_LevelUp:1469046204582068376>`,
        embeds: [levelUpEmbed]
      }).catch(() => {});

      const reachedPerkLevels = Array.from(LEVEL_ROLE_MAP.keys())
        .filter((level) => level > currentLevel && level <= doc.level)
        .sort((a, b) => a - b);

      const targetMember = message.guild.members.cache.get(target.id)
        || await message.guild.members.fetch(target.id).catch(() => null);
      for (const level of reachedPerkLevels) {
        const roleId = LEVEL_ROLE_MAP.get(level);
        if (!roleId) continue;
        if (targetMember) {
          await addLevelRoleIfPossible(message.guild, targetMember, roleId);
        }
        const perkEmbed = new EmbedBuilder()
          .setColor('#6f4e37')
          .setTitle(`${target.username} leveled up!`)
          .setThumbnail(target.displayAvatarURL({ size: 256 }))
          .setDescription([
            `<a:VC_PandaClap:1331620157398712330> **Complimenti ${target}!**`,
            `<:VC_LevelUp2:1443701876892762243> Hai appena raggiunto il <@&${roleId}>`,
            `<a:VC_HelloKittyGift:1329447876857958471> Controlla <#${IDs.channels.info}> per i nuovi vantaggi!`
          ].join('\n'))
          .setFooter({ text: `Azione staff: ${message.author.tag}` });

        await levelUpChannel.send({
          content: `${target} sei salito/a di livello! <a:VC_LevelUp:1469046204582068376>`,
          embeds: [perkEmbed]
        }).catch(() => {});
      }
    }

    const done = new EmbedBuilder()
      .setColor('#6f4e37')
      .setTitle('<:vegacheckmark:1443666279058772028> Livelli Aggiornati')
      .setDescription(`Ho aggiunto **${amount} livelli** a ${target}.`)
      .addFields(
        { name: 'Livello', value: `\`${currentLevel}\` -> \`${doc.level}\``, inline: true },
        { name: 'EXP Aggiunta', value: `\`+${addedExp}\``, inline: true },
        { name: 'EXP Totale', value: `\`${finalExp}\``, inline: true }
      )
      .setThumbnail(target.displayAvatarURL({ size: 256 }));

    await safeMessageReply(message, {
      embeds: [done],
      allowedMentions: { repliedUser: false, users: [target.id] }
    });
  }
};


