// server/services/ussd/states/new_ticket_message.js
module.exports = async function newTicketMessage({ input, context }) {
  if (!input || input.length < 3) {
    return {
      response: "CON Message too short. Type a short message (3-160 chars):",
      nextState: "new_ticket_message",
      nextContext: context,
    };
  }

  const truncated = input.slice(0, 160);
  return {
    response: `CON Confirm? "${truncated.slice(0, 60)}..."\n1. Yes, submit\n2. Re-type`,
    nextState: "new_ticket_confirm",
    nextContext: { ...context, message: truncated },
  };
};
