// states/confirmBooking.js
module.exports = function confirmBooking(input, context) {
  if (input === "1") {
    // Future: create a ride row and send notifications.
    return {
      response: `END Ride booked: ${context.pickup} -> ${context.dropoff}. You will receive an SMS shortly.`,
      nextState: "done",
      nextContext: {},
    };
  }

  if (input === "2") {
    return {
      response: "END Cancelled. Dial again to try anew.",
      nextState: "done",
      nextContext: {},
    };
  }

  return {
    response: `CON Invalid. Confirm ${context.pickup} -> ${context.dropoff}?\n1. Yes\n2. No`,
    nextState: "confirm_booking",
    nextContext: context,
  };
};
