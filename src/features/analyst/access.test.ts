import assert from "node:assert/strict";
import test from "node:test";
import { authenticateAnalystRequest } from "./access";

test("Analyst authentication rejects a request when no current user can be loaded", async () => {
  const user = await authenticateAnalystRequest(async () => {
    throw new Error("NO_AUTHENTICATED_USER");
  });
  assert.equal(user, null);
});

test("Analyst authentication returns only the established current user", async () => {
  const currentUser = { id: "user-1" };
  assert.equal(await authenticateAnalystRequest(async () => currentUser), currentUser);
});

