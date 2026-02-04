const { safeEditReply } = require('../../Utils/Moderation/interaction');
const { EmbedBuilder, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const Staff = require('../../Schemas/Staff/staffSchema');
const { hasAnyRole } = require('../../Utils/Moderation/permissions');

module.exports = {
    staffRoleIdsBySubcommand: {
        request: ['1442568905582317740', '1442568910070349985'],
        accept: ['1442568894349840435']
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
                .addIntegerOption(option => option.setName('giorni_usati').setDescription('Giorni giÃ  usati').setRequired(true))
                .addIntegerOption(option => option.setName('giorni_aggiuntivi').setDescription('Giorni aggiuntivi').setRequired(true))
        ),
    async execute(interaction) {
        const sub = interaction.options.getSubcommand()
        await interaction.deferReply()
        const guildId = interaction.guild.id
        switch (sub) {
            case 'request': {
                const allowedRoles = ['1442568905582317740', '1442568910070349985'];
                const hasAllowedRole = hasAnyRole(interaction.member, allowedRoles);
                if (!hasAllowedRole && !interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
                    return await safeEditReply(interaction, {
                        embeds: [
                            new EmbedBuilder()
                                .setDescription('<:vegax:1443934876440068179> Non hai il permesso per fare questo comando!')
                                .setColor("Red")
                        ],
                        flags: 1 << 6
                    });
                }
                const userId = interaction.user.id;
                const dataRichiesta = interaction.options.getString('data_richiesta');
                const dataRitorno = interaction.options.getString('data_ritorno');
                const motivazione = interaction.options.getString('motivazione');
                const channel = interaction.guild.channels.cache.get('1442569285909217301');
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
                            .setDescription("<:vegacheckmark:1443666279058772028> La tua richiesta di pausa Ã¨ stata inviata all'High Staff")
                            .setColor('#6f4e37')
                    ],
                    flags: 1 << 6
                });
                await channel.send({
                    content: `<@&1442568894349840435> ${interaction.user} ha richiesto una pausa.\nData richiesta: ${dataRichiesta}\nData ritorno: ${dataRitorno}\nMotivo: ${motivazione}`
                });
            }
                break;
            case 'accept': {
                const allowedRoles = ['1442568894349840435'];
                const hasAllowedRole = hasAnyRole(interaction.member, allowedRoles);
                if (!hasAllowedRole && !interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
                    return await safeEditReply(interaction, {
                        embeds: [
                            new EmbedBuilder()
                                .setDescription('<:vegax:1443934876440068179> Non hai il permesso per fare questo comando!')
                                .setColor("Red")
                        ],
                        flags: 1 << 6
                    });
                }
                const staffer = interaction.options.getUser('staffer');
                const dataRichiesta = interaction.options.getString('data_richiesta');
                const dataRitorno = interaction.options.getString('data_ritorno');
                const ruolo = interaction.options.getRole('ruolo');
                const stafferInPausa = interaction.options.getInteger('staffer_in_pausa');
                const giorniUsati = interaction.options.getInteger('giorni_usati');
                const giorniAggiuntivi = interaction.options.getInteger('giorni_aggiuntivi');
                const channel = interaction.guild.channels.cache.get('1442569255315832945');
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
                    content: `<:Calendar:1330530097190404106> **\`${ruolo.name}\`** - **${staffer}** Ã¨ in **pausa**! 
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

