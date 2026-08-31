import assert from "node:assert/strict";
import test from "node:test";
import { enforceVerifiedPostgresSsl } from "./connection-string";

test("makes the current strong SSL behavior explicit", () => {
  assert.equal(
    enforceVerifiedPostgresSsl(
      "postgresql://user:secret@example.com/db?pool=true&sslmode=require",
    ),
    "postgresql://user:secret@example.com/db?pool=true&sslmode=verify-full",
  );
});

test("does not weaken or alter unrelated connection options", () => {
  assert.equal(
    enforceVerifiedPostgresSsl(
      "postgresql://user:secret@example.com/db?sslmode=verify-full&pool=true",
    ),
    "postgresql://user:secret@example.com/db?sslmode=verify-full&pool=true",
  );
  assert.equal(
    enforceVerifiedPostgresSsl("postgresql://user:secret@example.com/db"),
    "postgresql://user:secret@example.com/db",
  );
});
