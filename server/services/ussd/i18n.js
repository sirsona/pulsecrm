// server/services/ussd/i18n.js
const STRINGS = {
  en: {
    welcome_title: "Jetlink Support",
    welcome_menu:
      "1. My open tickets\n2. File a new ticket\n3. Call support\n4. Kiswahili",
    invalid: "Invalid option.",
    back: "0. Back",
    generic_error: "Something went wrong. Please try again.",
    ticket_filed: (id) => `Ticket #${id} filed. You will get an SMS shortly.`,
    no_tickets: "You have no open tickets. Dial again to file one.",
    call_support: "Call +254712000000 or dial again.",
    prompt_category:
      "What is the issue about?\n1. Billing\n2. Rider complaint\n3. Lost item\n4. Other",
    prompt_message: "Type a short message (3-160 chars):",
    message_too_short: "Message too short.",
    confirm_prompt: (excerpt) =>
      `Confirm? "${excerpt}..."\n1. Yes, submit\n2. Re-type`,
  },
  sw: {
    welcome_title: "Jetlink Msaada",
    welcome_menu: "1. Tiketi zangu\n2. Ripoti tatizo\n3. Piga simu\n4. English",
    invalid: "Chaguo batili.",
    back: "0. Rudi",
    generic_error: "Tatizo limetokea. Jaribu tena.",
    ticket_filed: (id) => `Tiketi #${id} imepokelewa. Utapata SMS.`,
    no_tickets: "Huna tiketi. Piga tena kuripoti.",
    call_support: "Piga +254712000000 au jaribu tena.",
    prompt_category:
      "Tatizo ni kuhusu?\n1. Malipo\n2. Malalamiko ya dereva\n3. Kitu kilichopotea\n4. Mengine",
    prompt_message: "Andika ujumbe (3-160 herufi):",
    message_too_short: "Ujumbe ni mfupi sana.",
    confirm_prompt: (excerpt) =>
      `Thibitisha? "${excerpt}..."\n1. Ndio\n2. Andika upya`,
  },
};

function t(lang, key, ...args) {
  const bundle = STRINGS[lang] || STRINGS.en;
  const value = bundle[key] || STRINGS.en[key] || key;
  return typeof value === "function" ? value(...args) : value;
}

module.exports = { t };
