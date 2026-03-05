const ids = require("./ids");

const backupInfo = require("./backup/backupInfo");
const backupList = require("./backup/backupList");
const backupLoad = require("./backup/backupLoad");

const topChannelComponents = require("./topChannel/components");
const topChannel = require("./topChannel/topChannel");
const topChannelPage = require("./topChannel/topChannelPage");
const topChannelSelect = require("./topChannel/topChannelSelect");

const me = require("./stats/me");
const server = require("./stats/server");
const user = require("./stats/user");

const eventoClassifica = require("./eventi/eventoClassifica");

const backup = {
  backupInfo,
  backupList,
  backupLoad,
};

const topChannelModule = {
  components: topChannelComponents,
  topChannel,
  topChannelPage,
  topChannelSelect,
};

const stats = {
  me,
  server,
  user,
};

const eventi = {
  eventoClassifica,
};

const catalog = [
  { name: backupInfo.name, label: backupInfo.label, description: backupInfo.description, order: backupInfo.order, module: "backup" },
  { name: backupList.name, label: backupList.label, description: backupList.description, order: backupList.order, module: "backup" },
  { name: backupLoad.name, label: backupLoad.label, description: backupLoad.description, order: backupLoad.order, module: "backup" },
  { name: topChannel.name, label: topChannel.label, description: topChannel.description, order: topChannel.order, module: "topChannel" },
  { name: topChannelPage.name, label: topChannelPage.label, description: topChannelPage.description, order: topChannelPage.order, module: "topChannel" },
  { name: topChannelSelect.name, label: topChannelSelect.label, description: topChannelSelect.description, order: topChannelSelect.order, module: "topChannel" },
  { name: me.name, label: me.label, description: me.description, order: me.order, module: "stats" },
  { name: server.name, label: server.label, description: server.description, order: server.order, module: "stats" },
  { name: user.name, label: user.label, description: user.description, order: user.order, module: "stats" },
  { name: eventoClassifica.name, label: eventoClassifica.label, description: eventoClassifica.description, order: eventoClassifica.order, module: "eventi" },
].sort((a, b) => a.order - b.order || String(a.name).localeCompare(String(b.name)));

module.exports = { ids, backup, topChannel: topChannelModule, stats, eventi, catalog, backupInfo, backupList, backupLoad, topChannelComponents, topChannel, topChannelPage, topChannelSelect, me, server, user, eventoClassifica };