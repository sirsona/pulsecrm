// server/services/ussd/states/my_tickets.js
// const ticketsRepo = require("../../../repositories/tickets.repo");
const ticketsRepo = require("../../repositories/tickets.repo");

module.exports = async function myTickets({ phoneNumber }) {
  const tickets = await ticketsRepo.findOpenByPhone(phoneNumber);

  if (tickets.length === 0) {
    return {
      response: "END You have no open tickets. Dial again to file one.",
      nextState: "done",
      nextContext: {},
    };
  }

  const lines = tickets
    .map((t, i) => `${i + 1}. ${t.category || "Ticket"} - ${t.status}`)
    .slice(0, 4); // keep under 182 chars

  return {
    response: `END Your tickets:\n${lines.join("\n")}`,
    nextState: "done",
    nextContext: {},
  };
};
