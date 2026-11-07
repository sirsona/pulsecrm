// states/chooseDropoff.js
const LOCATIONS = { 1: "Westgate", 2: "Junction", 3: "Sarit" };

module.exports = function chooseDropoff(input, context) {
  if (input === "0") {
    return {
      response:
        "CON Pick up from?\n1. Yaya\n2. Valley Arcade\n3. Sarit\n0. Back",
      nextState: "choose_pickup",
      nextContext: { ...context, pickup: undefined },
    };
  }

  const dropoff = LOCATIONS[input];
  if (!dropoff) {
    return {
      response:
        "CON Invalid. Drop off at?\n1. Westgate\n2. Junction\n3. Sarit\n0. Back",
      nextState: "choose_dropoff",
      nextContext: context,
    };
  }

  const { pickup } = context;
  return {
    response: `CON Confirm ${pickup} -> ${dropoff}?\n1. Yes\n2. No`,
    nextState: "confirm_booking",
    nextContext: { ...context, dropoff },
  };
};
