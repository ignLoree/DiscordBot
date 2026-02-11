const { safeEditReply } = require('../../Utils/Moderation/reply');
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const Staff = require('../../Schemas/Staff/staffSchema');
const IDs = require('../../Utils/Config/ids');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('partner')
        .setDescription('Modifica i punti partner dei PM')
        .addSubcommandGroup(subcommandGroup =>
            subcommandGroup
                .setName('modifypoint')
                .setDescription('Modifica i punti partner')
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('add')
                        .setDescription('Aggiungi punti a un PM')
                        .addIntegerOption(option =>
                            option.setName('amount')
                                .setDescription('Numero di punti da aggiungere')
                                .setRequired(true)
                        )
                        .addUserOption(option =>
                            option.setName('user')
                                .setDescription('PM a cui aggiungerli')
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('remove')
                        .setDescription('Rimuovi punti a un PM')
                        .addIntegerOption(option =>
                            option.setName('amount')
                                .setDescription('Numero di punti da rimuovere')
                                .setRequired(true)
                        )
                        .addUserOption(option =>
                            option.setName('user')
                                .setDescription('PM a cui toglierli')
                                .setRequired(true)
                        )
                        .addStringOption(option =>
                            option.setName('motivo')
                                .setDescription('Motivo del punto rimosso')
                                .setRequired(true)
                        )
                        .addStringOption(option =>
                            option.setName('linkmessaggio')
                                .setDescription('Aggiungi il link del messaggio')
                                .setRequired(true)
                        )
                )
        ),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand()
        await interaction.deferReply({ flags: 1 << 6 }).catch(() => {})
        const utentee = interaction.options.getUser('user')
        const value = interaction.options.getInteger('amount')
        const motivo = interaction.options.getString('motivo')
        const linkmessaggio = interaction.options.getString('linkmessaggio')
        const channel = interaction.guild.channels.cache.get(IDs.channels.puntiTolti)

        if (value < 0)
            return await safeEditReply(interaction, { content: '<:vegax:1443934876440068179> Il valore deve essere positivo.', flags: 1 << 6 });
        let staffData = await Staff.findOne({
            guildId: interaction.guild.id,
            userId: utentee.id
        });

        if (!staffData) {
            staffData = new Staff({
                guildId: interaction.guild.id,
                userId: utentee.id,
                partnerCount: 0
            });
        }

        if (typeof staffData.partnerCount !== "number") {
            staffData.partnerCount = 0;
        }

        if (sub === 'add') {
            staffData.partnerCount += value;
            await staffData.save();
            const embedAdd = new EmbedBuilder()
                .setColor('#6f4e37')
                .setDescription(
                    `<:vegacheckmark:1443666279058772028> **Successo**: Aggiunti \`${value}\` punti a <@${utentee.id}>. Totale Punti: \`${staffData.partnerCount}\``
                )
                .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL() })
                .setTimestamp();
            return await safeEditReply(interaction, { embeds: [embedAdd] });
        }

        if (sub === 'remove') {
            staffData.partnerCount = Math.max(0, staffData.partnerCount - value);
            await staffData.save();

            const embedRemove = new EmbedBuilder()
                .setColor('#6f4e37')
                .setDescription(
                    `<:vegacheckmark:1443666279058772028> **Successo**: Rimossi \`${value}\` punti a <@${utentee.id}>. Totale Punti: \`${staffData.partnerCount}\``
                )
                .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL() })
                .setTimestamp();

            if (channel) {
                await channel.send({
                    content: `
<:Discord_Mention:1329524304790028328> ${utentee}  
<:discordchannelwhite:1443308552536985810> ${motivo}
<:partneredserverowner:1443651871125409812> ${linkmessaggio}`
                });
            }

            return await safeEditReply(interaction, { embeds: [embedRemove] });
        }

        return await safeEditReply(interaction, {
            content: '<:vegax:1443934876440068179> Subcomando non valido.',
            flags: 1 << 6
        });
    }
}
