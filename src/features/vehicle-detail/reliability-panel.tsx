import type { ReliabilityAssessment } from "@/domain/reliability";
import type { Locale } from "@/features/search/copy";
import { ExternalLinkIcon } from "@/features/search/icons";

const riskTone = {
  low: "border-positive/25 bg-positive-soft text-positive",
  moderate: "border-[#d6ad55]/35 bg-[#fff8e5] text-[#7a5b18]",
  high: "border-negative/25 bg-negative-soft text-negative",
} as const;

const severityTone = {
  watch: "bg-surface-muted text-ink-muted",
  important: "bg-[#fff8e5] text-[#7a5b18]",
  critical: "bg-negative-soft text-negative",
} as const;

export function ReliabilityPanel({
  assessment,
  locale,
}: {
  assessment: ReliabilityAssessment;
  locale: Locale;
}) {
  const en = locale === "en";
  const money = new Intl.NumberFormat(en ? "en-SE" : "sv-SE", {
    style: "currency",
    currency: "SEK",
    maximumFractionDigits: 0,
  });
  const riskLabel = {
    low: en ? "Lower known risk" : "Lägre känd risk",
    moderate: en ? "Some known risks" : "Vissa kända risker",
    high: en ? "Important known risks" : "Viktiga kända risker",
  }[assessment.riskLevel];
  const confidenceLabel = {
    low: en ? "Limited evidence" : "Begränsat underlag",
    medium: en ? "Moderate evidence" : "Måttligt underlag",
    high: en ? "Strong evidence" : "Starkt underlag",
  }[assessment.confidence];
  const scope = [
    `${assessment.appliesTo.modelYearFrom}–${assessment.appliesTo.modelYearTo}`,
    assessment.appliesTo.generation,
    assessment.appliesTo.fuelType,
    assessment.appliesTo.transmission,
    assessment.appliesTo.enginePattern,
  ].filter(Boolean);

  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle">
            {en ? "Reliability intelligence" : "Driftsäkerhet"}
          </p>
          <h3 className="mt-1 text-sm font-semibold text-ink">
            {assessment.appliesTo.make} {assessment.appliesTo.model}
          </h3>
        </div>
        <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${riskTone[assessment.riskLevel]}`}>
          {riskLabel}
        </span>
      </div>

      <p className="mt-3 text-xs leading-5 text-ink-muted">{assessment.summary}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {scope.map((item) => (
          <span className="rounded-md bg-surface-muted px-2 py-1 text-[10px] font-medium text-ink-muted" key={item}>
            {item}
          </span>
        ))}
        <span className="rounded-md bg-surface-muted px-2 py-1 text-[10px] font-medium text-ink-muted">
          {confidenceLabel}
        </span>
      </div>

      {assessment.issues.length > 0 ? (
        <ul className="mt-4 grid gap-3 border-t border-border pt-3">
          {assessment.issues.map((issue) => {
            const cost = issue.typicalRepairCost;
            const costLabel = cost
              ? cost.minimum !== undefined && cost.maximum !== undefined
                ? `${money.format(cost.minimum)}–${money.format(cost.maximum)}`
                : money.format(cost.minimum ?? cost.maximum ?? 0)
              : null;
            return (
              <li key={issue.id}>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs font-semibold text-ink">{issue.title}</p>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-semibold ${severityTone[issue.severity]}`}>
                    {{
                      watch: en ? "Watch" : "Bevaka",
                      important: en ? "Important" : "Viktigt",
                      critical: en ? "Critical" : "Kritiskt",
                    }[issue.severity]}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-5 text-ink-muted">{issue.description}</p>
                {issue.symptoms ? (
                  <p className="mt-1 text-[11px] leading-5 text-ink-muted">
                    <span className="font-semibold text-ink">{en ? "Symptoms:" : "Symptom:"}</span>{" "}
                    {issue.symptoms}
                  </p>
                ) : null}
                {issue.inspectionAdvice ? (
                  <p className="mt-1 text-[11px] leading-5 text-ink-muted">
                    <span className="font-semibold text-ink">{en ? "Check:" : "Kontrollera:"}</span>{" "}
                    {issue.inspectionAdvice}
                  </p>
                ) : null}
                {costLabel ? (
                  <p className="mt-1 text-[10px] font-medium text-ink-subtle">
                    {en ? "Typical repair range" : "Typiskt reparationsintervall"}: {costLabel}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="mt-4 border-t border-border pt-3">
        <p className="text-[10px] leading-4 text-ink-subtle">
          {en
            ? "Known-risk guidance, not a condition inspection of this individual car. Verify service history and inspect before purchase."
            : "Vägledning om kända risker, inte en skickkontroll av just denna bil. Kontrollera servicehistorik och besiktiga före köp."}
        </p>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {assessment.sources.map((source) => (
            <a
              className="inline-flex items-center gap-1 text-[10px] font-semibold text-accent-strong underline-offset-2 hover:underline"
              href={source.url}
              key={source.id}
              rel="noopener noreferrer"
              target="_blank"
            >
              {source.label}
              <ExternalLinkIcon className="size-2.5" />
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
