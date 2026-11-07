const { test } = require("node:test");
const assert = require("node:assert/strict");
const AppError = require("../utils/AppError");
const { t } = require("../services/ussd/i18n");

test("AppError carries its HTTP status and operation flag", () => {
  const error = new AppError("Not found", 404);
  assert.equal(error.message, "Not found");
  assert.equal(error.statusCode, 404);
  assert.equal(error.isOperation, true);
});

test("i18n resolves English strings by default", () => {
  assert.equal(t("en", "welcome_title"), "Jetlink Support");
  assert.match(t("unknown", "generic_error"), /Something went wrong/);
});

test("i18n formats dynamic messages", () => {
  assert.match(t("en", "ticket_filed", 42), /#42/);
  assert.equal(t("sw", "welcome_title"), "Jetlink Msaada");
});
