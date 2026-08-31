import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword, verifyPassword } from "./password";

test("password hashes are salted and verify only the original password", async () => {
  const first = await hashPassword("a useful password");
  const second = await hashPassword("a useful password");

  assert.notEqual(first, second);
  assert.equal(await verifyPassword("a useful password", first), true);
  assert.equal(await verifyPassword("a different password", first), false);
});

test("malformed password hashes fail closed", async () => {
  assert.equal(await verifyPassword("anything", "not-a-password-hash"), false);
});
