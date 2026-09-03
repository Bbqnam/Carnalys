import assert from "node:assert/strict";
import test from "node:test";
import { EvidenceRegistry, sanitizeEvidenceCitations } from "./evidence";

test("evidence identifiers are server-assigned and invalid citations are removed", () => {
  const registry = new EvidenceRegistry();
  const result = registry.register({
    tool: "get_listing_analysis",
    data: {},
    evidence: [{ id: "model-made-id", kind: "listing", label: "Listing facts", asOf: "2026-09-01T10:00:00Z" }],
  });
  assert.equal(result.evidence[0].id, "E1");
  const validated = sanitizeEvidenceCitations("Fair price [E1], invented [E99].", registry.all());
  assert.equal(validated.text, "Fair price [E1], invented .");
  assert.deepEqual(validated.invalid, ["E99"]);
});

