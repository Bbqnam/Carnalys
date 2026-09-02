// Pure admin gate, deliberately free of "server-only" and request-context
// imports so it can be unit-tested and reused. `session.ts` re-exports it and
// supplies the real request-bound user; every admin-only page and server
// action funnels through this check before any market-control data or
// verification action is reachable.

export interface AdminGateUser {
  isAdmin: boolean;
}

export function assertAdmin<T extends AdminGateUser>(user: T | null | undefined): T {
  if (!user) throw new Error("AUTH_REQUIRED");
  if (!user.isAdmin) throw new Error("ADMIN_REQUIRED");
  return user;
}
