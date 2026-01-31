const { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField } = require('discord.js');
const { Season } = require('../../Schemas/Pass/season');
const { RaidState } = require('../../Schemas/Pass/raidState');
const { PassUser } = require('../../Schemas/Pass/passUser');
const CONFIG = require('../../config');
const { getOrCreatePassUser, addTickets, addFragments, spendTickets, spendFragments } = require('../../Services/Pass/passService');
const { requireActiveSeason } = require('../../Services/Pass/seasonService');
const { registerProgress } = require('../../Services/Pass/objectiveService');
const { registerMissionProgress, refreshMissionWindows } = require('../../Services/Pass/missionService');
const { isSameDay, startOfToday } = require('../../Utils/Pass/time');
const { Transaction } = require('../../Schemas/Pass/transaction');
const { seedPassData } = require('../../Services/Pass/passSeedService');

module.exports = {
  skipDeploy: true,
  data: new SlashCommandBuilder()
    .setName('pass-admin')
    .setDescription('Comandi admin del Pass')
    .addSubcommand(sc =>
      sc
        .setName('stagione-attiva')
        .setDescription('Attiva una nuova stagione')
        .addStringOption(o =>
          o.setName('seasonid')
            .setDescription('ID univoco della stagione (es: season_30d_001)')
            .setRequired(true)
        )
        .addStringOption(o =>
          o.setName('name')
            .setDescription('Nome visibile della stagione')
            .setRequired(true)
        )
        .addStringOption(o =>
          o.setName('theme')
            .setDescription('Tema opzionale della stagione')
            .setRequired(false)
        )
        .addIntegerOption(o =>
          o.setName('days')
            .setDescription('Durata stagione in giorni (default 30)')
            .setRequired(false)
        )
    )
    .addSubcommand(sc =>
      sc
        .setName('raid-avvia')
        .setDescription('Avvia il raid del boss (48h)')
        .addIntegerOption(o =>
          o.setName('hp')
            .setDescription('HP del boss (default 10000)')
            .setRequired(false)
        )
    )
    .addSubcommand(sc =>
      sc
        .setName('raid-cancella')
        .setDescription('Cancella il boss e ferma il raid attivo')
    )
    .addSubcommand(sc =>
      sc
        .setName('progresso')
        .setDescription('Assegna progresso Pass manualmente')
        .addUserOption(o =>
          o.setName('utente')
            .setDescription('Utente a cui assegnare un progresso')
            .setRequired(true)
        )
        .addStringOption(o =>
          o.setName('tipo')
            .setDescription('Tipo objective.kind')
            .setRequired(true)
            .addChoices(
              { name: 'quiz_win', value: 'quiz_win' },
              { name: 'event_participation', value: 'event_participation' },
              { name: 'party_quiz_combo', value: 'party_quiz_combo' },
              { name: 'coop_missions', value: 'coop_missions' },
              { name: 'duel_wins', value: 'duel_wins' },
              { name: 'midseason_event', value: 'midseason_event' },
              { name: 'raid_boss', value: 'raid_boss' },
              { name: 'complete_pass', value: 'complete_pass' },
              { name: 'chat_variety', value: 'chat_variety' },
              { name: 'chat_unique', value: 'chat_unique' },
              { name: 'voice', value: 'voice' },
              { name: 'voice_cumulative', value: 'voice_cumulative' },
              { name: 'raid_contribute', value: 'raid_contribute' },
              { name: 'daily_complete', value: 'daily_complete' },
              { name: 'daily_missions', value: 'daily_missions' },
              { name: 'weekly_missions', value: 'weekly_missions' },
              { name: 'streak5', value: 'streak5' }
            )
        )
        .addIntegerOption(o =>
          o.setName('amount')
            .setDescription('Quantità (default 1)')
            .setRequired(false)
        )
    )
    .addSubcommand(sc =>
      sc
        .setName('reset-utente')
        .setDescription('Reset completo del Pass per un utente')
        .addUserOption(o =>
          o.setName('utente')
            .setDescription('Utente da resettare')
            .setRequired(true)
        )
    )
    .addSubcommand(sc =>
      sc
        .setName('reset-energia')
        .setDescription('Reset energia per un utente')
        .addUserOption(o =>
          o.setName('utente')
            .setDescription('Utente da resettare')
            .setRequired(false)
        )
        .addBooleanOption(o =>
          o.setName('tutti')
            .setDescription('Reset energia per tutti gli utenti della stagione')
            .setRequired(false)
        )
    )
    .addSubcommand(sc =>
      sc
        .setName('reset-stagione')
        .setDescription('Reset completo della stagione attiva')
        .addStringOption(o =>
          o.setName('conferma')
            .setDescription('Scrivi SI per confermare')
            .setRequired(true)
            .addChoices({ name: 'SI', value: 'SI' })
        )
    )
    .addSubcommand(sc =>
      sc
        .setName('valuta')
        .setDescription('Aggiungi o rimuovi ticket/frammenti')
        .addUserOption(o =>
          o.setName('utente')
            .setDescription('Utente target')
            .setRequired(true)
        )
        .addStringOption(o =>
          o.setName('azione')
            .setDescription('Tipo azione')
            .setRequired(true)
            .addChoices(
              { name: 'add', value: 'add' },
              { name: 'remove', value: 'remove' }
            )
        )
        .addStringOption(o =>
          o.setName('valuta')
            .setDescription('Valuta')
            .setRequired(true)
            .addChoices(
              { name: 'tickets', value: 'tickets' },
              { name: 'fragment_common', value: 'fragment:common' },
              { name: 'fragment_rare', value: 'fragment:rare' },
              { name: 'fragment_epic', value: 'fragment:epic' },
              { name: 'fragment_legendary', value: 'fragment:legendary' }
            )
        )
        .addIntegerOption(o =>
          o.setName('amount')
            .setDescription('Quantità')
            .setRequired(true)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const guildId = interaction.guild.id;
    const sub = interaction.options.getSubcommand();
    await interaction.deferReply();

    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) return await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setDescription('<:vegax:1443934876440068179> Non hai il permesso per fare questo comando.')
          .setColor("Red")
      ],
      flags: 1 << 6
    });
    
    if (sub === 'stagione-attiva') {
      const seasonId = interaction.options.getString('seasonid', true);
      const name = interaction.options.getString('name', true);
      const theme = interaction.options.getString('theme') || '';
      const days = interaction.options.getInteger('days') || 30;

      await Season.updateMany({ guildId }, { $set: { isActive: false } });
      const startAt = new Date();
      const endAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

      await Season.findOneAndUpdate(
        { guildId, seasonId },
        {
          $set: {
            guildId,
            seasonId,
            name,
            theme,
            startAt,
            endAt,
            isActive: true,
            config: CONFIG.pass
          }
        },
        { upsert: true, new: true }
      );

      await seedPassData({ guildId, seasonId });
      await refreshMissionWindows({ guildId, seasonId });

      return interaction.editReply({
        content: `<:vegacheckmark:1443666279058772028> Stagione **${name}** attivata per **${days} giorni**.`,
      });
    }
    if (sub === 'raid-avvia') {
      const hp = interaction.options.getInteger('hp') || 10000;
      const season = await Season.findOne({ guildId, isActive: true });
      if (!season) throw new Error('Nessuna stagione attiva.');
      const endsAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

      await RaidState.findOneAndUpdate(
        { guildId, seasonId: season.seasonId },
        {
          $set: {
            active: true,
            boss: {
              hpMax: hp,
              hpNow: hp,
              phase: 1,
              startedAt: new Date(),
              endsAt
            },
            contrib: {},
            rewardsUnlocked: []
          }
        },
        { upsert: true, new: true }
      );

      return interaction.editReply({
        content: `<:vegacheckmark:1443666279058772028> Raid avviato! HP: **${hp}**\n <a:VC_Timer:1462779065625739344> Fine: <t:${Math.floor(
          endsAt.getTime() / 1000
        )}:R>`
      });
    }

    if (sub === 'raid-cancella') {
      const season = await requireActiveSeason(guildId);
      await RaidState.findOneAndUpdate(
        { guildId, seasonId: season.seasonId },
        {
          $set: {
            active: false,
            boss: {
              hpMax: 0,
              hpNow: 0,
              phase: 1,
              startedAt: null,
              endsAt: null,
              defeatedAt: null
            },
            contrib: {},
            rewardsUnlocked: []
          }
        },
        { upsert: true }
      );
      return interaction.editReply({
        content: '<:vegax:1443934876440068179> Raid/boss cancellato.'
      });
    }

    if (sub === 'progresso') {
      const season = await requireActiveSeason(guildId);
      const target = interaction.options.getUser('utente', true);
      const type = interaction.options.getString('tipo', true);
      const amount = interaction.options.getInteger('amount') || 1;

      const u = await getOrCreatePassUser({
        guildId,
        seasonId: season.seasonId,
        userId: target.id
      });

      await registerProgress({
        guildId,
        seasonId: season.seasonId,
        passUser: u,
        type,
        amount
      });

      await registerMissionProgress({
        guildId,
        seasonId: season.seasonId,
        passUser: u,
        type,
        amount
      });

      if (type === 'quiz_win') {
        const today = startOfToday();
        u.stats.lastQuizWinAt = new Date();
        const lastCombo = u.stats.lastPartyQuizComboAt;
        const canAwardCombo =
          u.stats.partyToday &&
          (!lastCombo || !isSameDay(lastCombo, today));
        if (canAwardCombo) {
          await registerProgress({
            guildId,
            seasonId: season.seasonId,
            passUser: u,
            type: 'party_quiz_combo',
            amount: 1
          });
          u.stats.lastPartyQuizComboAt = today;
        }
        await u.save();
      }

      return interaction.editReply({
        content: `<:vegacheckmark:1443666279058772028> Progresso **${type}** aggiornato per <@${target.id}> (x${amount}).`,
        allowedMentions: { users: [target.id] }
      });
    }

    if (sub === 'reset-utente') {
      const season = await requireActiveSeason(guildId);
      const target = interaction.options.getUser('utente', true);

      const u = await getOrCreatePassUser({
        guildId,
        seasonId: season.seasonId,
        userId: target.id
      });
      u.energy = CONFIG.pass.energyMax;
      u.energyLastRefillAt = new Date();
      u.tickets = 0;
      u.fragments = {};
      u.completedNodes = [];
      u.claimedRewards = [];
      u.progress = {};
      u.missionsProgress = {};
      u.completedMissions = [];
      u.path = 'none';
      u.stats.chatCountToday = 0;
      u.stats.chatTicketsToday = 0;
      u.stats.voiceTicketsToday = 0;
      u.stats.voiceMinutesToday = 0;
      u.stats.raidDamage = 0;
      u.stats.chatChannelsToday = [];
      u.stats.partyToday = false;
      u.stats.lastPartyAt = null;
      u.stats.lastQuizWinAt = null;
      u.stats.lastPartyQuizComboAt = null;
      u.stats.dailyMissionStreak = 0;
      u.stats.lastDailyMissionCompletedAt = null;
      u.cooldowns.lastChatRewardAt = null;
      u.dailyResetAt = startOfToday();
      u.lastDailyResetAt = null;
      u.lastWeeklyResetAt = null;
      await u.save();

      return interaction.editReply({
        content: `<:vegacheckmark:1443666279058772028> Reset Pass completato per <@${target.id}>.`,
        allowedMentions: { users: [target.id] }
      });
    }
    if (sub === 'reset-energia') {
      const season = await requireActiveSeason(guildId);
      const all = interaction.options.getBoolean('tutti') || false;
      const target = interaction.options.getUser('utente');

      if (!all && !target) {
        throw new Error('Devi specificare un utente o usare tutti.');
      }

      if (all) {
        await PassUser.updateMany(
          { guildId, seasonId: season.seasonId },
          { $set: { energy: CONFIG.pass.energyMax, energyLastRefillAt: new Date() } }
        );

        return interaction.editReply({ content: '<:vegacheckmark:1443666279058772028> Energia resettata per tutti gli utenti della stagione.' });
      }

      const u = await getOrCreatePassUser({
        guildId,
        seasonId: season.seasonId,
        userId: target.id
      });

      u.energy = CONFIG.pass.energyMax;
      u.energyLastRefillAt = new Date();
      await u.save();

      return interaction.editReply({
        content: `<:vegacheckmark:1443666279058772028> Energia resettata per <@${target.id}>.`,
        allowedMentions: { users: [target.id] }
      });
    }

    if (sub === 'reset-stagione') {
      const confirm = interaction.options.getString('conferma', true);
      if (confirm !== 'SI') throw new Error('Conferma non valida.');
      const season = await requireActiveSeason(guildId);

      await Season.updateOne(
        { guildId, seasonId: season.seasonId },
        { $set: { isActive: false, endAt: new Date() } }
      );

      return interaction.editReply({
        content: `<:vegacheckmark:1443666279058772028> Stagione **${season.seasonId}** conclusa.`
      });
    }

    if (sub === 'valuta') {
      const season = await requireActiveSeason(guildId);
      const target = interaction.options.getUser('utente', true);
      const action = interaction.options.getString('azione', true);
      const currency = interaction.options.getString('valuta', true);
      const amount = interaction.options.getInteger('amount', true);

      if (amount <= 0) throw new Error('Quantità non valida.');
      const u = await getOrCreatePassUser({
        guildId,
        seasonId: season.seasonId,
        userId: target.id
      });

      if (currency === 'tickets') {
        if (action === 'add') {
          await addTickets(u, amount);
          await Transaction.create({
            guildId,
            seasonId: season.seasonId,
            userId: target.id,
            type: 'grant',
            currency: 'tickets',
            amount,
            reason: 'admin_adjust'
          });
        } else {
          await spendTickets(u, amount);
          await Transaction.create({
            guildId,
            seasonId: season.seasonId,
            userId: target.id,
            type: 'spend',
            currency: 'tickets',
            amount,
            reason: 'admin_adjust'
          });
        }
      } else if (currency.startsWith('fragment:')) {
        const frag = currency.split(':')[1];
        if (action === 'add') {
          await addFragments(u, { [frag]: amount });
          await Transaction.create({
            guildId,
            seasonId: season.seasonId,
            userId: target.id,
            type: 'grant',
            currency: `fragment:${frag}`,
            amount,
            reason: 'admin_adjust'
          });
        } else {
          await spendFragments(u, { [frag]: amount });
          await Transaction.create({
            guildId,
            seasonId: season.seasonId,
            userId: target.id,
            type: 'spend',
            currency: `fragment:${frag}`,
            amount,
            reason: 'admin_adjust'
          });
        }
      } else {
        throw new Error('Valuta non valida.');
      }
      return interaction.editReply({
        content: `<:vegacheckmark:1443666279058772028> Valuta aggiornata per <@${target.id}>: ${action} ${amount} ${currency}.`,
        allowedMentions: { users: [target.id] }
      });
    }
  }
};
