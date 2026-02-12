const { scheduleMemberCounterRefresh } = require('../Utils/Community/memberCounterUtils');

module.exports = {
  name: 'guildBanAdd',
  async execute(ban) {
    try {
      const guild = ban?.guild;
      if (!guild) return;
      scheduleMemberCounterRefresh(guild, { delayMs: 450, secondPassMs: 2600 });
    } catch (error) {
      global.logger.error(error);
    }
  }
};
