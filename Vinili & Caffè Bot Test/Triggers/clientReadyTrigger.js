module.exports = {
  name: "clientReady",
  once: true,
  async execute(readyClient) {
    const tag = readyClient?.user?.tag || "unknown";
    global.logger.info(`[Bot Test][TRIGGER] clientReady fired for ${tag}`);
  },
};
