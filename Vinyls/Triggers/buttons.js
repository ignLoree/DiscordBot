const { EmbedBuilder, Events, ActionRowBuilder, ButtonBuilder, ButtonStyle, } = require("discord.js");
const { decrementQuoteCount } = require("../Utils/Quote/quoteCounter");
const { ROLE_MULTIPLIERS } = require("../Services/Community/expService");
const { AvatarPrivacy, BannerPrivacy, } = require("../Schemas/Community/communitySchemas");
const IDs = require("../Utils/Config/ids");
const { getGuildMemberCached, getUserCached, getGuildChannelCached, } = require("../Utils/Interaction/interactionEntityCache");
const { applyDepexOneLevel } = require("../Services/Staff/staffWarnService");
const { sendPexDepexLog } = require("../Events/interaction/resocontoHandlers");
const { checkButtonPermission, checkStringSelectPermission, buildGlobalPermissionDeniedEmbed, buildGlobalNotYourControlEmbed, } = require("../Utils/Moderation/commandPermissions");
const DIVIDER_URL = "https://cdn.discordapp.com/attachments/1467927329140641936/1467927368034422959/image.png?ex=69876f65&is=69861de5&hm=02f439283952389d1b23bb2793b6d57d0f8e6518e5a209cb9e84e625075627db";
const PRIVATE_FLAG = 1 << 6;
const MONO_GUILD_DENIED_TEXT = "Questo bot è utilizzabile solo sul server principale di Vinili & Caff?.";

async function handleStaffButtons(interaction) {
  if (!interaction.isButton()) return false;

  if (interaction.customId && interaction.customId.startsWith("staff_warn_depex:")) {
    const parts = String(interaction.customId).split(":");
    const userId = parts[1];
    const choice = parts[2];
    if (!userId || !/^\d{16,20}$/.test(userId) || !["yes", "no"].includes(choice)) return false;
    const hasHighStaff = interaction.member?.roles?.cache?.has?.(IDs.roles?.HighStaff);
    if (!hasHighStaff) {
      await interaction.reply({ content: "<a:VC_Alert:1448670089670037675> Solo l'High Staff può usare questo pulsante.", flags: PRIVATE_FLAG }).catch(() => null);
      return true;
    }
    const guild = interaction.guild;
    const member = await getGuildMemberCached(guild, userId);
    const targetUser = member?.user;
    if (choice === "no") {
      await interaction.update({
        content: "<:VC_OnlineStatus:1472011187569950751> Nessuna azione. Al **3° warn staff** scatterà il depex completo (ruolo + staff).",
        embeds: [],
        components: [],
      }).catch(() => null);
      return true;
    }
    if (!member) {
      await interaction.reply({ content: "<a:VC_Alert:1448670089670037675> Utente non trovato nel server.", flags: PRIVATE_FLAG }).catch(() => null);
      return true;
    }
    const result = await applyDepexOneLevel(guild, member);
    if (!result.ok) {
      await interaction.reply({ content: `<a:VC_Alert:1448670089670037675> ${result.reason || "Depex non applicato."}`, flags: PRIVATE_FLAG }).catch(() => null);
      return true;
    }
    const oldRoleId = result.roleRemoved;
    const newRoleId = result.newRole || (result.fullDepex ? String(IDs.roles?.Member || "") : "");
    await sendPexDepexLog(guild, "depex", targetUser, oldRoleId, newRoleId, "Depex da 2 warn staff (scelta High Staff).");
    await interaction.update({
      content: "<:vegacheckmark:1443666279058772028> Depex applicato (un livello in basso).",
      embeds: [],
      components: [],
    }).catch(() => null);
    return true;
  }

  if (interaction.customId == "sanzioni") {
    const embed = new EmbedBuilder().setImage(DIVIDER_URL).setColor("#6f4e37").setDescription(
      "<:reportmessage:1443670575376765130> Ogni staffer per sanzionare dovr\u00e0 __seguire__ <#1442569243626307634>, chi non lo far\u00e0 **ricever\u00e0** una __valutazione negativa__.\n\n" +
      "> <a:VC_Arrow:1448672967721615452> **__LIMITI SETTIMANALI SULLE SANZIONI__**\n" +
      "<:dot:1443660294596329582> Ogni <@&1442568901887000618> dovr\u00e0 __eseguire__ almeno: **`3 sanzioni`**\n" +
      "<:dot:1443660294596329582> Ogni <@&1442568897902678038> dovr\u00e0 __eseguire__ almeno: **`4 sanzioni`**\n" +
      "<:dot:1443660294596329582> Ogni <@&1442568896237277295> dovr\u00e0 __eseguire__ almeno: **`4 sanzioni`**\n\n" +
      "> Chi __rispetter\u00e0__ questi limiti ricever\u00e0 **una valutazione positiva**."
    );
    await interaction.reply({ embeds: [embed], flags: 1 << 6 }).catch(() => null);
    return true;
  }

  if (interaction.customId == "warnstaff") {
    const embed = new EmbedBuilder().setImage(DIVIDER_URL).setColor("#6f4e37").setDescription(
      "<:banhammer:1443651875441217639> I **warn staff** vengono __assegnati__ dopo **3 valutazioni negative**. Raggiunti i `2` **warn staff** si verr\u00e0 depexati al ruolo precedente. **__(Per i Mod sar\u00e0 depex completo)__**\n\n" +
      "> L'<@&1442568894349840435> pu\u00f2 decidere di graziare qualcuno al secondo warn, ma in caso di **terzo warn** lo staffer verr\u00e0 depexato **__completamente__**\n\n" +
      "<:attentionfromvega:1443651874032062505> I **warn staff** non possono essere __rimossi__. Il **reset** dei __warn staff__ avviene ogni **__6 mesi__**."
    );
    await interaction.reply({ embeds: [embed], flags: 1 << 6 }).catch(() => null);
    return true;
  }

  if (interaction.customId == "valutazioni") {
    const embed = new EmbedBuilder().setImage(DIVIDER_URL).setColor("#6f4e37").setDescription(
      "<a:1370everythingisstable:1444006799643508778> **__VALUTAZIONI POSITIVE__**\n" +
      "<a:questionexclaimanimated:1443660299994533960> Le **valutazioni positive** aumentano la possibilit\u00e0 di essere **pexati** e si possono **ottenere** generando un'__attivit\u00e0__ **superiore** a quella richiesta nei _limiti settimanali_ o facendo qualcosa per dare un **vantaggio** al __server__.\n\n" +
      "> Le **valutazioni positive** si possono **__scambiare__** per dei giorni in pi\u00f9 di **pausa**.\n\n" +
      "<a:laydowntorest:1444006796661358673> **__VALUTAZIONI NEGATIVE__**\n" +
      "> Le **valutazioni negative** diminuiscono la possibilit\u00e0 di essere **pexati** e si ottengono **non completando** i _limiti settimanali_ o facendo qualcosa di _nocivo_ per il **server**.\n\n" +
      "> Le **valutazioni negative** possono essere **__rimosse__** completando compiti extra assegnati dall'<@&1442568894349840435> o rinunciando ad almeno `3 o pi\u00f9 valutazioni positive` in base al motivo per cui \u00e8 stata assegnata la valutazione."
    );
    await interaction.reply({ embeds: [embed], flags: 1 << 6 }).catch(() => null);
    return true;
  }

  if (interaction.customId == "pause") {
    const embed = new EmbedBuilder().setImage(DIVIDER_URL).setColor("#6f4e37").setDescription(
      "<:Clock:1330530065133338685> Vinili & Caff\u00e8 presenta un **sistema** di **`pause`** _sofisticato_, infatti \u00e8 tutto __organizzato__ per **garantire** al meglio l'__attivit\u00e0__ del server.\n\n" +
      "> Per __richiedere__ una pausa basta scrivere nel canale <#1442569262689554444> usando il formato corretto.\n\n" +
      "<a:VC_Arrow:1448672967721615452> **__LIMITI__**\n" +
      "<a:loading:1443934440614264924> In un anno si possono chiedere __massimo__ **`60 giorni`** di pausa che si possono usufruire in __tutti__ i **12 mesi** dell'anno. Gli <@&1442568895251611924> avranno **__`5`__** giorni in pi\u00f9.\n\n" +
      "> Nei giorni **festivi** avrete anche dei giorni in pi\u00f9 **ulteriori** al __normale mese__:\n" +
      "<:dot:1443660294596329582> **24**, **25**, **26**, **31** __Dicembre__\n" +
      "<:dot:1443660294596329582> **1** Gennaio\n" +
      "<:dot:1443660294596329582> **Pasqua** e **Pasquetta**\n\n" +
      "> Naturalmente per **garantire** al meglio l'attivit\u00e0 del server ci sono dei __limiti__ di staffer che possono essere in pausa nello __stesso periodo__\n" +
      "<:dot:1443660294596329582> <@&1442568904311570555> <a:VC_Arrow:1448672967721615452> __Nessun limite__\n" +
      "<:dot:1443660294596329582> <@&1442568901887000618> <a:VC_Arrow:1448672967721615452> __3__ **staffer**\n" +
      "<:dot:1443660294596329582> <@&1442568897902678038> <a:VC_Arrow:1448672967721615452> __1__ **staffer**\n" +
      "<:dot:1443660294596329582> <@&1442568896237277295> <a:VC_Arrow:1448672967721615452> __1__ **staffer**\n" +
      "<:dot:1443660294596329582> <@&1442568893435478097> <a:VC_Arrow:1448672967721615452> __2__ **staffer**\n" +
      "<:dot:1443660294596329582> <@&1442568891875201066> <a:VC_Arrow:1448672967721615452> __1__ **staffer**\n" +
      "<:dot:1443660294596329582> <@&1442568889052430609> <a:VC_Arrow:1448672967721615452> __1__ **staffer**\n\n" +
      "<:attentionfromvega:1443651874032062505> Potrai chiedere __una pausa__ **ogni mese**. Se quest'ultima cade in `2` **__mesi diversi__**, verr\u00e0 contato il mese in cui viene **chiesta** la __pausa__, a patto che non superi i primi __`5` giorni__ dell'altro mese. Per chiedere un'altra pausa dovrai aspettare almeno **__`1 settimana`__**\n\n" +
      "<:infoglowingdot:1443660296823767110> Gli __`Helper`__ potranno richiedere una __pausa__ nella loro prima settimana **solo** per **__problemi personali__ o __familiari gravi__**. Se l'<@&1442568894349840435> viene a conoscenza di un **__falso__ motivo** per usare una pausa, **in qualsiasi circostanza**, si verr\u00e0 **__depexati__** all'**__istante__**.\n\n" +
      "> <:banhammer:1443651875441217639> Se l'<@&1442568894349840435> verr\u00e0 a conoscenza di uno **staffer** __in pausa__ ma **attivo** in un **altro server** nel periodo di tempo della pausa, **toglier\u00e0** la pausa e **sanzioner\u00e0** lo staffer."
    );
    await interaction.reply({ embeds: [embed], flags: 1 << 6 }).catch(() => null);
    return true;
  }

  if (interaction.customId == "limiti") {
    const embed = new EmbedBuilder().setImage(DIVIDER_URL).setColor("#6f4e37").setDescription(
      "<:infoglowingdot:1443660296823767110> I **`limiti settimanali`** sono dei **messaggi** e delle **ore vocali** che entro una __settimana__ si devono __raggiungere__.\n\n" +
      "> <:attentionfromvega:1443651874032062505> **Superare** i limiti di __poco__ potrebbe comportare un **depex**, mentre **superarli** di __tanto__ **__non garantisce__** un **pex**.\n\n" +
      "<a:VC_Arrow:1448672967721615452> <@&1442568904311570555>\n" +
      "<:VC_DoubleReply:1468713981152727120> **__400__** messaggi\n" +
      "<:VC_Reply:1468262952934314131> **__3.5h__** in vocale\n\n" +
      "<a:VC_Arrow:1448672967721615452> <@&1442568901887000618>\n" +
      "<:VC_DoubleReply:1468713981152727120> **__500__** messaggi\n" +
      "<:VC_Reply:1468262952934314131> **__5h__** in vocale\n\n" +
      "<a:VC_Arrow:1448672967721615452> <@&1442568897902678038>\n" +
      "<:VC_DoubleReply:1468713981152727120> **__500__** messaggi\n" +
      "<:VC_Reply:1468262952934314131> **__4.5h__** in vocale\n\n" +
      "<a:VC_Arrow:1448672967721615452> <@&1442568896237277295>\n" +
      "<:VC_DoubleReply:1468713981152727120> **__450__** messaggi\n" +
      "<:VC_Reply:1468262952934314131> **__4h__** in vocale\n\n" +
      "> <:attentionfromvega:1443651874032062505> Verr\u00e0 **valutato** anche il **modo** in cui questi __limiti__ vengono raggiunti, ovvero se lo **staffer** \u00e8 stato costante o no."
    );
    await interaction.reply({ embeds: [embed], flags: 1 << 6 }).catch(() => null);
    return true;
  }

  if (interaction.customId == "regolamento") {
    const embed = new EmbedBuilder().setImage(DIVIDER_URL).setColor("#6f4e37").setDescription(`<:dot:1443660294596329582> **Rispettare** le regole (<#1442569111119990887>) del server;

            <:dot:1443660294596329582> __Non__ **chiedere** pex _continuamente_;

            <:dot:1443660294596329582> __Non__ **istigare** o creare **flame** tra lo **\`staff\`** e gli **\`utenti\`**;

            <:dot:1443660294596329582> __Non__ **abusare** di potere, ad esempio **sanzionando** un __utente__ \`senza un vero motivo\`;

            <:dot:1443660294596329582> Se si è in una **vocale pubblica** da __mutati__ siete **obbligati** a scrivere in <#1442569130573303898>;

            <:dot:1443660294596329582> __Non__ **floodare**, **spammare** e **usare bot** per completare i **\`limiti settimanali testuali\`**

            <:dot:1443660294596329582> __Non__ passare la maggior parte del **tempo** nei **canali vocali privati**, poich? non vengono **conteggiati** al fine dei __limiti settimanali__

            <:dot:1443660294596329582> __Non__ **stare da soli** in una __vocale pubblica__ se in un'altra vi è già un altro **staffer** da solo. Inoltre, almeno uno dei due **deve** essere __smutato__`);
    await interaction.reply({ embeds: [embed], flags: 1 << 6 }).catch(() => null);
    return true;
  }

  if (interaction.customId == "generalimoderazione") {
    const embed = new EmbedBuilder().setImage(DIVIDER_URL).setColor("#6f4e37").setDescription(`<:rules:1443307208543703131> **__Regola \`1.1\`__**
                <:VC_Reply:1468262952934314131> Sanzione: **Ban**

                <:rules:1443307208543703131> **__Regola \`1.2\`__**
                <:VC_DoubleReply:1468713981152727120> 1° Sanzione: **Richiamo verbale**
                <:VC_Reply:1468262952934314131> 2° Sanzione: **Mute __2h__**

                <:rules:1443307208543703131> **__Regola \`1.3\`__**
                <:VC_DoubleReply:1468713981152727120> 1° Sanzione: **Richiamo verbale**
                <:VC_Reply:1468262952934314131> 2° Sanzione: **Mute __3h__**
                <:VC_Reply:1468262952934314131> 3° Sanzione: **Mute __6h__**
                <:VC_Reply:1468262952934314131> 4° Sanzione: **Mute __18h__**

                <:rules:1443307208543703131> **__Regola \`1.4\`__**
                <:VC_DoubleReply:1468713981152727120> 1° Sanzione: **Mute __12h__**
                <:VC_Reply:1468262952934314131> 2° Sanzione: **Ban**

                <:rules:1443307208543703131> **__Regola \`1.5\`__**
                <:VC_Reply:1468262952934314131> Sanzione: **Ban**`);
    await interaction.reply({ embeds: [embed], flags: 1 << 6 }).catch(() => null);
    return true;
  }

  if (interaction.customId == "testualimoderazione") {
    const embed = new EmbedBuilder().setImage(DIVIDER_URL).setColor("#6f4e37").setDescription(`<:rules:1443307208543703131> **__Regola \`2.1\`__**
                <:VC_DoubleReply:1468713981152727120> 1° Sanzione: **Mute __18h__**
                <:VC_Reply:1468262952934314131> 2° Sanzione: **Ban**

                <:rules:1443307208543703131> **__Regola \`2.2\`__**
                <:VC_DoubleReply:1468713981152727120> 1° Sanzione: **Richiamo verbale**
                <:VC_Reply:1468262952934314131> 2° Sanzione: **Warn**
                <:VC_Reply:1468262952934314131> 3° Sanzione: **Mute __12h__**
                <:VC_Reply:1468262952934314131> 4° Sanzione: **Mute __18h__**
                <:VC_Reply:1468262952934314131> 5° Sanzione: **Mute __24h__**
                <:VC_Reply:1468262952934314131> 6° Sanzione: **Ban**

                <:rules:1443307208543703131> **__Regola \`2.3\`__**
                <:VC_Reply:1468262952934314131> Sanzione: **Ban**

                <:rules:1443307208543703131> **__Regola \`2.4\`__**
                <:VC_DoubleReply:1468713981152727120> 1° Sanzione: **Richiamo verbale**
                <:VC_Reply:1468262952934314131> 2° Sanzione: **Warn**
                <:VC_Reply:1468262952934314131> 3° Sanzione: **Mute __6h__**
                <:VC_Reply:1468262952934314131> 4° Sanzione: **Mute __18h__**

                <:rules:1443307208543703131> **__Regola \`2.5\`__**
                <:VC_DoubleReply:1468713981152727120> 1° Sanzione: **Richiamo verbale**
                <:VC_Reply:1468262952934314131> 2° Sanzione: **Mute __2h__**`);
    await interaction.reply({ embeds: [embed], flags: 1 << 6 }).catch(() => null);
    return true;
  }

  if (interaction.customId == "vocalimoderazione") {
    const embed = new EmbedBuilder().setImage(DIVIDER_URL).setColor("#6f4e37").setDescription(`<:rules:1443307208543703131> **__Regola \`3.1\`__**
                <:VC_DoubleReply:1468713981152727120> 1° Sanzione: **Richiamo verbale**
                <:VC_Reply:1468262952934314131> 2° Sanzione: **Mute __16h__**
                <:VC_Reply:1468262952934314131> 3° Sanzione: **Ban**

                <:rules:1443307208543703131> **__Regola \`3.2\`__**
                <:VC_DoubleReply:1468713981152727120> 1° Sanzione: **Richiamo verbale**
                <:VC_Reply:1468262952934314131> 2° Sanzione: **Mute __12h__**
                <:VC_Reply:1468262952934314131> 3° Sanzione: **Mute __18h__**
                <:VC_Reply:1468262952934314131> 4° Sanzione: **Mute __24h__**
                <:VC_Reply:1468262952934314131> 5° Sanzione: **Ban**

                <:rules:1443307208543703131> **__Regola \`3.3\`__**
                <:VC_DoubleReply:1468713981152727120> 1° Sanzione: **Richiamo verbale**
                <:VC_Reply:1468262952934314131> 2° Sanzione: **Mute __6h__**
                <:VC_Reply:1468262952934314131> 3° Sanzione: **Mute __12h__**
                <:VC_Reply:1468262952934314131> 4° Sanzione: **Mute __24h__**
                <:VC_Reply:1468262952934314131> 5° Sanzione: **Mute __48h__**

                <:rules:1443307208543703131> **__Regola \`3.4\`__**
                <:VC_DoubleReply:1468713981152727120> 1° Sanzione: **Richiamo verbale**
                <:VC_Reply:1468262952934314131> 2° Sanzione: **Mute __3h__**
                <:VC_Reply:1468262952934314131> 3° Sanzione: **Mute __6h__**
                <:VC_Reply:1468262952934314131> 4° Sanzione: **Mute __12h__**
                <:VC_Reply:1468262952934314131> 5° Sanzione: **Ban**

                <:rules:1443307208543703131> **__Regola \`3.5\`__**
                <:VC_DoubleReply:1468713981152727120> 1° Sanzione: **Richiamo verbale**
                <:VC_Reply:1468262952934314131> 2° Sanzione: **Mute __3h__**
                <:VC_Reply:1468262952934314131> 3° Sanzione: **Mute __12h__**
                <:VC_Reply:1468262952934314131> 4° Sanzione: **Ban**

                <:rules:1443307208543703131> **__Regola \`3.6\`__**
                <:VC_DoubleReply:1468713981152727120> 1° Sanzione: **Richiamo verbale**
                <:VC_Reply:1468262952934314131> 2° Sanzione: **Mute __2h__**

                <:rules:1443307208543703131> **__Regola \`3.7\`__**
                <:VC_DoubleReply:1468713981152727120> 1° Sanzione: **Richiamo verbale**
                <:VC_Reply:1468262952934314131> 2° Sanzione: **Mute __4h__**
                <:VC_Reply:1468262952934314131> 3° Sanzione: **Mute __12h__**
                <:VC_Reply:1468262952934314131> 4° Sanzione: **Mute __18h__**
                <:VC_Reply:1468262952934314131> 5° Sanzione: **Ban**`);
    await interaction.reply({ embeds: [embed], flags: 1 << 6 }).catch(() => null);
    return true;
  }

  return false;
}

function buildDeniedEmbedFromGate(gate, kind) {
  let embed = null;
  if (gate.reason === "not_owner") embed = buildGlobalNotYourControlEmbed();
  if (gate.reason === "mono_guild") {
    embed = buildGlobalPermissionDeniedEmbed([], kind, MONO_GUILD_DENIED_TEXT);
  }
  if (!embed) {
    embed = buildGlobalPermissionDeniedEmbed(gate.requiredRoles || [], kind);
  }
  return embed;
}

async function enforceInteractionPermissions(interaction) {
  if (interaction.isButton && interaction.isButton()) {
    const gate = await checkButtonPermission(interaction);
    if (!gate.allowed) {
      const deniedEmbed = buildDeniedEmbedFromGate(gate, "bottone");
      await interaction
        .reply({ embeds: [deniedEmbed], flags: PRIVATE_FLAG })
        .catch(() => { });
      return false;
    }
  }

  if (interaction.isStringSelectMenu && interaction.isStringSelectMenu()) {
    const gate = await checkStringSelectPermission(interaction);
    if (!gate.allowed) {
      const deniedEmbed = buildDeniedEmbedFromGate(gate, "menu");
      await interaction
        .reply({ embeds: [deniedEmbed], flags: PRIVATE_FLAG })
        .catch(() => { });
      return false;
    }
  }

  return true;
}

async function resolveMentionLabel(interaction, userId) {
  let label = `<@${userId}>`;
  try {
    const member = await getGuildMemberCached(interaction.guild, userId);
    if (member) return `<@${member.user.id}>`;

    const user = await getUserCached(interaction.client, userId);
    if (user) label = `<@${user.id}>`;
  } catch { }
  return label;
}

async function sendPrivacyViewsLeaderboard(interaction, Model, title) {
  const guildId = interaction.guild.id;
  const top = await Model.find({ guildId }).sort({ views: -1 }).limit(10).lean().catch(() => []);

  const rankEmojis = ["<:VC_1:1444099819680563200>", "<:VC_2:1444099781864722535>", "<:VC_3:1444099746116534282>", "<:VC_4:1444099708292169740>", "<:VC_5:1444099671894134947>", "<:VC_6:1444099623714033838>", "<:VC_7:1444099572916945120>", "<:VC_8:1444099520500600998>", "<:VC_9:1444099441790554182>", "<:VC_10:1469357839066730627>",];

  const lines = [];
  let idx = 1;
  for (const entry of top) {
    const label = await resolveMentionLabel(interaction, entry.userId);
    const rank = rankEmojis[idx - 1] || `${idx}.`;
    lines.push(
      `${rank} ${label} <a:VC_Arrow:1448672967721615452> **${entry.views}** visualizzazioni`,
    );
    idx += 1;
  }

  const description = lines.length ? lines.join("\n") : "Nessuna visualizzazione registrata.";
  const time = new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", });
  const footerText = `Classifica richiesta da ${interaction.user.username} \u2022 Oggi alle ${time}`;

  const embed = new EmbedBuilder().setImage(DIVIDER_URL).setColor("#6f4e37").setTitle(title).setDescription(description).setFooter({ text: footerText, iconURL: interaction.user.displayAvatarURL(), });

  return interaction.reply({ embeds: [embed], flags: PRIVATE_FLAG });
}

module.exports = {
  name: Events.InteractionCreate,

  async execute(interaction) {
    if (!interaction.guild) return;
    if (!interaction.message) return;
    if (interaction.replied || interaction.deferred) return;
    const allowed = await enforceInteractionPermissions(interaction);
    if (!allowed) return;
    if (await handleStaffButtons(interaction)) return;
    if (interaction.isStringSelectMenu()) {
      const menuId = interaction.customId;
      const values = Array.isArray(interaction.values) ? interaction.values : [];
      const categories = { personality_pronouns: ["1442568997848743997", "1442568999043989565", "1442569000063074498", "1442569001367769210", "1442569002932109434",], personality_age: ["1442568993197265021", "1442568994581381170", "1442568995348807691", "1442568996774871194",], personality_region: ["1442569021861007443", "1442569023303974922", "1442569024486506498", "1442569025790939167",], personality_dm: ["1442569004215697438", "1442569005071077417", "1442569006543274126",], personality_relationship: ["1442569028173299732", "1442569029263818906",], personality_mentions: [IDs.roles.Events, IDs.roles.News, IDs.roles.Polls, IDs.roles.Bump, IDs.roles.Minigames, IDs.roles.Forum,], personality_colors_1: ["1442568958656905318", "1442568956832645212", "1442568961077153994", "1442568960016121998", "1442568963836874886", "1442568965040636019", "1442568967045648412", "1442568962167541760", "1442568968371048449", "1442568969528541225", "1442568970497687717", "1442568971357388912", "1442568972745838667", "1442568975966797926",], personality_colors_2: ["1442568976944201828", "1442568974486208634", "1442568977896439960", "1442568979473371258", "1442568980626673685", "1442568981792948304", "1442568982769959002", "1442568983898357954", "1442568985278156971", "1442568986720993350", "1442568987887276133", "1442568988961013821", "1442568989866725468", "1442568991150309578",], personality_colors_plus: [IDs.roles.redPlus, IDs.roles.orangePlus, IDs.roles.yellowPlus, IDs.roles.greenPlus, IDs.roles.bluePlus, IDs.roles.purplePlus, IDs.roles.pinkPlus, IDs.roles.blackPlus, IDs.roles.grayPlus, IDs.roles.whitePlus, IDs.roles.YinYangPlus,], };

      const roleIds = categories[menuId];
      if (!roleIds) return;
      const member = interaction.member;
      if (!member) return;

      try {
        if (!values.length || values.includes("remove")) {
          await member.roles.remove(roleIds).catch(() => { });
          const refreshedMember = await interaction.guild?.members?.fetch?.(interaction.user.id).catch(() => null);
          const stillHasManagedRole = Array.isArray(roleIds) && roleIds.some((roleId) => refreshedMember?.roles?.cache?.has?.(roleId));
          if (stillHasManagedRole) {
            return interaction.reply({
              content: "<:vegax:1443934876440068179> Impossibile aggiornare il ruolo.",
              flags: 1 << 6,
            });
          }
          return interaction.reply({
            content: "Ruoli rimossi correttamente.",
            flags: 1 << 6,
          });
        }
        if (menuId === "personality_colors_plus") {
          const hasEventWeek2 = interaction.guildId && interaction.user?.id && (await require("../Services/Community/activityEventRewardsService").hasEventWeekWinnerGrant(interaction.guildId, interaction.user.id, 2).catch(() => false));
          const allowed = member.roles.cache.has(IDs.roles.ServerBooster) || member.roles.cache.has(IDs.roles.Level50) || hasEventWeek2;
          if (!allowed) {
            return interaction.reply({
              content:
                "<:vegax:1443934876440068179> Non puoi selezionare i Colori PLUS. Servono i ruoli richiesti.",
              flags: 1 << 6,
            });
          }
        }
        await member.roles.remove(roleIds).catch(() => { });
        await member.roles.add(values).catch(() => { });
        const refreshedMember = await interaction.guild?.members?.fetch?.(interaction.user.id).catch(() => null);
        const appliedAll = values.every((roleId) => refreshedMember?.roles?.cache?.has?.(roleId));
        if (!appliedAll) {
          return interaction.reply({
            content: "<:vegax:1443934876440068179> Impossibile aggiornare il ruolo.",
            flags: 1 << 6,
          });
        }
        return interaction.reply({
          content: "Ruolo aggiornato correttamente.",
          flags: 1 << 6,
        });
      } catch {
        return interaction.reply({
          content:
            "<:vegax:1443934876440068179> Impossibile aggiornare il ruolo.",
          flags: 1 << 6,
        });
      }
    }
    if (!interaction.isButton()) return;

    if (
      interaction.customId &&
      interaction.customId.startsWith("avatar_unblock:")
    ) {
      const targetId = interaction.customId.split(":")[1] || "";
      if (!targetId) {
        return interaction.reply({
          content: "<:vegax:1443934876440068179> Link non valido.",
          flags: 1 << 6,
        }).catch(() => null);
      }
      if (interaction.user.id !== targetId) {
        return interaction.reply({
          content:
            "<:vegax:1443934876440068179> Non puoi sbloccare l'avatar di un altro utente.",
          flags: 1 << 6,
        }).catch(() => null);
      }
      try {
        await AvatarPrivacy.findOneAndUpdate(
          { guildId: interaction.guild.id, userId: targetId },
          {
            $set: { blocked: false },
            $setOnInsert: { guildId: interaction.guild.id, userId: targetId },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        );
      } catch { }
      const embed = new EmbedBuilder().setImage(DIVIDER_URL).setColor("#6f4e37").setTitle("Comando sbloccato").setDescription("Hai sbloccato con successo la visualizzazione del tuo avatar.",);
      return interaction.reply({ embeds: [embed] });
    }

    if (
      interaction.customId &&
      interaction.customId.startsWith("banner_unblock:")
    ) {
      const targetId = interaction.customId.split(":")[1] || "";
      if (!targetId) {
        return interaction.reply({
          content: "<:vegax:1443934876440068179> Link non valido.",
          flags: 1 << 6,
        }).catch(() => null);
      }
      if (interaction.user.id !== targetId) {
        return interaction.reply({
          content:
            "<:vegax:1443934876440068179> Non puoi sbloccare il banner di un altro utente.",
          flags: 1 << 6,
        }).catch(() => null);
      }
      try {
        await BannerPrivacy.findOneAndUpdate(
          { guildId: interaction.guild.id, userId: targetId },
          {
            $set: { blocked: false },
            $setOnInsert: { guildId: interaction.guild.id, userId: targetId },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        );
      } catch { }
      const embed = new EmbedBuilder().setImage(DIVIDER_URL).setColor("#6f4e37").setTitle("Comando sbloccato").setDescription("Hai sbloccato con successo la visualizzazione del tuo banner.",);
      return interaction.reply({ embeds: [embed] });
    }

    if (
      interaction.customId &&
      interaction.customId.startsWith("quote_remove:")
    ) {
      const parts = String(interaction.customId || "").split(":");
      if (!parts[1]) {
        return interaction.reply({
          content: "<:vegax:1443934876440068179> Link non valido.",
          flags: 1 << 6,
        }).catch(() => null);
      }
      const targetId = parts[1];
      const originChannelId = parts[2] || null;
      const originMessageId = parts[3] || null;
      if (interaction.user.id !== targetId) {
        const denied = new EmbedBuilder().setColor("#e74c3c").setTitle("<:vegax:1443934876440068179> Accesso negato").setDescription("Solo l'autore della citazione pu? rimuoverla.");
        return interaction.reply({ embeds: [denied], flags: 1 << 6 });
      }
      const now = new Date();
      const dateStr = now.toLocaleDateString("it-IT");
      const timeStr = now.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", });
      const removedEmbed = new EmbedBuilder().setImage(DIVIDER_URL).setColor("#6f4e37").setTitle("\u{1F5D1}\uFE0F Citazione rimossa").setDescription("Questa citazione \u00E8 stata rimossa dall'autore.").addFields({
        name: "Rimossa da", value: `<@${interaction.user.id}>`,
        inline: true,
      },
        {
          name: "Data rimozione",
          value: `${dateStr}${timeStr}`,
          inline: true,
        },
      )
        .setFooter({
          text: `Puoi bloccare le future quote tramite il comando \`+blockquotes\` \u2022 Oggi alle ${timeStr}`,
        });
      if (originChannelId && originMessageId && originMessageId !== "0") {
        const originChannel = interaction.guild?.channels?.cache?.get(originChannelId) || (await interaction.guild?.channels?.fetch(originChannelId).catch(() => null));
        if (originChannel?.isTextBased?.()) {
          const originMessage = await originChannel.messages.fetch(originMessageId).catch(() => null);
          if (originMessage) await originMessage.delete().catch(() => { });
        }
      }
      try {
        await decrementQuoteCount(interaction.guild?.id);
      } catch { }
      return interaction
        .update({ embeds: [removedEmbed], components: [], files: [] })
        .catch(async () => {
          await interaction
            .reply({ embeds: [removedEmbed], flags: 1 << 6 })
            .catch(() => { });
        });
    }

    if (interaction.customId == "metodi") {
      const embeds = [new EmbedBuilder().setImage(DIVIDER_URL).setColor("#6f4e37").setDescription(
        `<:Money:1330544713463500970> Per effettuare una sponsor con __Vinili & Caffè__ ci sono due modalità: **pagando** oppure esponendo una **collaborazione** in un <#${IDs.channels.ticket}> \`Terza Categoria\`.\n\n` +
        "<:dot:1443660294596329582> **€1,50** <a:VC_Arrow:1448672967721615452> sponsor per **2** settimane\n" +
        "<:dot:1443660294596329582> **€3** <a:VC_Arrow:1448672967721615452> sponsor per **1** mese\n" +
        "<:dot:1443660294596329582> **€5** <a:VC_Arrow:1448672967721615452> sponsor **lifetime**"
      ),];
      await interaction.reply({ embeds: [embeds[0]], flags: 1 << 6 }).catch(() => null);
    }
    if (interaction.customId == "ping") {
      const embeds = [new EmbedBuilder().setImage(DIVIDER_URL).setColor("#6f4e37").setDescription(
        "<:Discord_Mention:1329524304790028328> I **ping** variano in base al __numero__ di **membri** del server.\n\n" +
        "<:dot:1443660294596329582> Meno di **500** <a:VC_Arrow:1448672967721615452> `no ping`\n" +
        "<:dot:1443660294596329582> Tra i **500** e i **1000** <a:VC_Arrow:1448672967721615452> `ping @here`\n" +
        "<:dot:1443660294596329582> **1000+** <a:VC_Arrow:1448672967721615452> `ping @here & @everyone`"
      ),];
      await interaction.reply({ embeds: [embeds[0]], flags: 1 << 6 }).catch(() => null);
    }

    if (interaction.customId == "info_rules") {
      const commonEmbed = new EmbedBuilder().setImage(DIVIDER_URL).setColor("#6f4e37").setDescription("<:5751attentionfromvega:1443651874032062505> __Lo staff si riserva il diritto di cambiare sanzioni e regole in base alla situazione.__");
      const generalEmbed = new EmbedBuilder().setImage(DIVIDER_URL).setColor("#6f4e37").setDescription([
        "<:rules:1443307208543703131> **`REGOLA GENERALE 1.1`**",
        "<:VC_Reply:1468262952934314131> **Rispettare** i [__ToS__](https://discord.com/terms) e le [__Linee Guida__](https://discord.com/guidelines) di Discord.",
        "",
        "<:rules:1443307208543703131> **`REGOLA GENERALE 1.2`**",
        "<:VC_Reply:1468262952934314131> **Non discriminare nessuno**, non accettiamo nessuna forma di razzismo, fascismo, omofobia. È __vietato__ **scrivere** o **dire** la `f-word` e la `n-word`.",
        "",
        "<:rules:1443307208543703131> **`REGOLA GENERALE 1.3`**",
        "<:VC_Reply:1468262952934314131> **Rispettare** gli __utenti__ e lo __staff__ del server.",
        "",
        "<:rules:1443307208543703131> **`REGOLA GENERALE 1.4`**",
        "<:VC_Reply:1468262952934314131> È __vietato__ **auto-promuoversi**.",
        "",
        "<:rules:1443307208543703131> **`REGOLA GENERALE 1.5`**",
        "<:VC_Reply:1468262952934314131> È __vietato__ **uscire** e **rientrare** continuamente dal server.",
      ].join("\n"));
      const textEmbed = new EmbedBuilder().setImage(DIVIDER_URL).setColor("#6f4e37").setDescription([
        "<:rules:1443307208543703131> **`REGOLA TESTUALE 2.1`**",
        "<:VC_Reply:1468262952934314131> È __vietato__ inviare **file** **gore**, **NSFW** o **dati sensibili** di un utente.",
        "",
        "<:rules:1443307208543703131> **`REGOLA TESTUALE 2.2`**",
        "<:VC_Reply:1468262952934314131> È __vietato__ avere **comportamenti toxic** o **troll** che conducono al flame.",
        "",
        "<:rules:1443307208543703131> **`REGOLA TESTUALE 2.3`**",
        "<:VC_Reply:1468262952934314131> È __vietato__ inviare **link** contenenti virus, grabber, sponsor o social.",
        "",
        "<:rules:1443307208543703131> **`REGOLA TESTUALE 2.4`**",
        "<:VC_Reply:1468262952934314131> È __vietato__ inviare **flood** o **Wall Of Text** che intasano la chat.",
        "",
        "<:rules:1443307208543703131> **`REGOLA TESTUALE 2.5`**",
        "<:VC_Reply:1468262952934314131> È __vietato__ abusare di **parolacce**, **bestemmie** e ogni tipo di **insulto** a **divinità**.",
      ].join("\n"));
      const voiceEmbed = new EmbedBuilder().setImage(DIVIDER_URL).setColor("#6f4e37").setDescription([
        "<:rules:1443307208543703131> **`REGOLA VOCALE 3.1`**",
        "<:VC_Reply:1468262952934314131> È __vietato__ mostrare contenuti **gore**, **NSFW** o **dati sensibili** di un utente.",
        "",
        "<:rules:1443307208543703131> **`REGOLA VOCALE 3.2`**",
        "<:VC_Reply:1468262952934314131> È __vietato__ avere **comportamenti toxic** o **troll** che conducono al flame.",
        "",
        "<:rules:1443307208543703131> **`REGOLA VOCALE 3.3`**",
        "<:VC_Reply:1468262952934314131> È __vietato__ **disconnettere il bot** o cambiare musica mentre un utente sta ascoltando una canzone tramite il bot.",
        "",
        "<:rules:1443307208543703131> **`REGOLA VOCALE 3.4`**",
        "<:VC_Reply:1468262952934314131> È __vietato__ utilizzare **SoundBoard** o qualunque tipo di **VoiceChanger**.",
        "",
        "<:rules:1443307208543703131> **`REGOLA VOCALE 3.5`**",
        "<:VC_Reply:1468262952934314131> È __vietato__ **urlare** o fare **errori** col microfono.",
        "",
        "<:rules:1443307208543703131> **`REGOLA VOCALE 3.6`**",
        "<:VC_Reply:1468262952934314131> È __vietato__ abusare di **parolacce**, **bestemmie** e ogni tipo di **insulto** a **divinità**.",
        "",
        "<:rules:1443307208543703131> **`REGOLA VOCALE 3.7`**",
        "<:VC_Reply:1468262952934314131> È __vietato__ **uscire** e **rientrare** continuamente dalle vocali.",
      ].join("\n"));
      await interaction.reply({ embeds: [generalEmbed, textEmbed, voiceEmbed, commonEmbed], flags: 1 << 6 }).catch(() => null);
    }

    if (interaction.customId == "info_donations") {
      const donations = new EmbedBuilder().setImage(DIVIDER_URL).setColor("#6f4e37").setAuthor({ name: "Supporta il server con l'acquisto di un VIP o una donazione!", iconURL: "https://emoji.gg/emoji/480166-coffee", }).setDescription([
        "Usiamo i soldi donati per portare eventi con premi migliori, come Discord Nitro o gift card, e per cercare collaborazioni interessanti per voi utenti.",
        "Le donazioni sono completamente volontarie e contribuiscono alla nostra crescita. In anticipo, grazie.",
        "",
        "**Vuoi acquistare direttamente tutti i vantaggi permanenti e differenti dal VIP?**",
        "`5,00 €`",
        "<:dot:1443660294596329582> Il ruolo <@&1442568916114346096> **permanente**",
        "<:dot:1443660294596329582> Possibilità di allegare link e immagini in chat",
        "<:dot:1443660294596329582> Possibilità di usare le soundboard di altri server",
        "<:dot:1443660294596329582> Possibilità di mandare sticker ed emoji di altri server",
        "<:dot:1443660294596329582> Bypass dei requisiti nei giveaway",
        "<:dot:1443660294596329582> Possibilità di cambiare il tuo nickname",
        "<:dot:1443660294596329582> Sblocchi i COLORI PLUS (gradienti) su <#1469429150669602961>",
        "<:dot:1443660294596329582> Sblocchi il comando `+quote`",
        "<:dot:1443660294596329582> X3 EXP boost",
      ].join("\n")).setImage(DIVIDER_URL);

      const vip = new EmbedBuilder().setImage(DIVIDER_URL).setColor("#6f4e37").setDescription([
        "**Vuoi sostenere il server?** Acquista il VIP e riscatta tutti i vantaggi che hai sbloccato qui nel server! <a:VC_HeartsBlue:1468686100045369404>",
        "",
        "ACQUISTA IL <@&1442568950805430312> <a:VC_HeartsPink:1468685897389052008>",
        "`10,00 €`",
        "",
        "<:sparkledred:1470064814502973591> Sbloccherai:",
        "<:dot:1443660294596329582> Permesso di allegare link e immagini in chat",
        "<:dot:1443660294596329582> Permesso di usare soundboard di altri server",
        "<:dot:1443660294596329582> Possibilità di mandare sticker ed emoji di altri server",
        "<:dot:1443660294596329582> Bypass dei requisiti nei giveaway",
        "<:dot:1443660294596329582> Possibilità di creare una vocale privata per te e i tuoi amici",
        "<:dot:1443660294596329582> Reazioni al messaggio quando vieni @menzionato in chat (max. 3 reazioni).",
        "<:dot:1443660294596329582> Potrai crearti un ruolo personalizzato con colore GRADIENTE scelto da te.",
        "<:dot:1443660294596329582> X4 EXP boost",
        "",
        "<:attentionfromvega:1443651874032062505> DISCLAIMER / I soldi non sono rimborsabili, essendo volontari.",
        "I vantaggi segnati con \"?\" vengono rimossi qualora l'utente violi il regolamento, porti un'immagine negativa al server o sia inattivo per mesi.",
      ].join("\n")).setImage(DIVIDER_URL);

      const ticket = new EmbedBuilder().setImage(DIVIDER_URL).setColor("#6f4e37").setTitle("Acquista ora!").setDescription("<:blueflash:1470064803157643468> Apri un ticket nella **terza categoria** su: <#1442569095068254219>.");
      await interaction.reply({ embeds: [donations, vip, ticket], flags: 1 << 6 }).catch(() => null);
    }

    if (interaction.customId == "info_sponsor") {
      const sponsorEmbed = new EmbedBuilder().setColor("#6f4e37").setDescription("<:pinnednew:1443670849990430750> **Vinili & Caffè** offre un servizio di __sponsor__ con dei **requisiti** da rispettare. Per fare una __sponsor__ bisognerà aprire un <#1442569095068254219> `Terza Categoria`.\n\n" + "> Ogni server che vorrà effettuare una **sponsor** dovrà rispettare questi 3 requisiti:\n" + "> <:dot:1443660294596329582> Rispettare i [**ToS di Discord**](https://discord.com/terms)\n" + "> <:dot:1443660294596329582> Rispettare le [**Linee Guida di Discord**](https://discord.com/guidelines)\n" + "> <:dot:1443660294596329582> Rispettare il [**Regolamento di Vinili & Caffè**](https://discord.com/channels/1329080093599076474/1442569111119990887)").setImage(DIVIDER_URL);
      const rowSponsor = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("metodi").setLabel("︲METODI").setEmoji("<:Money:1330544713463500970>").setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId("ping").setLabel("︲PING").setEmoji("<:Discord_Mention:1329524304790028328>").setStyle(ButtonStyle.Secondary));
      await interaction.reply({ embeds: [sponsorEmbed], components: [rowSponsor], flags: 1 << 6 }).catch(() => null);
    }

    if (interaction.customId == "info_tags") {
      const suggestionsMention = IDs.channels.suggestions ? "<#" + IDs.channels.suggestions + ">" : "<#1442569147559973094>";
      const tagsEmbed = new EmbedBuilder()
        .setColor("#6f4e37")
        .setTitle("<:VC_Firework:1470796227913322658> LE NOSTRE TAGS")
        .setDescription([
          "> Per prendere una di queste tag vi basterà entrare nel server dedicato e verificarvi <a:VC_HeartsBlue:1468686100045369404>",
          "",
          "<:VC_Luna1:1471613026158514246><:VC_Luna2:1471613140654489783><a:VC_Arrow:1448672967721615452> <https://discord.gg/E6vrm5zE6B>",
          "<:VC_Cash1:1471614972034547884><:VC_Cash2:1471615052435161162><a:VC_Arrow:1448672967721615452> <https://discord.gg/QnTN5P578g>",
          "<:VC_Porn1:1471615143434518661><:VC_Porn2:1471615225743675554><a:VC_Arrow:1448672967721615452> <https://discord.gg/WMuZ4EMAkc>",
          "<:VC_SixNine1:1471615411639292047><:VC_SixNine2:1471615623044796519><a:VC_Arrow:1448672967721615452> <https://discord.gg/uqUNS9f5m5>",
          "<:VC_Weed1:1471615705601282119><:VC_Weed2:1471615783615463467><a:VC_Arrow:1448672967721615452> <https://discord.gg/SzBwnxHXNv>",
          "<:VC_Figa1:1471615881929818328><:VC_Figa2:1471615955955355873><a:VC_Arrow:1448672967721615452> <https://discord.gg/z3EXtJwvQH>",
          "",
          "<:VC_Reply:1468262952934314131> _In costante aggiornamento, per consigliarne altre " + suggestionsMention + "_",
        ].join("\n"))
        .setImage(DIVIDER_URL);
      await interaction.reply({ embeds: [tagsEmbed], flags: 1 << 6 }).catch(() => null);
    }

    if (interaction.customId == "candidature_premi_partner") {
      const premiPartnerEmbed = new EmbedBuilder().setColor("#6f4e37").setDescription("<:partneredserverowner:1443651871125409812> **__Vinili & Caffè__** offre un servizio di __pagamento__ in base al numero di **partner** effettuate.\n> Per riscattare eventuali premi bisognerà aprire un <#1442569095068254219> **__`Terza Categoria`__**\n\n<:dot:1443660294596329582> **__`150`__** partner <a:vegarightarrow:1443673039156936837> **__2__ euro** <:paypal:1329524292446191676>\n<:dot:1443660294596329582> **__`175`__** partner <a:vegarightarrow:1443673039156936837> **__3__ euro** <:paypal:1329524292446191676> / **Nitro __Basic__** <:sparkles_nitro_basic:1330196488336310383>\n<:dot:1443660294596329582> **__`250`__** partner <a:vegarightarrow:1443673039156936837> **Nitro __Boost__** <:VC_NitroBoost:1448706966263435326>\n\n<a:flyingnitroboost:1443652205705170986> Naturalmente, in caso di riscatto del **Nitro __Boost__**, almeno un **boost** dovrà andare a **__Vinili & Caffè__**.").setImage(DIVIDER_URL);
      await interaction.reply({ embeds: [premiPartnerEmbed], flags: 1 << 6 }).catch(() => null);
    }

    const sendUpdatedView = async (payload) => { const msgFlags = interaction.message?.flags; const isEphemeralSource = Boolean((typeof msgFlags?.has === "function" && msgFlags.has(1 << 6)) || (typeof msgFlags?.bitfield === "number" && (msgFlags.bitfield & (1 << 6)) !== 0) || (typeof msgFlags === "number" && (msgFlags & (1 << 6)) !== 0),); if (isEphemeralSource) { return interaction.update(payload).catch(async () => { return interaction.reply({ ...payload, flags: 1 << 6 }).catch(() => { }); }); } return interaction.reply({ ...payload, flags: 1 << 6 }).catch(() => { }); }; if (interaction.customId == "info_verifica") {
      const verifyEmbed = new EmbedBuilder().setImage(DIVIDER_URL).setColor("#6f4e37").setTitle("<a:VC_Verified:1448687631109197978> **__Verificati per ottenere vantaggi unici__**").setDescription([
        `Per verificare il tuo profilo dovrai andare in <#${IDs.channels.ticket}> e selezionare la terza categoria`,
        "<:VC_Reply:1468262952934314131> successivamente, dovrete mandare una vostra foto in cui si vede bene il viso:",
        "con il vostro nickname scritto su un foglio cartaceo o altrimenti con il cellulare nella schermata del vostro profilo Discord",
        "",
        "<:sparkledred:1470064814502973591> Ruolo <@&1469040179799920801> o <@&1469040190730408018> con badge speciale",
        "<:moon:1470064812615667827> Permesso di allegare immagini e link in chat",
        "<:pinkstar:1470064804835229768> Permesso di scrivere in <#1470029899740873029>",
      ].join("\n"));

      await interaction.reply({ embeds: [verifyEmbed], flags: 1 << 6 }).catch(() => null);
    }

    const buildBoostLevelsPayload = () => {
      const boostEmbed = new EmbedBuilder().setImage(DIVIDER_URL).setColor("#6f4e37").setTitle("<a:VC_HeartWhite:1448673535253024860> **__Potenzia il server e sblocca vantaggi unici__**").setDescription([
        "Un modo per sostenere il server è potenziarlo: se hai un Nitro Boost (quello da 9,99€) hai a disposizione 2 potenziamenti che puoi utilizzare in qualunque server tu voglia. Se deciderai di potenziare noi, __Vinili & Caffè__, sbloccherai un sacco di vantaggi.",
        "**Non sai cos'è Discord Nitro?** <:link:1470064815899803668> [Scoprilo qui](<https://discord.com/nitro>).",
        "",
        `<:sparkledred:1470064814502973591> Ruolo <@&${IDs.roles.ServerBooster}> con badge speciale`,
        "<:moon:1470064812615667827> Permesso di allegare immagini e link in chat",
        "<:pinkstar:1470064804835229768> Permesso di mandare emoji e adesivi di altri server",
        "<:sparkle:1470064801811140866> Permesso di usare le Soundboard del server",
        "<:blueflash:1470064803157643468> Possibilità di creare un **ruolo personalizzato** e una **vocale privata personalizzata**",
        "<a:reddiamond:1443652837346377841> Sblocchi il comando `+quote`",
        "<:exp:1470067108543987846> X2 EXP Boost",
      ].join("\n")).setImage(DIVIDER_URL);

      const howtoEmbed = new EmbedBuilder().setImage(DIVIDER_URL).setColor("#6f4e37").setTitle("<:nitroboost:1470064881674883326> **__Come creare ruolo personalizzato e vocale privata__**").setDescription([
        `Usa \`+customrole create\` in <#${IDs.channels.commands}> per creare e configurare il ruolo.`,
        "Poi usa \`+customvoc\` nello stesso canale per creare e configurare la vocale privata.",
        "Digita \`+help\` per la lista completa dei comandi.",
      ].join("\n"));

      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("info_levels").setLabel("︲INFO & VANTAGGI RUOLI").setEmoji("<:exp:1470067108543987846>").setStyle(ButtonStyle.Secondary),);

      return { embeds: [boostEmbed, howtoEmbed], components: [row] };
    };

    const buildLevelsPayload = () => {
      const levelEmbed = new EmbedBuilder().setImage(DIVIDER_URL).setColor("#6f4e37").setTitle("<:exp:1470067108543987846> **__Sali di livello e sblocca vantaggi sempre migliori__**").setDescription([
        "I livelli nel server rappresentano la tua attività: scrivendo in chat testuale e stando nei canali vocali, guadagnerai esperienza che verrà aggiunta al tuo livello globale.",
        "Una volta raggiunta una certa somma di esperienza, farai un **level up**!",
        "",
        `<:dot:1443660294596329582> Per __vedere i tuoi EXP__ e le tue statistiche, usa il comando \`+rank\` in <#${IDs.channels.commands}>.`,
        "",
        "<:VC_Dot:1443932948599668746> ──────── <:exp:1470067108543987846> ──────── <:VC_Dot:1443932948599668746>",
        "",
        "<a:VC_Arrow:1448672967721615452> **LISTA DEI LIVELLI:**",
      ].join("\n"))
        .addFields(
          {
            name: "\`LIVELLO 10-19\`",
            value: [
              `<@&${IDs.roles.Level10}>`,
              "<:VC_DoubleReply:1468713981152727120> Permesso di cambiare nickname",
              "<:VC_DoubleReply:1468713981152727120> Permesso di allegare link e immagini in chat",
              "<:VC_Reply:1468262952934314131> Sblocchi il comando \`+quote\`",
            ].join("\n"),
            inline: true,
          },
          {
            name: "\`LIVELLO 20-29\`",
            value: [
              `<@&${IDs.roles.Level20}>`,
              "Tutte le ricompense precedenti",
              "<:VC_DoubleReply:1468713981152727120> Possibilità di aggiungere reazioni ai messaggi in chat",
            ].join("\n"),
            inline: true,
          },
          {
            name: "\`LIVELLO 30-49\`",
            value: [
              `<@&${IDs.roles.Level30}>`,
              "Tutte le ricompense precedenti",
              "<:VC_DoubleReply:1468713981152727120> Permesso di usare soundboard di altri server",
              "<:VC_Reply:1468262952934314131> Cooldown sui comandi del nostro bot ridotto (da 30 secondi a 15 secondi).",
            ].join("\n"),
            inline: true,
          },
          {
            name: "\`LIVELLO 50-69\`",
            value: [
              `<@&${IDs.roles.Level50}>`,
              "Tutte le ricompense precedenti",
              `<:VC_DoubleReply:1468713981152727120> Possibilità di usare i **colori PLUS** su <#${IDs.channels.ruoliColori}>`,
              "<:VC_DoubleReply:1468713981152727120> Possibilità di creare un ruolo __personalizzato PERMANENTE__ e un canale vocale privato __personalizzato PERMANENTE__.",
              "<:VC_Reply:1468262952934314131> Cooldown sui comandi del nostro bot ridotto (da 30 secondi a 5 secondi).",
            ].join("\n"),
            inline: true,
          },
          {
            name: "\`LIVELLO 70-99\`",
            value: [
              `<@&${IDs.roles.Level70}>`,
              "Tutte le ricompense precedenti",
              "<:VC_DoubleReply:1468713981152727120> Permesso di usare sticker ed emoji di altri server",
              "<:VC_Reply:1468262952934314131> Aggiungi reazioni al messaggio quando ti @menzionano in chat (max. 3)",
            ].join("\n"),
            inline: true,
          },
          {
            name: "\`LIVELLO 100\`",
            value: [
              `<@&${IDs.roles.Level100}>`,
              "Tutte le ricompense precedenti",
              "<:VC_DoubleReply:1468713981152727120> Cooldown sui comandi del nostro bot ridotto (da 5 secondi a 1 secondo).",
              "<:VC_DoubleReply:1468713981152727120> Bypass requisiti per i giveaway",
              "<:VC_DoubleReply:1468713981152727120> Bypass requisiti per le candidature",
              "<:VC_Reply:1468262952934314131> Bonus EXP permanente +25%",
            ].join("\n"),
            inline: true,
          },
        )
        .setImage(DIVIDER_URL)
        .setFooter({ text: "Se esci dal server o cambi account, i livelli ti verranno tolti e NON rimessi." });

      const howtoEmbed = new EmbedBuilder().setImage(DIVIDER_URL).setColor("#6f4e37").setTitle("<:nitroboost:1470064881674883326> **__Come creare ruolo personalizzato e vocale privata__**").setDescription([
        `Usa \`+customrole create\` in <#${IDs.channels.commands}> per creare e configurare il ruolo.`,
        "Poi usa \`+customvoc\` nello stesso canale per creare e configurare la vocale privata.",
        "Digita \`+help\` per la lista completa dei comandi.",
      ].join("\n"));

      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel("︲COLORI VIP SBLOCCATI").setEmoji(`<:VC_Color:1470781368630775982>`).setStyle(ButtonStyle.Link).setURL("https://discord.com/channels/1329080093599076474/1469429150669602961/1469803395937472647",), new ButtonBuilder().setLabel("︲CANALE PER I COMANDI").setEmoji(`<:VC_Bot:1470780684233871428>`).setStyle(ButtonStyle.Link).setURL("https://discord.com/channels/1329080093599076474/1442569138114662490",), new ButtonBuilder().setCustomId("torna_indietro").setLabel("︲TORNAA INDIETRO").setEmoji("<a:vegaleftarrow:1462914743416131816>").setStyle(ButtonStyle.Primary),);

      return { embeds: [levelEmbed, howtoEmbed], components: [row] };
    };
    if (interaction.customId == "info_boost_levels") {
      return sendUpdatedView(buildBoostLevelsPayload());
    }
    if (
      interaction.customId == "info_levels" ||
      interaction.customId == "info_level"
    ) {
      return sendUpdatedView(buildLevelsPayload());
    }
    if (interaction.customId == "torna_indietro") {
      return sendUpdatedView(buildBoostLevelsPayload());
    }

    if (interaction.customId == "info_badges_roles") {
      const badgesEmbed = new EmbedBuilder().setImage(DIVIDER_URL).setColor("#6f4e37").setTitle("<:pinkstar:1470064804835229768>\u30FB**__Ottieni un ruolo speciale per il tuo profilo!__**",).setDescription(["I badge sono dei ruoli __aggiuntivi__ che ti permettono di sbloccare vantaggi e permessi all'interno del server. Possono essere ottenuti in diversi modi e tutti danno vantaggi diversi.", "", "<:VC_Dot:1443932948599668746> \u2500\u2500\u2500\u2500\u22C6\u22C5\u2606\u22C5\u22C6\u2500\u2500\u2500\u2500 \u0B68\u2661\u0B67 \u2500\u2500\u2500\u2500\u22C6\u22C5\u2606\u22C5\u22C6\u2500\u2500\u2500\u2500 \u0B68\u2661\u0B67 \u2500\u2500\u2500\u2500\u22C6\u22C5\u2606\u22C5\u22C6\u2500\u2500\u2500\u2500 <:VC_Dot:1443932948599668746>", "", "<a:VC_Arrow:1448672967721615452> **LISTA DEI BADGES:**",].join("\n"),).addFields({ name: "\`WEEKLY WINNERS\`", value: ["<@&1468674837957574757>/<@&1468674787399172208>", "Ottenibile arrivando primo per exp in messaggi o exp in vocale nella [classifica settimanale](<https://discord.com/channels/1329080093599076474/1470183921236049940>).", "\u096F Tutte le ricompense precedenti", "<:VC_DoubleReply:1468713981152727120> Ruolo esclusivo per 7 giorni.", "<:VC_Reply:1468262952934314131> Permesso di usare soundboard esterne",].join("\n"), inline: true, }, { name: "\`SUPPORTER\`", value: ["<@&1442568948271943721>", 'Ottenibile mettendo il testo ".gg/viniliecaffe" o "discord.gg/viniliecaffe" nello status del tuo profilo Discord!', "Nello stato, non nella bio; se viene tolto o se sei offline, non ti verranno assegnati i vantaggi.", "<:VC_DoubleReply:1468713981152727120> Permesso di allegare link e immagini in chat", "<:VC_Reply:1468262952934314131> Permesso di cambiare il tuo nickname",].join("\n"), inline: true, }, { name: "\`VOTER\`", value: ["<@&1468266342682722679>", "Ottenibile votando il server su [Discadia](<https://discadia.com/vote/viniliecaffe/>)", "<:VC_DoubleReply:1468713981152727120> EXP casuale da 100 a 250.", "<:VC_Reply:1468262952934314131> Ruolo esclusivo per 24 ore.",].join("\n"), inline: true, }, { name: "\`PROMOTER\`", value: ["<@&1469758545263198442>", "Ottenibile invitando 5 persone nel server, attraverso [custom link](<https://imgur.com/a/3wpDOVj>)", "<:VC_DoubleReply:1468713981152727120> Permesso di allegare link e immagini in chat", "<:VC_Reply:1468262952934314131> Permesso di cambiare il tuo nickname",].join("\n"), inline: true, }, { name: "\`PROPULSOR\`", value: ["<@&1474357579143577610>", "Ottenibile invitando 25 persone nel server, attraverso [custom link](<https://imgur.com/a/3wpDOVj>)", "\u096F Tutte le ricompense precedenti", "<:VC_DoubleReply:1468713981152727120> Inviare emoji e adesivi esterni", "<:VC_Reply:1468262952934314131> Aggiungi reazioni ai messaggi",].join("\n"), inline: true, }, { name: "\`CATALYST\`", value: ["<@&1474361806956007425>", "Ottenibile invitando 100 persone nel server, attraverso [custom link](<https://imgur.com/a/3wpDOVj>)", "\u096F Tutte le ricompense precedenti", "<:VC_Reply:1468262952934314131> Usare SoundBoard esterne nelle vocali",].join("\n"), inline: true, }, { name: "\`GUILDED\`", value: ["<@&1471955147692179497>", "Ottenibile mettendo una delle nostre <#1475223034057982184>", "\u096F Esclusivit\u00E0 del ruolo.",].join("\n"), inline: true, }, { name: "\`VETERANO\`", value: ["<@&1469073503025103113>", "Ottenibile stando nel server per almeno 1 mese", "\u096F Esclusivit\u00E0 del ruolo.",].join("\n"), inline: true, }, { name: "\`OG\`", value: ["<@&1469041493401534644>", "Ottenibile stando nel server per almeno 1 anno", "\u096F Esclusivit\u00E0 del ruolo.",].join("\n"), inline: true, },).setFooter({ text: "\u26A0\uFE0F \u25B8 Se dovessi uscire dal server o cambiare account perderai i tuoi badge e i vantaggi annessi.", });

      await interaction.reply({ embeds: [badgesEmbed], flags: 1 << 6 }).catch(() => null);
    }

    if (interaction.customId == "r_multiplier_info") {
      const entries = ROLE_MULTIPLIERS instanceof Map ? Array.from(ROLE_MULTIPLIERS.entries()) : Array.isArray(ROLE_MULTIPLIERS) ? ROLE_MULTIPLIERS : Object.entries(ROLE_MULTIPLIERS || {});

      const lines = entries.length ? entries.map(([roleId, multi]) => `<@&${roleId}><a:VC_Arrow:1448672967721615452>x${multi}`,
      )
        : ["Nessun moltiplicatore attivo."];

      const embed = new EmbedBuilder().setImage(DIVIDER_URL).setColor("#6f4e37").setTitle("<:VC_EXP:1468714279673925883> Informazioni sui moltiplicatori",).setDescription(["I moltiplicatori sono ruoli che ti consentono di avere un boost di exp sui messaggi in chat e minuti di vocale.", `I ruoli sono sbloccabili in diversi modi, scopri come nel canale: <#${IDs.channels.info}>`,
        "",
        "**Moltiplicatori attivi:**",
        ...lines,
        "",
        "**Nota sulla classifica settimanale:**",
        "Gli exp che determinano la classifica settimanale non vengono influenzati dai moltiplicatori per garantire parit? tra gli utenti.",
        "",
        "Puoi vedere la classifica settimanale con il comando \`+classifica\`",
      ].join("\n"),
      );

      await interaction.reply({ embeds: [embed], flags: 1 << 6 }).catch(() => null);
    }

    if (interaction.customId == "avatar_views") {
      return sendPrivacyViewsLeaderboard(
        interaction,
        AvatarPrivacy,
        "<a:VC_CrownYellow:1330194103564238930> Classifica Visualizzazioni Avatar",
      );
    }

    if (interaction.customId == "banner_views") {
      return sendPrivacyViewsLeaderboard(
        interaction,
        BannerPrivacy,
        "<a:VC_CrownYellow:1330194103564238930> Classifica Visualizzazioni Banner",
      );
    }
  },
};