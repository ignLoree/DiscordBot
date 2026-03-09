const IDs = require("../Utils/Config/ids");
const { refreshStaffList } = require("../Utils/Community/staffListUtils");

async function run(client) {
  await refreshStaffList(client, IDs.guilds.main).catch((err) => {
    global.logger.error("[STAFF LIST] initial render failed:", err);
  });
}

module.exports = { name: "staffList", order: 100, section: "embedOnly", run };