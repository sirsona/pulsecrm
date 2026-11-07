// // server/services/ussd/states/welcome.js
// module.exports = async function welcome({ input, context }) {
//   if (input === "") {
//     return {
//       response:
//         "CON Jetlink Support\n1. My open tickets\n2. File a new ticket\n3. Call support",
//       nextState: "welcome",
//       nextContext: context,
//     };
//   }

//   if (input === "1") {
//     return {
//       response: "CON Loading your tickets...", // this is a dummy; my_tickets handles the first hit
//       nextState: "my_tickets",
//       nextContext: context,
//     };
//   }

//   if (input === "2") {
//     return {
//       response:
//         "CON What is the issue about?\n1. Billing\n2. Rider complaint\n3. Lost item\n4. Other\n0. Back",
//       nextState: "new_ticket_category",
//       nextContext: context,
//     };
//   }

//   if (input === "3") {
//     return {
//       response: "END Call +254712000000 or dial again. Asante.",
//       nextState: "done",
//       nextContext: {},
//     };
//   }

//   return {
//     response:
//       "CON Invalid. Jetlink Support\n1. My open tickets\n2. File a new ticket\n3. Call support",
//     nextState: "welcome",
//     nextContext: context,
//   };
// };
// server/services/ussd/states/welcome.js
// const { t } = require("../ussd/i18n");
// const session = require("../ussd/session"); // <--- ADD THIS LINE

// module.exports = async function welcome({ input, context, lang }) {
//   const currentLang = context.lang || lang || "en";

//   // if (input === "") {
//   //   return {
//   //     response: `CON ${t(currentLang, "welcome_title")}\n${t(currentLang, "welcome_menu")}`,
//   //     nextState: "welcome",
//   //     nextContext: { ...context, lang: currentLang },
//   //   };
//   // }
//   if (input === "") {
//     const draft = await session.getDraft(phoneNumber);
//     const menu = draft
//       ? `${t(currentLang, "welcome_menu")}\n5. Continue draft`
//       : t(currentLang, "welcome_menu");
//     return {
//       response: `CON ${t(currentLang, "welcome_title")}\n${menu}`,
//       nextState: "welcome",
//       nextContext: { ...context, lang: currentLang },
//     };
//   }

//   if (input === "4") {
//     // Language toggle
//     const newLang = currentLang === "en" ? "sw" : "en";
//     return {
//       response: `CON ${t(newLang, "welcome_title")}\n${t(newLang, "welcome_menu")}`,
//       nextState: "welcome",
//       nextContext: { ...context, lang: newLang },
//     };
//   }

//   if (input === "1") {
//     return {
//       response: `CON ...`, // see my_tickets; pass-through
//       nextState: "my_tickets",
//       nextContext: context,
//     };
//   }

//   if (input === "2") {
//     return {
//       response: `CON ${t(currentLang, "prompt_category")}\n${t(currentLang, "back")}`,
//       nextState: "new_ticket_category",
//       nextContext: context,
//     };
//   }

//   if (input === "3") {
//     return {
//       response: `END ${t(currentLang, "call_support")}`,
//       nextState: "done",
//       nextContext: {},
//     };
//   }

//   return {
//     response: `CON ${t(currentLang, "invalid")}\n${t(currentLang, "welcome_title")}\n${t(currentLang, "welcome_menu")}`,
//     nextState: "welcome",
//     nextContext: context,
//   };
// };
// server/services/ussd/states/welcome.js
const { t } = require("../ussd/i18n");
const session = require("../ussd/session");

// ✅ FIXED: Added phoneNumber to the arguments
module.exports = async function welcome({ input, context, lang, phoneNumber }) {
  const currentLang = context.lang || lang || "en";

  if (input === "") {
    // Use the phoneNumber passed into the function
    const draft = await session.getDraft(phoneNumber);
    const menu = draft
      ? `${t(currentLang, "welcome_menu")}\n5. Continue draft`
      : t(currentLang, "welcome_menu");
    return {
      response: `CON ${t(currentLang, "welcome_title")}\n${menu}`,
      nextState: "welcome",
      nextContext: { ...context, lang: currentLang },
    };
  }

  if (input === "4") {
    // Language toggle
    const newLang = currentLang === "en" ? "sw" : "en";
    return {
      response: `CON ${t(newLang, "welcome_title")}\n${t(newLang, "welcome_menu")}`,
      nextState: "welcome",
      nextContext: { ...context, lang: newLang },
    };
  }

  if (input === "1") {
    return {
      response: `CON ...`, // my_tickets handles the actual logic
      nextState: "my_tickets",
      nextContext: context,
    };
  }

  if (input === "2") {
    return {
      response: `CON ${t(currentLang, "prompt_category")}\n${t(currentLang, "back")}`,
      nextState: "new_ticket_category",
      nextContext: context,
    };
  }

  if (input === "3") {
    return {
      response: `END ${t(currentLang, "call_support")}`,
      nextState: "done",
      nextContext: {},
    };
  }

  return {
    response: `CON ${t(currentLang, "invalid")}\n${t(currentLang, "welcome_title")}\n${t(currentLang, "welcome_menu")}`,
    nextState: "welcome",
    nextContext: context,
  };
};
