"use client";

import { deleteUserAction } from "../actions";

export function DeleteUserButton({ userId, username }: { userId: string; username: string }) {
  return (
    <form
      action={deleteUserAction}
      onSubmit={(event) => {
        if (!window.confirm(`Delete ${username}? This removes their favorites, saved searches and sessions too. This can't be undone.`)) {
          event.preventDefault();
        }
      }}
    >
      <input name="userId" type="hidden" value={userId} />
      <button
        className="h-10 rounded-xl border border-negative/40 bg-negative-soft px-4 text-sm font-semibold text-negative transition hover:bg-negative/15"
        type="submit"
      >
        Delete this user
      </button>
    </form>
  );
}
