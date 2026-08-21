import type { OwnershipCostCategory, OwnershipCostItem } from "./ownership-cost";

const categoryExplanations: Record<OwnershipCostCategory, string> = {
  depreciation: "Uppskattad värdeminskning per år baserat på pris och ålder.",
  insurance: "Uppskattad årlig försäkringskostnad.",
  maintenance: "Uppskattat underhåll och service per år.",
  energy: "Uppskattad drivmedels- eller elkostnad per år.",
  tax: "Uppskattad årlig fordonsskatt.",
};

/** Non-depreciation categories, as shares of each other (not of the total — see below). */
const remainderShares: Record<Exclude<OwnershipCostCategory, "depreciation">, number> = {
  energy: 0.2,
  insurance: 0.12,
  maintenance: 0.13,
  tax: 0.1,
};
const remainderShareSum = Object.values(remainderShares).reduce((sum, share) => sum + share, 0);
const remainderOrder = Object.keys(remainderShares) as (keyof typeof remainderShares)[];

/**
 * Older cars have already lost most of their value, so depreciation as a
 * percentage of the car's own asking price shrinks sharply with age —
 * without this, a fixed share of the (mostly flat-cost) total could exceed
 * what an old, cheap car is even worth.
 */
function depreciationRate(age: number) {
  if (age <= 1) return 0.18;
  if (age <= 3) return 0.14;
  if (age <= 6) return 0.1;
  if (age <= 10) return 0.06;
  if (age <= 15) return 0.03;
  return 0.015;
}

/**
 * Splits the already-computed total annual ownership cost into named
 * categories, so the UI can explain what makes up the number instead of
 * showing a single unexplained total. This is a heuristic decomposition,
 * not a real per-category estimate. Depreciation is computed against the
 * car's own price and age (capped at 60% of the total as a sanity ceiling);
 * the remaining categories split whatever's left. Items always sum exactly
 * to totalAnnualCost (insurance absorbs any rounding remainder).
 */
export function buildOwnershipCostItems({
  totalAnnualCost,
  askingPrice,
  age,
}: {
  totalAnnualCost: number;
  askingPrice: number;
  age: number;
}): OwnershipCostItem[] {
  const depreciationAmount = Math.round(
    Math.min(askingPrice * depreciationRate(age), totalAnnualCost * 0.6),
  );
  const remaining = totalAnnualCost - depreciationAmount;

  const items: OwnershipCostItem[] = [
    {
      category: "depreciation",
      annualCost: { amount: depreciationAmount, currency: "SEK" },
      explanation: categoryExplanations.depreciation,
    },
    ...remainderOrder.map((category) => ({
      category,
      annualCost: {
        amount: Math.round(remaining * (remainderShares[category] / remainderShareSum)),
        currency: "SEK" as const,
      },
      explanation: categoryExplanations[category],
    })),
  ];

  const roundedSum = items.reduce((sum, item) => sum + item.annualCost.amount, 0);
  const remainder = totalAnnualCost - roundedSum;
  const insuranceIndex = items.findIndex((item) => item.category === "insurance");
  items[insuranceIndex] = {
    ...items[insuranceIndex],
    annualCost: {
      ...items[insuranceIndex].annualCost,
      amount: items[insuranceIndex].annualCost.amount + remainder,
    },
  };

  return items;
}
