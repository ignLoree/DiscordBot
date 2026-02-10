const { safeReply } = require('../../Utils/Moderation/reply');
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('set')
    .setDescription('Impostazioni bot')
    .addSubcommand((sub) =>
      sub
        .setName('autojoin')
        .setDescription('Attiva o disattiva autojoin TTS')
        .addBooleanOption((opt) =>
          opt
            .setName('stato')
            .setDescription('true per attivo, false per disattivo')
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('voice')
        .setDescription('Imposta la lingua del TTS')
        .addStringOption((opt) =>
          opt
            .setName('lingua')
            .setDescription('Lingua TTS')
            .setRequired(true)
            .addChoices(
              { name: 'Italiano', value: 'it' },
              { name: 'Inglese', value: 'en' },
              { name: 'Spagnolo', value: 'es' },
              { name: 'Francese', value: 'fr' },
              { name: 'Tedesco', value: 'de' },
              { name: 'Portoghese', value: 'pt' },
              { name: 'Russo', value: 'ru' },
              { name: 'Giapponese', value: 'ja' },
              { name: 'Coreano', value: 'ko' },
              { name: 'Cinese', value: 'zh' },
              { name: 'Arabo', value: 'ar' },
              { name: 'Olandese', value: 'nl' },
              { name: 'Polacco', value: 'pl' },
              { name: 'Turco', value: 'tr' }
            )
        )
    ),

  async execute(interaction, client) {
    const sub = interaction.options.getSubcommand();
    client.config.tts = client.config.tts || {};

    if (sub === 'autojoin') {
      const stato = interaction.options.getBoolean('stato', true);
      client.config.tts.autojoin = stato;
      const label = stato ? 'attivo' : 'disattivato';
      return safeReply(interaction, {
        content: `<:vegacheckmark:1443666279058772028> Autojoin TTS settato su \`${label}\`.`,
      });
    }

    if (sub === 'voice') {
      const lingua = interaction.options.getString('lingua', true);
      const { setUserTtsLang } = require('../../Services/TTS/ttsService');
      setUserTtsLang(interaction.user.id, lingua);
      return safeReply(interaction, {
        content: `<:vegacheckmark:1443666279058772028> Lingua TTS personale impostata su \`${lingua}\`.`,
      });
    }
  }
};


