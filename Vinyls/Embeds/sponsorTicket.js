const { runSponsorTicketPanels } = require("./sponsorHelpers");

module.exports = { name: "sponsorTicket", order: 70, section: "embedWithButtons", run: runSponsorTicketPanels };