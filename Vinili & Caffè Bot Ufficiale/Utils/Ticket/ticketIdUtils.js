const TicketCounter = require("../../Schemas/Ticket/ticketCounterSchema");

const TICKET_COUNTER_KEY = "global_ticket_id";

async function getNextTicketId() {
  const counter = await TicketCounter.findOneAndUpdate(
    { key: TICKET_COUNTER_KEY },
    { $inc: { value: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  return Number(counter?.value || 0);
}

module.exports = {
  getNextTicketId,
};
