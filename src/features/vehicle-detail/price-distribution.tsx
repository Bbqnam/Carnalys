import type { Locale } from "@/features/search/copy";

interface PriceDistributionProps {
  prices: readonly number[];
  targetPrice: number;
  marketValue: number;
  likelyRangeMinimum: number;
  likelyRangeMaximum: number;
  locale: Locale;
  comparableLabel: string;
  targetLabel: string;
}

export function PriceDistribution({
  prices,
  targetPrice,
  marketValue,
  likelyRangeMinimum,
  likelyRangeMaximum,
  locale,
  comparableLabel,
  targetLabel,
}: PriceDistributionProps) {
  if (prices.length === 0) return null;

  const targetTone =
    targetPrice <= likelyRangeMinimum
      ? "var(--positive)"
      : targetPrice >= likelyRangeMaximum
        ? "var(--negative)"
        : "var(--ink-muted)";
  const rawMinimum = Math.min(likelyRangeMinimum, marketValue, targetPrice);
  const rawMaximum = Math.max(likelyRangeMaximum, marketValue, targetPrice);
  const padding = Math.max((rawMaximum - rawMinimum) * 0.08, rawMaximum * 0.015, 1);
  const minimum = rawMinimum - padding;
  const maximum = rawMaximum + padding;
  const position = (price: number) => `${((price - minimum) / (maximum - minimum)) * 100}%`;
  const compact = (price: number) =>
    `${Math.round(price / 1000).toLocaleString(locale === "en" ? "en-SE" : "sv-SE")}k`;

  return (
    <div
      aria-label={`${prices.length} ${comparableLabel}. ${targetLabel}: ${targetPrice.toLocaleString(locale === "en" ? "en-SE" : "sv-SE")}.`}
      className="mt-4"
      role="img"
    >
      <div className="flex items-center justify-between text-[10px] font-medium tabular-nums text-ink-subtle">
        <span>{compact(likelyRangeMinimum)}</span>
        <span>{compact(likelyRangeMaximum)}</span>
      </div>
      <div className="relative mt-2 h-7">
        <div
          className="absolute inset-x-0 top-2 h-2 rounded-full"
          style={{
            background:
              "linear-gradient(90deg, var(--positive) 0%, #79b897 32%, var(--gold) 62%, #ed9b45 80%, var(--negative) 100%)",
          }}
        />
        <span
          className="absolute top-[3px] block size-4 -translate-x-1/2 rounded-full border-[3px] border-surface bg-positive shadow-sm"
          style={{ left: position(marketValue) }}
        />
        <span
          className="absolute top-[-5px] block h-8 w-px -translate-x-1/2 rounded-full"
          style={{ background: targetTone, left: position(targetPrice) }}
        >
          <span
            className="absolute -left-[4px] -top-px block size-[9px] rotate-45 rounded-[2px] border-2 border-surface shadow-sm"
            style={{ background: targetTone }}
          />
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-[10px] text-ink-subtle">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-positive" />
          {compact(marketValue)}
        </span>
        <span className="inline-flex items-center gap-1.5 font-medium" style={{ color: targetTone }}>
          <span className="relative h-3 w-2" aria-hidden="true">
            <span className="absolute left-1/2 top-0 h-3 w-px -translate-x-1/2" style={{ background: targetTone }} />
            <span className="absolute left-1/2 top-0 size-1.5 -translate-x-1/2 rotate-45 rounded-[1px]" style={{ background: targetTone }} />
          </span>
          {targetLabel}: {compact(targetPrice)}
        </span>
      </div>
    </div>
  );
}
