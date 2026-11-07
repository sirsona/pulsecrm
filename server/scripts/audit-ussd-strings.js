// scripts/audit-ussd-strings.js
const STRINGS = require("../server/services/ussd/i18n").STRINGS;
// (expose STRINGS from i18n.js for this audit)

for (const [lang, bundle] of Object.entries(STRINGS)) {
  for (const [key, value] of Object.entries(bundle)) {
    if (typeof value === "string" && value.length > 120) {
      console.warn(`${lang}.${key}: ${value.length} chars`);
    }
  }
}
