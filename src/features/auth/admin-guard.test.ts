import assert from "node:assert/strict";
import test from "node:test";
import { assertAdmin } from "./admin-guard";
import { isCronAuthorized } from "@/infrastructure/http/cron-authorization";

test("a signed-out visitor is rejected", () => {
  assert.throws(() => assertAdmin(null), /AUTH_REQUIRED/);
});

test("a normal signed-in user cannot pass the admin gate", () => {
  assert.throws(() => assertAdmin({ isAdmin: false, username: "alice" }), /ADMIN_REQUIRED/);
});

test("an administrator passes and is returned unchanged", () => {
  const admin = { isAdmin: true, username: "carnalys_admin" };
  assert.equal(assertAdmin(admin), admin);
});

test("the verification endpoint refuses calls without the cron secret", () => {
  const request = new Request("https://carnalys.vercel.app/api/verify-blocket");
  assert.equal(isCronAuthorized(request, undefined), false);
  assert.equal(isCronAuthorized(request, ""), false);
  assert.equal(isCronAuthorized(request, "s3cret"), false);
});

test("the verification endpoint accepts only the exact bearer token", () => {
  const request = new Request("https://carnalys.vercel.app/api/verify-blocket", {
    headers: { authorization: "Bearer s3cret" },
  });
  assert.equal(isCronAuthorized(request, "s3cret"), true);
  assert.equal(isCronAuthorized(request, "different"), false);
});
