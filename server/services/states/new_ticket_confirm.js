const { t } = require("../ussd/i18n");
const ticketsRepo = require("../../repositories/tickets.repo");
const smsService = require("../sms.service");
const session = require("../ussd/session");

module.exports = async function newTicketConfirm({
  input,
  context,
  phoneNumber,
  lang,
}) {
  // 1. Determine the current language
  const currentLang = context.lang || lang || "en";

  // 2. Handle "Re-type" (Option 2)
  if (input === "2") {
    return {
      response: `CON ${t(currentLang, "prompt_message")}`,
      nextState: "new_ticket_message",
      // Remove the message so they can type a new one, but KEEP the language!
      nextContext: { ...context, message: undefined, lang: currentLang },
    };
  }

  // 3. Handle "Cancel" (if user picks 2 from the confirm screen root)
  if (input === "2") {
    await session.clearDraft(phoneNumber);

    return {
      response: `END ${t(currentLang, "cancelled")}`,
      nextState: "done",
      nextContext: {},
    };
  }

  // 4. Handle "Save" (Option 1)
  if (input === "1") {
    // Write the ticket to the database
    const ticket = await ticketsRepo.create({
      phone: phoneNumber,
      category: context.category,
      message: context.message,
    });

    await session.clearDraft(phoneNumber);

    const shortId = ticket.id.slice(0, 8);

    return {
      response: `END ${t(currentLang, "ticket_filed", shortId)}`,
      nextState: "done",
      nextContext: {},
      // Send SMS in the background (fire and forget)
      postSessionTask: async () => {
        await smsService.sendSMS(
          phoneNumber,
          `Jetlink: ticket #${shortId} received. Category: ${context.category}. An agent will contact you.`,
        );
      },
    };
  }

  // 5. Handle Invalid input (any other keypress)
  const excerpt = context.message ? context.message.slice(0, 60) : "";
  return {
    response: `CON ${t(currentLang, "confirm_prompt", excerpt)}\n1. ${t(currentLang, "yes_submit")}\n2. ${t(currentLang, "retype")}`,
    nextState: "new_ticket_confirm",
    nextContext: { ...context, lang: currentLang },
  };
};
