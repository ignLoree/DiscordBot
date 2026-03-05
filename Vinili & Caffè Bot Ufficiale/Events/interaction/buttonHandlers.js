module.exports = {
  async handleButtonInteraction(interaction, client) {
    if (!interaction?.isButton?.() && !interaction?.isStringSelectMenu?.()) {
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