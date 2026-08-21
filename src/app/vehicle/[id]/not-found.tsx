import Link from "next/link";
import { uiCopy } from "@/features/search/copy";

export default function VehicleNotFound() {
  const copy = uiCopy.sv;

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-24 text-center">
      <h1 className="text-xl font-semibold text-[#19231d]">{copy.detail.notFoundTitle}</h1>
      <p className="mt-2 text-sm text-ink-muted">{copy.detail.notFoundBody}</p>
      <Link
        className="mt-6 inline-flex h-11 items-center rounded-xl border border-[#dfe2dc] bg-[#fbfcfa] px-5 text-sm font-semibold text-[#334139] transition hover:border-[#b9c5bb] hover:bg-[#f5f8f4]"
        href="/"
      >
        {copy.detail.backToSearch}
      </Link>
    </div>
  );
}
