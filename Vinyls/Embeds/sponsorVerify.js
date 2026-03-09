const { runSponsorVerifyPanels } = require("./sponsorHelpers");

module.exports = { name: "sponsorVerify", order: 60, section: "embedWithButtons", run: runSponsorVerifyPanels };