"use client";

export function ConfirmDeleteButton({
  children,
  className,
  message,
}: {
  children: React.ReactNode;
  className: string;
  message: string;
}) {
  return (
    <button
      className={className}
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
      type="submit"
    >
      {children}
    </button>
  );
}
