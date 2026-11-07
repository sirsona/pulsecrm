// states/choosePickup.js
const LOCATIONS = { 1: "Yaya", 2: "Valley Arcade", 3: "Sarit" };

module.exports = function choosePickup(input, context) {
  if (input === "0") {
    return {
      response: "CON Jetlink Boda\n1. Book a ride\n2. My rides\n3. Support",
      nextState: "welcome",
      nextContext: {},
    };
  }

  const pickup = LOCATIONS[input];
  if (!pickup) {
    return {
      response:
        "CON Invalid. Pick up from?\n1. Yaya\n2. Valley Arcade\n3. Sarit\n0. Back",
      nextState: "choose_pickup",
      nextContext: context,
    };
  }

  return {
    response: "CON Drop off at?\n1. Westgate\n2. Junction\n3. Sarit\n0. Back",
    nextState: "choose_dropoff",
    nextContext: { ...context, pickup },
  };
};
