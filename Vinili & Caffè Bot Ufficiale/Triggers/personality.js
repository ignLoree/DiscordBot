const { EmbedBuilder, AttachmentBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const path = require('path');
const PersonalityPanel = require('../Schemas/Community/personalityPanelSchema');

const CHANNEL_ID = '1469429150669602961';
const IMAGE_NAME = 'personalità.gif';
const IMAGE_PATH = path.join(__dirname, '..', 'Photos', IMAGE_NAME);
const MENTIONS_IMAGE_NAME = 'menzioni.gif';
const MENTIONS_IMAGE_PATH = path.join(__dirname, '..', 'Photos', MENTIONS_IMAGE_NAME);
const COLORS_IMAGE_NAME = 'colori.gif';
const COLORS_IMAGE_PATH = path.join(__dirname, '..', 'Photos', COLORS_IMAGE_NAME);
const DIVIDER_URL = 'https://cdn.discordapp.com/attachments/1467927329140641936/1467927368034422959/image.png?ex=69876f65&is=69861de5&hm=02f439283952389d1b23bb2793b6d57d0f8e6518e5a209cb9e84e625075627db';

module.exports = {
  name: 'clientReady',
  once: true,

  async execute(client) {
    const channel = client.channels.cache.get(CHANNEL_ID)
      || await client.channels.fetch(CHANNEL_ID).catch(() => null);
    if (!channel) return;

    const attachment = new AttachmentBuilder(IMAGE_PATH, { name: IMAGE_NAME });
    const embed = new EmbedBuilder()
      .setColor('#6f4e37')
      .setTitle('➷ Personalità')
      .setDescription([
        'Scegli in cosa ti identifichi, quanti anni hai e di dove sei. Utilizza i menù a tendina sottostanti.',
        '',
        '<a:VC_Exclamation:1448687427836444854> Massimo **1** ruolo per categoria.'
      ].join('\n'))
      .setImage(DIVIDER_URL);

    const mentionsAttachment = new AttachmentBuilder(MENTIONS_IMAGE_PATH, { name: MENTIONS_IMAGE_NAME });
    const mentionsEmbed = new EmbedBuilder()
      .setColor('#6f4e37')
      .setTitle('➷ Menzioni')
      .setDescription([
        'Scegli quali notifiche ricevere dal server in base a cosa ti interessa maggiormente.',
        '',
        '<a:VC_Exclamation:1448687427836444854> Le notifiche di **@everyone** le riceveranno tutti.'
      ].join('\n'))
      .setImage(DIVIDER_URL);

    const colorsAttachment = new AttachmentBuilder(COLORS_IMAGE_PATH, { name: COLORS_IMAGE_NAME });
    const colorsEmbed = new EmbedBuilder()
      .setColor('#6f4e37')
      .setTitle('➷ Colori')
      .setDescription([
        'Scegli il colore per personalizzare il nome del tuo profilo quando scrivi in chat.',
        '',
        '<a:VC_Exclamation:1448687427836444854> Verrà mostrato il **colore più in alto** nella lista dei ruoli nel tuo profilo.'
      ].join('\n'))
      .setImage(DIVIDER_URL);

    const pronouns = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('personality_pronouns')
        .setPlaceholder('⭐ Seleziona i tuoi pronomi')
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(
          { label: 'Rimuovi i ruoli di sesso', description: 'Rimuovii ruoli dal tuo profilo', value: 'remove', emoji: '❌' },
          { label: 'he/him', value: '1442568997848743997', emoji: '👨', description: 'Clicca qui per ottenere il ruolo' },
          { label: 'she/her', value: '1442568999043989565', emoji: '👩', description: 'Clicca qui per ottenere il ruolo' },
          { label: 'they/them', value: '1442569000063074498', emoji: '🧑', description: 'Clicca qui per ottenere il ruolo' },
          { label: 'ask me', value: '1442569001367769210', emoji: '❓', description: 'Clicca qui per ottenere il ruolo' },
          { label: 'other pronouns', value: '1442569002932109434', emoji: '🌈', description: 'Clicca qui per ottenere il ruolo' }
        )
    );

    const age = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('personality_age')
        .setPlaceholder('🔞 Seleziona la tua età')
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(
          { label: 'Rimuovi i ruoli di età', value: 'remove', description: 'Rimuovii ruoli dal tuo profilo', emoji: '❌' },
          { label: '13-14', value: '1442568993197265021', emoji: '🧸', description: 'Clicca qui per ottenere il ruolo' },
          { label: '15-16', value: '1442568994581381170', emoji: '🪒', description: 'Clicca qui per ottenere il ruolo' },
          { label: '17-18', value: '1442568995348807691', emoji: '🧹', description: 'Clicca qui per ottenere il ruolo' },
          { label: '19+', value: '1442568996774871194', emoji: '🍂', description: 'Clicca qui per ottenere il ruolo' }
        )
    );

    const region = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('personality_region')
        .setPlaceholder('🗺️ Seleziona la tua località')
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(
          { label: 'Rimuovi i ruoli di provenienza', value: 'remove', description: 'Rimuovii ruoli dal tuo profilo', emoji: '❌' },
          { label: 'Nord', value: '1442569021861007443', emoji: '🥀', description: 'Clicca qui per ottenere il ruolo' },
          { label: 'Centro', value: '1442569023303974922', emoji: '🌿', description: 'Clicca qui per ottenere il ruolo' },
          { label: 'Sud', value: '1442569024486506498', emoji: '🌵', description: 'Clicca qui per ottenere il ruolo' },
          { label: 'Estero', value: '1442569025790939167', emoji: '🌍', description: 'Clicca qui per ottenere il ruolo' }
        )
    );

    const dmStatus = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('personality_dm')
        .setPlaceholder('📩 Seleziona il tuo stato DM')
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(
          { label: 'Rimuovi i ruoli DM', value: 'remove', description: 'Rimuovii ruoli dal tuo profilo', emoji: '❌' },
          { label: 'DMs Opened', value: '1442569004215697438', emoji: '📫', description: 'Clicca qui per ottenere il ruolo' },
          { label: 'DMs Closed', value: '1442569005071077417', emoji: '📪', description: 'Clicca qui per ottenere il ruolo' },
          { label: 'Ask to DM', value: '1442569006543274126', emoji: '📭', description: 'Clicca qui per ottenere il ruolo' }
        )
    );

    const relationship = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('personality_relationship')
        .setPlaceholder('💞 Seleziona il tuo stato sentimentale')
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(
          { label: 'Rimuovi i ruoli sentimentali', value: 'remove', description: 'Rimuovii ruoli dal tuo profilo', emoji: '❌' },
          { label: 'Fidanzato/a', value: '1442569028173299732', emoji: '💋', description: 'Clicca qui per ottenere il ruolo' },
          { label: 'Single', value: '1442569029263818906', emoji: '💦', description: 'Clicca qui per ottenere il ruolo' }
        )
    );

    const mentionsMenu = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('personality_mentions')
        .setPlaceholder('📢 Seleziona le notifiche da ricevere')
        .setMinValues(1)
        .setMaxValues(7)
        .addOptions(
          { label: 'Rimuovi', value: 'remove', emoji: '❌', description: 'Rimuovii ruoli dal tuo profilo' },
          { label: 'Revive Chat', value: '1442569009567629375', emoji: '🗣️', description: 'Clicca qui per ottenere il ruolo' },
          { label: 'Events', value: '1442569012063109151', emoji: '🎉', description: 'Clicca qui per ottenere il ruolo' },
          { label: 'News', value: '1442569010943365342', emoji: '📰', description: 'Clicca qui per ottenere il ruolo' },
          { label: 'Polls', value: '1442569014474965033', emoji: '📊', description: 'Clicca qui per ottenere il ruolo' },
          { label: 'Bump', value: '1442569013074071644', emoji: '🔔', description: 'Clicca qui per ottenere il ruolo' },
          { label: 'Minigames', value: '1443955529352478830', emoji: '🎲', description: 'Clicca qui per ottenere il ruolo' },
          { label: 'Forum', value: '1447597930944008376', emoji: '💼', description: 'Clicca qui per ottenere il ruolo' }
        )
    );

    const colorsMenu1 = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('personality_colors_1')
        .setPlaceholder('🎨 Scegli un colore per il tuo profilo')
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(
          { label: 'Rimuovi', value: 'remove', emoji: '❌', description: 'Rimuovii ruoli dal tuo profilo' },
          { label: 'Cherry', value: '1442568958656905318', emoji: '🍒', description: 'Clicca qui per ottenere il ruolo' },
          { label: 'Blood', value: '1442568956832645212', emoji: '🩸', description: 'Clicca qui per ottenere il ruolo' },
          { label: 'Scarlet', value: '1442568961077153994', emoji: '🏮', description: 'Clicca qui per ottenere il ruolo' },
          { label: 'Coral', value: '1442568960016121998', emoji: '🪸', description: 'Clicca qui per ottenere il ruolo' },
          { label: 'Carrot', value: '1442568963836874886', emoji: '🥕', description: 'Clicca qui per ottenere il ruolo' },
          { label: 'Pumpkin', value: '1442568965040636019', emoji: '🎃', description: 'Clicca qui per ottenere il ruolo' },
          { label: 'Orange', value: '1442568967045648412', emoji: '🍊', description: 'Clicca qui per ottenere il ruolo' },
          { label: 'Peach', value: '1442568962167541760', emoji: '🍑', description: 'Clicca qui per ottenere il ruolo' },
          { label: 'Mais', value: '1442568968371048449', emoji: '🌽', description: 'Clicca qui per ottenere il ruolo' },
          { label: 'Gold', value: '1442568969528541225', emoji: '🏅', description: 'Clicca qui per ottenere il ruolo' },
          { label: 'Amber', value: '1442568970497687717', emoji: '🔑', description: 'Clicca qui per ottenere il ruolo' },
          { label: 'Lime', value: '1442568971357388912', emoji: '🍋‍🟩', description: 'Clicca qui per ottenere il ruolo' },
          { label: 'Pear', value: '1442568972745838667', emoji: '🍐', description: 'Clicca qui per ottenere il ruolo' },
          { label: 'Moss', value: '1442568975966797926', emoji: '🍃', description: 'Clicca qui per ottenere il ruolo' }
        )
    );

    const colorsMenu2 = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('personality_colors_2')
        .setPlaceholder('🎨 Scegli un colore per il tuo profilo')
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(
          { label: 'Green', value: '1442568976944201828', emoji: '🥬', description: 'Clicca qui per ottenere il ruolo' },
          { label: 'Olive', value: '1442568974486208634', emoji: '🫒', description: 'Clicca qui per ottenere il ruolo' },
          { label: 'Aqua', value: '1442568977896439960', emoji: '💧', description: 'Clicca qui per ottenere il ruolo' },
          { label: 'Blue', value: '1442568979473371258', emoji: '💎', description: 'Clicca qui per ottenere il ruolo' },
          { label: 'Electric Blue', value: '1442568980626673685', emoji: '🧶', description: 'Clicca qui per ottenere il ruolo' },
          { label: 'Midnight Blue', value: '1442568981792948304', emoji: '🌃', description: 'Clicca qui per ottenere il ruolo' },
          { label: 'Eggplant', value: '1442568982769959002', emoji: '🍆', description: 'Clicca qui per ottenere il ruolo' },
          { label: 'Purple', value: '1442568983898357954', emoji: '🏓', description: 'Clicca qui per ottenere il ruolo' },
          { label: 'Lilac', value: '1442568985278156971', emoji: '🌷', description: 'Clicca qui per ottenere il ruolo' },
          { label: 'Sangria', value: '1442568986720993350', emoji: '🍷', description: 'Clicca qui per ottenere il ruolo' },
          { label: 'Black Cat', value: '1442568987887276133', emoji: '🐈‍⬛', description: 'Clicca qui per ottenere il ruolo' },
          { label: 'Grey Smoke', value: '1442568988961013821', emoji: '🚬', description: 'Clicca qui per ottenere il ruolo' },
          { label: 'Grey', value: '1442568989866725468', emoji: '🐭', description: 'Clicca qui per ottenere il ruolo' },
          { label: 'White', value: '1442568991150309578', emoji: '🐼', description: 'Clicca qui per ottenere il ruolo' }
        )
    );

    const guildId = channel.guild?.id;
    if (!guildId) return;

    let panel = null;
    try {
      panel = await PersonalityPanel.findOneAndUpdate(
        { guildId, channelId: CHANNEL_ID },
        { $setOnInsert: { guildId, channelId: CHANNEL_ID } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    } catch {}

    const updatePanel = async (personalityMessageId, mentionsMessageId, colorsMessageId) => {
      try {
        await PersonalityPanel.updateOne(
          { guildId, channelId: CHANNEL_ID },
          { $set: { personalityMessageId, mentionsMessageId, colorsMessageId } }
        );
      } catch {}
    };

    let personalityMessage = null;
    let mentionsMessage = null;
    let colorsMessage = null;

    if (panel?.personalityMessageId) {
      personalityMessage = await channel.messages.fetch(panel.personalityMessageId).catch(() => null);
    }
    if (panel?.mentionsMessageId) {
      mentionsMessage = await channel.messages.fetch(panel.mentionsMessageId).catch(() => null);
    }
    if (panel?.colorsMessageId) {
      colorsMessage = await channel.messages.fetch(panel.colorsMessageId).catch(() => null);
    }

    if (personalityMessage) {
      await personalityMessage.edit({ embeds: [embed], components: [pronouns, age, region, dmStatus, relationship], files: [attachment] }).catch(() => {});
    } else {
      personalityMessage = await channel.send({ embeds: [embed], components: [pronouns, age, region, dmStatus, relationship], files: [attachment] }).catch(() => null);
    }

    if (mentionsMessage) {
      await mentionsMessage.edit({ embeds: [mentionsEmbed], components: [mentionsMenu], files: [mentionsAttachment] }).catch(() => {});
    } else {
      mentionsMessage = await channel.send({ embeds: [mentionsEmbed], components: [mentionsMenu], files: [mentionsAttachment] }).catch(() => null);
    }

    if (colorsMessage) {
      await colorsMessage.edit({ embeds: [colorsEmbed], components: [colorsMenu1, colorsMenu2], files: [colorsAttachment] }).catch(() => {});
    } else {
      colorsMessage = await channel.send({ embeds: [colorsEmbed], components: [colorsMenu1, colorsMenu2], files: [colorsAttachment] }).catch(() => null);
    }

    if (personalityMessage || mentionsMessage || colorsMessage) {
      await updatePanel(
        personalityMessage?.id || panel?.personalityMessageId || null,
        mentionsMessage?.id || panel?.mentionsMessageId || null,
        colorsMessage?.id || panel?.colorsMessageId || null
      );
    }
  }
};
