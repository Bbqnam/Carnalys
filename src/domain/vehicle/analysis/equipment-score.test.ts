import assert from "node:assert/strict";
import test from "node:test";
import { assessEquipment } from "./equipment-score";

test("missing equipment remains neutral and lowers coverage", () => {
  const result = assessEquipment([], [["Bluetooth"], ["Dragkrok"], ["Backkamera"]]);
  assert.equal(result.score, 50);
  assert.equal(result.coverage, "missing");
});

test("valuable equipment beats a basic comparable cohort", () => {
  const cohort = [["Bluetooth"], ["Regnsensor"], ["Bluetooth", "Regnsensor"]];
  const rich = assessEquipment(["Dragkrok", "Panoramatak", "360 kamera", "Bose ljudsystem"], cohort);
  const basic = assessEquipment(["Bluetooth"], cohort);
  assert.ok(rich.score > basic.score + 30, `${rich.score} vs ${basic.score}`);
});
