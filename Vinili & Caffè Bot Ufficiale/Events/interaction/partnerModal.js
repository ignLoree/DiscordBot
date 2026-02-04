const { EmbedBuilder} = require('discord.js');
const fetch = require('node-fetch');
const Staff = require('../../Schemas/Staff/staffSchema');

function extractInviteCode(text) {
    if (!text) return null;
    const patterns = [
        /discord\.gg\/([a-zA-Z0-9-]+)/i,
        /discord\.com\/invite\/([a-zA-Z0-9-]+)/i,
        /discordapp\.com\/invite\/([a-zA-Z0-9-]+)/i
    ];
    for (const pattern of patterns) {
        const match = String(text).match(pattern);
        if (match && match[1]) return match[1];
    }
    const fallback = String(text).match(/\b([a-zA-Z0-9-]{6,32})\b/);
    return fallback ? fallback[1] : null;
}

function extractServerNameFromDescription(description) {
    if (!description) return null;
    const cleaned = String(description)
        .replace(/\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/g, '$1')
        .replace(/https?:\/\/[^\s]+/g, '')
        .replace(/@everyone|@here/g, '')
        .trim();
    const lines = cleaned.split('\n').map(line => line.trim()).filter(Boolean);
    const labeled = lines.find(line => /server|nome/i.test(line) && /[:\-]/.test(line));
    const pickLine = labeled || lines[0];
    if (!pickLine) return null;
    const match = pickLine.match(/(?:server|nome)[^:]*[:\-]\s*(.+)$/i);
    const name = (match ? match[1] : pickLine).replace(/[`*_~>]/g, '').trim();
    return name || null;
}

function isValidServerName(name) {
    if (!name) return false;
    const trimmed = String(name).replace(/\s+/g, ' ').trim();
    if (!trimmed) return false;
    return /[\p{L}\p{N}]/u.test(trimmed);
}

async function handlePartnerModal(interaction) {
    if (!interaction.isModalSubmit() || !interaction.customId.startsWith('partnershipModal_')) return false;
    await interaction.deferReply().catch(() => { });
    if (!interaction.member.roles.cache.has('1442568905582317740')) {
        await interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setDescription('<:vegax:1443934876440068179> Non hai i permessi per fare partnership.')
                    .setColor('Red')
            ], flags: 1 << 6
        });
        return true;
    }
    const description = interaction.fields.getTextInputValue('serverDescription');
    const managerId = interaction.customId.split('_')[1];
    const PARTNER_BLACKLIST_ROLE = '1443252279477272647';
    if (!managerId) {
        await interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setColor('Red')
                    .setDescription('<:vegax:1443934876440068179> Errore interno: manager non trovato.')
            ], flags: 1 << 6
        });
        return true;
    }
    let managerMember = null;
    try {
        managerMember = await interaction.guild.members.fetch(managerId);
    } catch {
        managerMember = null;
    }
    if (managerMember && managerMember.roles?.cache?.has(PARTNER_BLACKLIST_ROLE)) {
        await interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setColor('#6f4e37')
                    .setDescription('Non puoi fare partner con questo manager poichè blacklistato!')
            ], flags: 1 << 6
        });
        return true;
    }
    const inviteCode = extractInviteCode(description);
    if (!inviteCode) {
        await interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setColor('Red')
                    .setDescription('<:vegax:1443934876440068179> Devi inserire un link di invito Discord valido.')
            ], flags: 1 << 6
        });
        return true;
    }
    let serverName = 'Server Sconosciuto';
    let serverIcon = null;
    let serverId = null;
    const inviteUrl = `https://discord.gg/${inviteCode}`;
    let inviteVerified = true;
    try {
        const res = await fetch(`https://discord.com/api/v10/invites/${inviteCode}?with_counts=true`);
        const data = await res.json();
        if (!data.guild) throw new Error('Invite invalid');
        serverName = data.guild.name;
        serverId = data.guild.id;
        serverIcon = data.guild.icon
            ? `https://cdn.discordapp.com/icons/${data.guild.id}/${data.guild.icon}.png`
            : null;
    } catch {
        inviteVerified = false;
        serverName = 'Server Sconosciuto';
    }
    if (!isValidServerName(serverName)) {
        serverName = 'Server Sconosciuto';
    }
    if (inviteCode.toLowerCase().includes('viniliecaffe')) {
        const embed = new EmbedBuilder()
            .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
            .setTitle(`**<:partneredserverowner:1443651871125409812> Partnership con ${serverName} da ${interaction.user.username}**`)
            .setDescription(`<:vegax:1443934876440068179> Non puoi fare partner con il tuo server`)
            .setFooter({ text: serverName, iconURL: serverIcon })
            .setColor('Red')
            .setTimestamp()
            .setThumbnail(interaction.guild.iconURL());
        await interaction.editReply({ embeds: [embed], flags: 1 << 6 });
        return true;
    }

    const filteredDescription = description
        .replace(/@everyone/g, '')
        .replace(/@here/g, '')
        .replace(/https?:\/\/(?!discord\.gg)[^\s]+/g, '');

    try {
        let staffDoc = await Staff.findOne({
            guildId: interaction.guild.id,
            userId: interaction.user.id
        });
        if (!staffDoc) {
            staffDoc = new Staff({
                guildId: interaction.guild.id,
                userId: interaction.user.id,
                partnerCount: 0,
                partnerActions: []
            });
        }

        staffDoc.partnerCount++;
        staffDoc.managerId = managerId;
        staffDoc.partnerActions.push({
            action: 'create',
            partner: serverName,
            invite: inviteUrl,
            managerId
        });

        await staffDoc.save();
        const totalPartners = staffDoc.partnerCount;
        const partnershipChannel = interaction.guild.channels.cache.get('1442569193470824448');

        const embed = new EmbedBuilder()
            .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
            .setTitle(`**<:partneredserverowner:1443651871125409812> __PARTNER EFFETTUATA__**`)
            .setDescription(
                `<a:ThankYou:1329504268369002507> Grazie per aver _effettuato_ una **partner** con \`${interaction.guild.name}\`
<:mariolevelup:1443679595084910634> Ora sei a **\`${totalPartners}\`** partner!
<:Money:1330544713463500970> Continua ad __effettuare__ partner per riscattare i **premi** in <#1442579412280410194>`
            )
            .setFooter({ text: `Partner effettuata con ${serverName}`, iconURL: serverIcon })
            .setColor('#6f4e37')
            .setTimestamp()
            .setThumbnail(interaction.guild.iconURL());

        if (partnershipChannel) {
            const parts = splitMessage(`${filteredDescription}\n\nPartner effettuata con **<@${managerId}>**`);
            for (const part of parts) {
                await partnershipChannel.send({ content: part });
            }
            await partnershipChannel.send({ embeds: [embed] });
        }

        const doneEmbed = new EmbedBuilder()
            .setDescription(`<:vegacheckmark:1443666279058772028> Partner inviata in ${partnershipChannel}`)
            .setColor('#6f4e37');
            
        await interaction.editReply({ embeds: [doneEmbed] });
    } catch (err) {
        global.logger.error(err);
        await interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setColor('#e74c3c')
                    .setDescription(`<:vegax:1443934876440068179> C'è stato un errore nell'esecuzione del comando.`)
            ], flags: 1 << 6
        });
    }
    return true;
}
function splitMessage(message, maxLength = 2000) {
    if (!message) return [''];
    const parts = [];
    let current = '';
    for (const line of message.split('\n')) {
        const next = current ? `${current}\n${line}` : line;
        if (next.length > maxLength) {
            if (current) {
                parts.push(current);
                current = '';
            }
            if (line.length > maxLength) {
                for (let i = 0; i < line.length; i += maxLength) {
                    parts.push(line.slice(i, i + maxLength));
                }
            } else {
                current = line;
            }
        } else {
            current = next;
        }
    }
    if (current) parts.push(current);
    return parts;
}

module.exports = { handlePartnerModal };
