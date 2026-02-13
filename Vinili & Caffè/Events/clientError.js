module.exports = {
  name: 'error',
  async execute(error) {
    global.logger.error('[CLIENT ERROR]', error);
  }
};
