// // states/index.js

// const welcome = require("./welcome");
// const choosePickup = require("./choosePickup");
// const chooseDropoff = require("./chooseDropoff");
// const confirmBooking = require("./confirmBooking");

// module.exports = {
//   welcome,
//   choose_pickup: choosePickup,
//   choose_dropoff: chooseDropoff,
//   confirm_booking: confirmBooking,
// };
// server/services/states/index.js
module.exports = {
  welcome: require("./welcome"),
  my_tickets: require("./my_tickets"),
  new_ticket_category: require("./new_ticket_category"),
  new_ticket_message: require("./new_ticket_message"),
  new_ticket_confirm: require("./new_ticket_confirm"),
};
