const test = require("node:test");
const assert = require("node:assert/strict");
const { _internals } = require("../api/ask-claude.js");

test("Lumen identifies the dataset as illustrative and requires safe remediation", () => {
  assert.match(_internals.LUMEN_SYSTEM, /illustrative sample data/i);
  assert.match(_internals.LUMEN_SYSTEM, /owner approval/i);
  assert.match(_internals.LUMEN_SYSTEM, /rollback/i);
  assert.match(_internals.LUMEN_SYSTEM, /verified savings/i);
  assert.doesNotMatch(_internals.LUMEN_SYSTEM, /never hedge/i);
});

test("rate-limit copy names Cloud Cost Guard", () => {
  assert.match(_internals.RATE_LIMIT_MESSAGE, /Cloud Cost Guard/);
  assert.doesNotMatch(_internals.RATE_LIMIT_MESSAGE, /Market Tape/);
});

test("message sanitizer caps content and normalizes roles", () => {
  const messages = _internals.sanitizeMessages([
    { role: "system", content: "x".repeat(2500) },
    { role: "assistant", content: "supported answer" },
    { role: "user", content: "   " },
  ]);
  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, "user");
  assert.equal(messages[0].content.length, 2000);
  assert.equal(messages[1].role, "assistant");
});
