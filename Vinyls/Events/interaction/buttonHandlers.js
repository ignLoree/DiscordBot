module.exports = {
  async handleButtonInteraction(interaction, client) {
    const isComponent = interaction?.isButton?.() || interaction?.isStringSelectMenu?.() || interaction?.isModalSubmit?.();
    if (!isComponent) {
      return false;
    }
    const handlers = client?.buttonHandlers;
    if (!Array.isArray(handlers) || handlers.length === 0) {
      return false;
    }
    for (const handler of handlers) {
      try {
        if (handler.match(interaction)) {
          const result = await handler.execute(interaction, client);
          return result === true;
        }
      } catch (error) {
        global.logger?.error?.(`[BUTTON_HANDLERS] ${handler.name} execute error:`, error);
      }
    }
    return false;
  },
};