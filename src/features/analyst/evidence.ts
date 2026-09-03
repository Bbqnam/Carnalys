import type { AnalystEvidence, AnalystToolResult } from "./types";

export class EvidenceRegistry {
  private readonly byKey = new Map<string, AnalystEvidence>();

  register<T>(result: AnalystToolResult<T>): AnalystToolResult<T> {
    const evidence = result.evidence.map((item) => {
      const key = JSON.stringify([item.kind, item.label, item.asOf, item.href, item.sampleSize, item.warning]);
      const existing = this.byKey.get(key);
      if (existing) return existing;
      const registered = { ...item, id: `E${this.byKey.size + 1}` };
      this.byKey.set(key, registered);
      return registered;
    });
    return { ...result, evidence };
  }

  all() {
    return [...this.byKey.values()];
  }

  has(id: string) {
    return this.all().some((item) => item.id === id);
  }
}

export function sanitizeEvidenceCitations(answer: string, evidence: readonly AnalystEvidence[]) {
  const valid = new Set(evidence.map(({ id }) => id));
  const invalid: string[] = [];
  const text = answer.replace(/\[([A-Za-z0-9_-]+)\]/g, (full, id: string) => {
    if (!/^E\d+$/.test(id)) return full;
    if (valid.has(id)) return full;
    invalid.push(id);
    return "";
  }).replace(/[ \t]+\n/g, "\n").trim();
  return { text, invalid: [...new Set(invalid)] };
}

