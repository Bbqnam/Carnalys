"use client";

export function DeleteRowButton({
  action,
  id,
  confirmMessage,
}: {
  action: (formData: FormData) => void;
  id: string;
  confirmMessage: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(confirmMessage)) event.preventDefault();
      }}
    >
      <input name="id" type="hidden" value={id} />
      <button
        className="rounded-lg px-2.5 py-1 text-xs font-semibold text-ink-muted transition hover:bg-negative-soft hover:text-negative"
        type="submit"
      >
        Delete
      </button>
    </form>
  );
}
