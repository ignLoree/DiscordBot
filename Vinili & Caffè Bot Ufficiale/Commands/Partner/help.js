const { safeEditReply } = require('../../Utils/Moderation/interaction');
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Mostra la schermata help Partner Manager'),

    async execute(interaction) {
        await interaction.deferReply();
        return await safeEditReply(interaction, {
            embeds: [buildPartnerManagerEmbed()]
        });
    }
};

function buildPartnerManagerEmbed() {
    return new EmbedBuilder()
        .setDescription(`<:partnermanager:1443651916838998099> Questi sono i comandi che puoi usare da <@&1442568905582317740>:
                    
                    <:dot:1443660294596329582> \`!desc\` - Per inviare direttamente la descrizione (Solo ticket)
                    <:dot:1443660294596329582> \`/partnership\` - Per fare una partnership, bisogna inserire il manager (colui con cui state facendo la partner) e premere invio, nel riquadro inserire la descrzione e fare invia. (Solo ticket e <#1442569209849843823>)
                    <:dot:1443660294596329582> \`Partnership\` - Cliccando col tasto destro direttamente sul messaggio con la descrizione da mettere vi uscira "App > Partnership" il bot autocompilera il tutto e a voi bastera premere invio. (Solo ticket)
                    <:dot:1443660294596329582> \`/leaderboard\` - Per mostrare la classifica delle partnership (Sperimentale)
                    <:dot:1443660294596329582> \`/pausa request\` - Per chiedere una pausa all'High Staff. (In partner chat)
                    
                    <:attentionfromvega:1443651874032062505> Per segnalare un bug col bot apri un <#1442569095068254219> \`HIGH STAFF\``)
        .setColor('#6f4e37');
}
