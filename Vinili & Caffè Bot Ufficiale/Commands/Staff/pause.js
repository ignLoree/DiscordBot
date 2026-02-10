const { safeEditReply } = require('../../Utils/Moderation/reply');
const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const Staff = require('../../Schemas/Staff/staffSchema');
const IDs = require('../../Utils/Config/ids');

module.exports = {
    staffRoleIdsBySubcommand: {
        request: [IDs.roles.partnerManager, IDs.roles.staff],
        accept: [IDs.roles.highStaff]
    },
    data: new SlashCommandBuilder()
        .setName('pausa')
        .setDescription('Gestione pause staffer')
        .addSubcommand(command =>
            command.setName('request')
                .setDescription('Richiedi una pausa')
                .addStringOption(option => option.setName('data_richiesta').setDescription('Data richiesta (GG/MM/AAAA)').setRequired(true))
                .addStringOption(option => option.setName('data_ritorno').setDescription('Data ritorno (GG/MM/AAAA)').setRequired(true))
                .addStringOption(option => option.setName('motivazione').setDescription('Motivo della pausa').setRequired(true))
        )
        .addSubcommand(command =>
            command.setName('accept')
                .setDescription('Assegna una pausa a uno staffer')
                .addUserOption(option => option.setName('staffer').setDescription('Staffer').setRequired(true))
                .addStringOption(option => option.setName('data_richiesta').setDescription('Data richiesta').setRequired(true))
                .addStringOption(option => option.setName('data_ritorno').setDescription('Data ritorno').setRequired(true))
                .addRoleOption(option => option.setName('ruolo').setDescription('Ruolo dello staffer').setRequired(true))
                .addIntegerOption(option => option.setName('staffer_in_pausa').setDescription('Staffer in pausa nello stesso ruolo').setRequired(true))
                .addIntegerOption(option => option.setName('giorni_usati').setDescription('Giorni già usati').setRequired(true))
                .addIntegerOption(option => option.setName('giorni_aggiuntivi').setDescription('Giorni aggiuntivi').setRequired(true))
        ),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand()
        await interaction.deferReply({ flags: 1 << 6 })
        const guildId = interaction.guild.id

        switch (sub) {
            case 'request': {
                const userId = interaction.user.id;
                const dataRichiesta = interaction.options.getString('data_richiesta');
                const dataRitorno = interaction.options.getString('data_ritorno');
                const motivazione = interaction.options.getString('motivazione');
                const channel = interaction.guild.channels.cache.get(IDs.channels.pauseRequestLog);
                let stafferDoc = await Staff.findOne({ guildId, userId });
                if (!stafferDoc) stafferDoc = new Staff({ guildId, userId });
                stafferDoc.pauses.push({
                    dataRichiesta,
                    dataRitorno,
                    motivazione,
                    status: 'pending'
                });
                await stafferDoc.save();
                await safeEditReply(interaction, {
                    embeds: [
                        new EmbedBuilder()
                            .setDescription("<:vegacheckmark:1443666279058772028> La tua richiesta di pausa è stata inviata all'High Staff")
                            .setColor('#6f4e37')
                    ],
                    flags: 1 << 6
                });
                await channel.send({
                    content: `<@&${IDs.roles.highStaff}> ${interaction.user} ha richiesto una pausa.\nData richiesta: ${dataRichiesta}\nData ritorno: ${dataRitorno}\nMotivo: ${motivazione}`
                });
            }
                break;
            case 'accept': {
                const staffer = interaction.options.getUser('staffer');
                const dataRichiesta = interaction.options.getString('data_richiesta');
                const dataRitorno = interaction.options.getString('data_ritorno');
                const ruolo = interaction.options.getRole('ruolo');
                const stafferInPausa = interaction.options.getInteger('staffer_in_pausa');
                const giorniUsati = interaction.options.getInteger('giorni_usati');
                const giorniAggiuntivi = interaction.options.getInteger('giorni_aggiuntivi');
                const channel = interaction.guild.channels.cache.get(IDs.channels.pauseAcceptedLog);
                let stafferRecord = await Staff.findOne({ guildId, userId: staffer.id });
                if (!stafferRecord) stafferRecord = new Staff({ guildId, userId: staffer.id });
                stafferRecord.pauses.push({
                    dataRichiesta,
                    dataRitorno,
                    ruolo: ruolo.name,
                    stafferInPausa,
                    giorniUsati,
                    giorniAggiuntivi,
                    status: 'accepted'
                });
                await stafferRecord.save();
                await channel.send({
                    content: `<:Calendar:1330530097190404106> **\`${ruolo.name}\`** - **${staffer}** è in **pausa**! 
<:Clock:1330530065133338685> Dal **\`${dataRichiesta}\`** al **\`${dataRitorno}\`**
<:pinnednew:1443670849990430750> __\`${giorniUsati}/60\`__ giorni utilizzati - __\`${stafferInPausa}\`__ staffer in pausa in quel ruolo`
                });
                await safeEditReply(interaction, {
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`<:vegacheckmark:1443666279058772028> Azione eseguita con successo da ${interaction.user.username}.`)
                            .setColor('#6f4e37')
                    ]
                })
                break;
            }
        }
    }
}

