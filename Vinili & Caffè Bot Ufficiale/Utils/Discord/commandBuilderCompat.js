const {
    ChatInputCommandBuilder,
    ChatInputCommandSubcommandBuilder,
    ChatInputCommandSubcommandGroupBuilder
} = require('discord.js');

function wrapOptionCallback(cb) {
    if (typeof cb !== 'function') return cb;
    return (option) => {
        cb(option);
        return option;
    };
}

function patchSubcommandBuilder() {
    const proto = ChatInputCommandSubcommandBuilder?.prototype;
    if (!proto) return;

    if (!proto.addStringOption) proto.addStringOption = function (cb) { this.addStringOptions(wrapOptionCallback(cb)); return this; };
    if (!proto.addUserOption) proto.addUserOption = function (cb) { this.addUserOptions(wrapOptionCallback(cb)); return this; };
    if (!proto.addRoleOption) proto.addRoleOption = function (cb) { this.addRoleOptions(wrapOptionCallback(cb)); return this; };
    if (!proto.addChannelOption) proto.addChannelOption = function (cb) { this.addChannelOptions(wrapOptionCallback(cb)); return this; };
    if (!proto.addMentionableOption) proto.addMentionableOption = function (cb) { this.addMentionableOptions(wrapOptionCallback(cb)); return this; };
    if (!proto.addIntegerOption) proto.addIntegerOption = function (cb) { this.addIntegerOptions(wrapOptionCallback(cb)); return this; };
    if (!proto.addNumberOption) proto.addNumberOption = function (cb) { this.addNumberOptions(wrapOptionCallback(cb)); return this; };
    if (!proto.addBooleanOption) proto.addBooleanOption = function (cb) { this.addBooleanOptions(wrapOptionCallback(cb)); return this; };
    if (!proto.addAttachmentOption) proto.addAttachmentOption = function (cb) { this.addAttachmentOptions(wrapOptionCallback(cb)); return this; };
}

function patchSubcommandGroupBuilder() {
    const proto = ChatInputCommandSubcommandGroupBuilder?.prototype;
    if (!proto) return;

    if (!proto.addSubcommand) {
        proto.addSubcommand = function (cb) {
            this.addSubcommands((subcommand) => {
                if (typeof cb === 'function') cb(subcommand);
                return subcommand;
            });
            return this;
        };
    }
}

function patchChatInputBuilder() {
    const proto = ChatInputCommandBuilder?.prototype;
    if (!proto) return;

    if (!proto.addStringOption) proto.addStringOption = function (cb) { this.addStringOptions(wrapOptionCallback(cb)); return this; };
    if (!proto.addUserOption) proto.addUserOption = function (cb) { this.addUserOptions(wrapOptionCallback(cb)); return this; };
    if (!proto.addRoleOption) proto.addRoleOption = function (cb) { this.addRoleOptions(wrapOptionCallback(cb)); return this; };
    if (!proto.addChannelOption) proto.addChannelOption = function (cb) { this.addChannelOptions(wrapOptionCallback(cb)); return this; };
    if (!proto.addMentionableOption) proto.addMentionableOption = function (cb) { this.addMentionableOptions(wrapOptionCallback(cb)); return this; };
    if (!proto.addIntegerOption) proto.addIntegerOption = function (cb) { this.addIntegerOptions(wrapOptionCallback(cb)); return this; };
    if (!proto.addNumberOption) proto.addNumberOption = function (cb) { this.addNumberOptions(wrapOptionCallback(cb)); return this; };
    if (!proto.addBooleanOption) proto.addBooleanOption = function (cb) { this.addBooleanOptions(wrapOptionCallback(cb)); return this; };
    if (!proto.addAttachmentOption) proto.addAttachmentOption = function (cb) { this.addAttachmentOptions(wrapOptionCallback(cb)); return this; };

    if (!proto.addSubcommand) {
        proto.addSubcommand = function (cb) {
            this.addSubcommands((subcommand) => {
                if (typeof cb === 'function') cb(subcommand);
                return subcommand;
            });
            return this;
        };
    }

    if (!proto.addSubcommandGroup) {
        proto.addSubcommandGroup = function (cb) {
            this.addSubcommandGroups((group) => {
                if (typeof cb === 'function') cb(group);
                return group;
            });
            return this;
        };
    }

    if (!proto.setDMPermission) {
        // v15-dev removed this API from builders; keep old code working.
        proto.setDMPermission = function () { return this; };
    }
}

function installCommandBuilderCompat() {
    patchSubcommandBuilder();
    patchSubcommandGroupBuilder();
    patchChatInputBuilder();
}

module.exports = {
    installCommandBuilderCompat
};
