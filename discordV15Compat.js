function installDiscordV15Compat() {
    const djs = require('discord.js');

    if (!djs.ButtonBuilder) {
        class ButtonBuilderCompat {
            constructor(data = {}) {
                this.data = {
                    type: 2,
                    style: data.style ?? djs.ButtonStyle.Secondary,
                    disabled: Boolean(data.disabled)
                };
                if (data.custom_id) this.data.custom_id = data.custom_id;
                if (data.url) this.data.url = data.url;
                if (data.label) this.data.label = data.label;
                if (data.emoji) this.data.emoji = data.emoji;
            }

            static from(component) {
                if (!component) return new ButtonBuilderCompat();
                if (typeof component.toJSON === 'function') {
                    return new ButtonBuilderCompat(component.toJSON());
                }
                return new ButtonBuilderCompat(component);
            }

            setCustomId(customId) {
                this.data.custom_id = customId;
                delete this.data.url;
                return this;
            }

            setURL(url) {
                this.data.url = url;
                delete this.data.custom_id;
                this.data.style = djs.ButtonStyle.Link;
                return this;
            }

            setLabel(label) {
                this.data.label = label;
                return this;
            }

            setStyle(style) {
                this.data.style = style;
                return this;
            }

            setEmoji(emoji) {
                this.data.emoji = emoji;
                return this;
            }

            setDisabled(disabled = true) {
                this.data.disabled = Boolean(disabled);
                return this;
            }

            toJSON() {
                return { ...this.data };
            }
        }

        djs.ButtonBuilder = ButtonBuilderCompat;
    }

    const embedProto = djs.EmbedBuilder?.prototype;
    if (!embedProto || embedProto._colorCompatPatched) return;

    const originalSetColor = embedProto.setColor;
    const originalToJSON = embedProto.toJSON;

    const normalizeColor = (color) => {
        if (typeof color === 'string') {
            const cleaned = color.trim().replace(/^#/, '');
            if (/^[0-9a-fA-F]{6}$/.test(cleaned)) {
                return parseInt(cleaned, 16);
            }
            try {
                return djs.resolveColor(color);
            } catch {
                return color;
            }
        }
        return color;
    };

    embedProto.setColor = function patchedSetColor(color) {
        return originalSetColor.call(this, normalizeColor(color));
    };

    embedProto.toJSON = function patchedToJSON(...args) {
        if (this?.data && typeof this.data.color === 'string') {
            this.data.color = normalizeColor(this.data.color);
        }
        return originalToJSON.apply(this, args);
    };

    embedProto._colorCompatPatched = true;
}

module.exports = {
    installDiscordV15Compat
};
