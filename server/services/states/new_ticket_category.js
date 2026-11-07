// // server/services/ussd/states/new_ticket_category.js
// const CATEGORIES = {
//   1: "billing",
//   2: "rider_complaint",
//   3: "lost_item",
//   4: "other",
// };

// module.exports = async function newTicketCategory({ input, context }) {
//   if (input === "0") {
//     return {
//       response:
//         "CON Jetlink Support\n1. My open tickets\n2. File a new ticket\n3. Call support",
//       nextState: "welcome",
//       nextContext: {},
//     };
//   }

//   const category = CATEGORIES[input];
//   if (!category) {
//     return {
//       response:
//         "CON Invalid. What is the issue about?\n1. Billing\n2. Rider complaint\n3. Lost item\n4. Other\n0. Back",
//       nextState: "new_ticket_category",
//       nextContext: context,
//     };
//   }

//   return {
//     response: "CON Type a short message (max 160 chars):",
//     nextState: "new_ticket_message",
//     // nextContext: { ...context, category },
//     extContext: { ...context, category, lang: currentLang },
//   };
// };
// server/services/ussd/states/new_ticket_message.js
const { t } = require("../ussd/i18n");
const session = require("../ussd/session"); // Needed to save the draft

module.exports = async function newTicketMessage({
  input,
  context,
  lang,
  phoneNumber,
}) {
  const currentLang = context.lang || lang || "en";

  // Validation: message must be at least 3 characters
  if (!input || input.length < 3) {
    return {
      response: `CON ${t(currentLang, "message_too_short")}\n${t(currentLang, "prompt_message")}`,
      nextState: "new_ticket_message",
      nextContext: context,
    };
  }

  // Trim to 160 characters (USSD safe)
  const truncated = input.slice(0, 160);

  // ✅ TASK 1: Save the draft to Redis so the user can resume if they hang up
  await session.saveDraft(phoneNumber, {
    stage: "message_entered",
    category: context.category,
    message: truncated,
  });

  // ✅ TASK 2: Use translated strings for the confirmation preview
  const excerpt = truncated.slice(0, 60);
  return {
    response: `CON ${t(currentLang, "confirm_prompt", excerpt)}`,
    nextState: "new_ticket_confirm",
    // ✅ CRITICAL: Pass the language forward so Swahili persists
    nextContext: { ...context, message: truncated, lang: currentLang },
  };
};
