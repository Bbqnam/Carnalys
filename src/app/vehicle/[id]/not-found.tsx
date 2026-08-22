import Link from "next/link";
import { uiCopy } from "@/features/search/copy";

export default function VehicleNotFound() {
  const copy = uiCopy.sv;

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-24 text-center">
      <h1 className="text-xl font-semibold text-ink">{copy.detail.notFoundTitle}</h1>
      <p className="mt-2 text-sm text-ink-muted">{copy.detail.notFoundBody}</p>
      <Link
        className="mt-6 inline-flex h-11 items-center rounded-xl border border-border bg-surface-subtle px-5 text-sm font-semibold text-ink transition hover:border-border-strong hover:bg-surface-muted"
        href="/"
      >
        {copy.detail.backToSearch}
      </Link>
    </div>
  );
}
