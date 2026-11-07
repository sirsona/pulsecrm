// // server/services/ussd/dispatcher.js
// const session = require("./session");
// const states = require("./states");
// // require("./states");

// async function run({ sessionId, phoneNumber, rawText }) {
//   const parts = rawText.split("*");
//   const latestInput = rawText === "" ? "" : parts[parts.length - 1];

//   const current = await session.get(sessionId);
//   const handlerName = current.state || "welcome";
//   const handler = states[handlerName] || states.welcome;

//   const result = await handler({
//     input: latestInput,
//     context: current.context,
//     phoneNumber,
//   });

//   if (result.response.startsWith("END")) {
//     await session.destroy(sessionId);
//     if (result.postSessionTask) {
//       // Fire and forget -- do not block the USSD reply.
//       result
//         .postSessionTask()
//         .catch((err) => console.error("post-session task failed:", err));
//     }
//   } else {
//     await session.set(sessionId, {
//       state: result.nextState,
//       context: result.nextContext,
//     });
//   }

//   return result.response;
// }

// module.exports = { run };
// server/services/ussd/dispatcher.js
const session = require("./session");
const states = require("./states");
const { t } = require("./i18n");

async function run({ sessionId, phoneNumber, rawText }) {
  try {
    const parts = rawText.split("*");
    const latestInput = rawText === "" ? "" : parts[parts.length - 1];

    const current = await session.get(sessionId);
    const lang = current.context?.lang || "en";

    const handlerName = current.state || "welcome";
    const handler = states[handlerName] || states.welcome;

    const result = await handler({
      input: latestInput,
      context: current.context,
      phoneNumber,
      lang,
    });

    if (result.response.startsWith("END")) {
      await session.destroy(sessionId);
      if (result.postSessionTask) {
        result
          .postSessionTask()
          .catch((err) => console.error("post-session task failed:", err));
      }
    } else {
      await session.set(sessionId, {
        state: result.nextState,
        context: result.nextContext,
      });
    }

    return clampResponse(result.response);
  } catch (err) {
    console.error("ussd dispatcher error:", err);
    await session.destroy(sessionId).catch(() => {});
    return `END ${t("en", "generic_error")}`;
  }
}

function clampResponse(response) {
  // USSD budget is around 182 characters; leave 2 chars of slack.
  if (response.length <= 180) return response;
  const prefix = response.startsWith("END") ? "END " : "CON ";
  const body = response.slice(prefix.length);
  return prefix + body.slice(0, 176 - prefix.length) + "...";
}

module.exports = { run };
