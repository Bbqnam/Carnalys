import assert from "node:assert/strict";
import test from "node:test";
import { canonicalizeVehicle, type CanonicalVehicleInput } from "./canonical-vehicle";

type Extra = Omit<Partial<CanonicalVehicleInput>, "make" | "model">;

function run(make: string, model: string, extra: Extra = {}) {
  return canonicalizeVehicle({
    make,
    model,
    variant: null,
    title: null,
    bodyStyle: "other",
    fuelType: "other",
    modelYear: null,
    ...extra,
  });
}

// ---------------------------------------------------------------------------
// Kia Ceed family — the reported case
// ---------------------------------------------------------------------------

test("Kia Ceed Sportswagon → Ceed + estate", () => {
  const v = run("Kia", "Ceed", { variant: "Sportswagon Plug-in Hybrid DCT" });
  assert.equal(v.make, "Kia");
  assert.equal(v.model, "Ceed");
  assert.equal(v.bodyStyle, "estate");
  assert.equal(v.fuelType, "plug_in_hybrid");
});

test("Kia 'Ceed SW Plug-In Hybrid' string collapses to Ceed with dimensions captured", () => {
  const v = run("Kia", "Ceed SW Plug-In Hybrid", { variant: "Advance Plus", bodyStyle: "estate", fuelType: "plug_in_hybrid" });
  assert.equal(v.model, "Ceed");
  assert.equal(v.bodyStyle, "estate");
  assert.equal(v.fuelType, "plug_in_hybrid");
  assert.equal(v.trim, "Advance Plus");
  assert.equal(v.rawModel, "Ceed SW Plug-In Hybrid");
});

test("Kia Ceed hatch stays a hatch when the source says so", () => {
  const v = run("Kia", "Ceed", { variant: "1.4 T-GDI Advance 140hk", bodyStyle: "hatchback", fuelType: "petrol" });
  assert.equal(v.model, "Ceed");
  assert.equal(v.bodyStyle, "hatchback");
  assert.equal(v.trim, "Advance");
});

test("Blocket noisy variant 'cee'd_sw 1.6 CRDi GT-Line' → Ceed + estate + GT-Line", () => {
  const v = run("Kia", "Ceed", { variant: "cee'd_sw 1.6 CRDi GT-Line Euro 6", fuelType: "diesel" });
  assert.equal(v.model, "Ceed");
  assert.equal(v.bodyStyle, "estate");
  assert.equal(v.fuelType, "diesel");
  assert.equal(v.trim, "GT-Line");
});

test("Kia XCeed and ProCeed stay distinct from Ceed", () => {
  assert.equal(run("Kia", "XCeed").model, "XCeed");
  assert.equal(run("Kia", "Xceed").model, "XCeed");
  assert.equal(run("Kia", "XCeed Plug-In Hybrid").model, "XCeed");
  assert.equal(run("Kia", "ProCeed").model, "ProCeed");
  assert.equal(run("Kia", "pro_cee'd").model, "ProCeed");
  assert.equal(run("Kia", "Pro_Cee´d").model, "ProCeed");
});

// ---------------------------------------------------------------------------
// Toyota Corolla
// ---------------------------------------------------------------------------

test("Toyota Corolla Touring Sports → Corolla + estate", () => {
  const v = run("Toyota", "Corolla", { variant: "Touring Sports Hybrid e-CVT", fuelType: "self_charging_hybrid" });
  assert.equal(v.model, "Corolla");
  assert.equal(v.bodyStyle, "estate");
});

test("Toyota Corolla hatch, and Cross/Verso stay distinct", () => {
  assert.equal(run("Toyota", "Corolla", { variant: "5-dörrars 1.6 VVT-i Manuell", bodyStyle: "hatchback" }).model, "Corolla");
  assert.equal(run("Toyota", "Corolla Cross", { bodyStyle: "suv" }).model, "Corolla Cross");
  assert.equal(run("Toyota", "Corolla Verso").model, "Corolla Verso");
});

// ---------------------------------------------------------------------------
// VW Golf — generation, the "Golf I" bug, perf variants, sub-models
// ---------------------------------------------------------------------------

test("VW Golf GTI → Golf + performanceVariant GTI, not its own model", () => {
  const v = run("Volkswagen", "Golf VII", { variant: "5-dörrars GTI 2.0 TSI", bodyStyle: "hatchback", fuelType: "petrol", modelYear: 2018 });
  assert.equal(v.model, "Golf");
  assert.equal(v.performanceVariant, "GTI");
  assert.equal(v.generation, "Mk7");
});

test("VW Golf R → Golf + performanceVariant R", () => {
  const v = run("Volkswagen", "Golf VII", { variant: "5-dörrars R 2.0 TSI BMT 4Motion DSG", modelYear: 2017 });
  assert.equal(v.model, "Golf");
  assert.equal(v.performanceVariant, "R");
});

test("VW 'Golf Variant' / 'Sportscombi' → Golf + estate", () => {
  assert.equal(run("Volkswagen", "Golf Variant").bodyStyle, "estate");
  assert.equal(run("Volkswagen", "Golf VII", { variant: "Sportscombi 1.6 TDI" }).bodyStyle, "estate");
});

test("VW plain Golf base — no perf variant, generation from year", () => {
  const v = run("Volkswagen", "Golf", { variant: "1.5 eTSI ACT OPF", bodyStyle: "hatchback", fuelType: "petrol", modelYear: 2022 });
  assert.equal(v.model, "Golf");
  assert.equal(v.performanceVariant, null);
  assert.equal(v.generation, "Mk8");
});

test("VW 'Golf I' with a modern model year does NOT become generation Mk1", () => {
  const v = run("Volkswagen", "Golf I", { variant: "LIFE 1,5 ETSI 150 HK DSG7", modelYear: 2026 });
  assert.equal(v.model, "Golf");
  assert.equal(v.generation, "Mk8");
});

test("VW Golf Sportsvan stays a distinct model", () => {
  assert.equal(run("Volkswagen", "Golf Sportsvan").model, "Golf Sportsvan");
  assert.equal(run("Volkswagen", "Golf I", { variant: "Sportsvan SPORTSCOMBI LIFE 1,5 TSI" }).model, "Golf Sportsvan");
});

// ---------------------------------------------------------------------------
// Volvo V60
// ---------------------------------------------------------------------------

test("Volvo V60 Cross Country stays distinct; plain V60 is estate", () => {
  assert.equal(run("Volvo", "V60 Cross Country", { variant: "D4 AWD Geartronic" }).model, "V60 Cross Country");
  assert.equal(run("Volvo", "V60", { variant: "D4 Geartronic" }).model, "V60");
  assert.equal(run("Volvo", "V60", { variant: "D4 Geartronic" }).bodyStyle, "estate");
});

test("Volvo V60 Recharge / Twin Engine → plug-in hybrid when fuel unknown", () => {
  assert.equal(run("Volvo", "V60", { variant: "Recharge T6 AWD" }).fuelType, "plug_in_hybrid");
  assert.equal(run("Volvo", "V60", { variant: "D5 Twin Engine AWD Geartronic" }).fuelType, "plug_in_hybrid");
});

test("Volvo V60 T8 → performanceVariant T8", () => {
  assert.equal(run("Volvo", "V60", { variant: "T8 Twin Engine AWD Inscription" }).performanceVariant, "T8");
});

// ---------------------------------------------------------------------------
// Casing / punctuation only
// ---------------------------------------------------------------------------

test("make casing: SEAT/Seat, CUPRA/Cupra, XPENG/XPeng normalize", () => {
  assert.equal(run("SEAT", "Leon").make, "SEAT");
  assert.equal(run("Seat", "Leon").make, "SEAT");
  assert.equal(run("CUPRA", "Formentor").make, "CUPRA");
  assert.equal(run("Cupra", "Formentor").make, "CUPRA");
  assert.equal(run("XPENG", "G6").make, "XPeng");
});

test("BMW engine badge casing: 320D === 320d", () => {
  assert.equal(run("BMW", "320D").model, run("BMW", "320d").model);
  assert.equal(run("BMW", "320D").model, "320d");
});

test("Mercedes 'C 220d' and 'C220 d' land on the same model", () => {
  assert.equal(run("Mercedes-Benz", "C 220d").model, run("Mercedes", "C220 d").model);
});

test("Mercedes Sprinter engine code stripped to the family", () => {
  assert.equal(run("Mercedes-Benz", "Sprinter 316").model, "Sprinter");
  assert.equal(run("Mercedes-Benz", "Sprinter 319").model, "Sprinter");
  assert.equal(run("Mercedes-Benz", "Sprinter 316").bodyStyle, "van");
});

test("Hyundai IONIQ 5 / Ioniq 5 normalize to one model", () => {
  assert.equal(run("Hyundai", "IONIQ 5").model, "Ioniq 5");
  assert.equal(run("Hyundai", "Ioniq 5").model, "Ioniq 5");
  assert.equal(run("Hyundai", "IONIQ").model, "Ioniq");
});

// ---------------------------------------------------------------------------
// Cross-source equivalence
// ---------------------------------------------------------------------------

test("two marketplaces' names for the same car resolve to the same core identity", () => {
  const hedin = canonicalizeVehicle({
    make: "Kia",
    model: "Ceed SW Plug-In Hybrid",
    variant: "Advance Plus",
    title: "Kia Ceed SW Plug-In Hybrid 2024 Laddhybrid",
    bodyStyle: "estate",
    fuelType: "plug_in_hybrid",
    modelYear: 2024,
  });
  const blocket = canonicalizeVehicle({
    make: "Kia",
    model: "Ceed",
    variant: "Sportswagon Plug-in Hybrid DCT Advance Euro 6",
    title: null,
    bodyStyle: "other",
    fuelType: "petrol", // Blocket often mis-files PHEV as petrol; do NOT override a set enum
    modelYear: 2023,
  });

  assert.equal(hedin.make, blocket.make);
  assert.equal(hedin.model, blocket.model); // Kia / Ceed
  assert.equal(hedin.bodyStyle, "estate");
  assert.equal(blocket.bodyStyle, "estate"); // filled from the token, source was `other`
  assert.equal(hedin.trim, "Advance Plus");
  assert.equal(blocket.trim, "Advance");
  // Raw provenance preserved and distinct.
  assert.equal(hedin.rawModel, "Ceed SW Plug-In Hybrid");
  assert.equal(blocket.rawModel, "Ceed");
  // Blocket's petrol fuel is kept but flagged.
  assert.equal(blocket.fuelType, "petrol");
  assert.ok(blocket.contradictions.some((c) => c.startsWith("fuelType")));
});

// ---------------------------------------------------------------------------
// Conservative: no confident signal → null, not a guess
// ---------------------------------------------------------------------------

test("ambiguous input leaves generation / trim / performanceVariant null", () => {
  const v = run("Fiat", "500", { variant: "1.2 Lounge" });
  assert.equal(v.make, "Fiat");
  assert.equal(v.model, "500");
  assert.equal(v.generation, null);
  assert.equal(v.performanceVariant, null);
});

test("appearance packages are trims, never performance variants", () => {
  // "R-Line" / "R-Design" / "AMG Line" must not read as the R / AMG performance model.
  assert.equal(run("Volkswagen", "Golf VII", { variant: "1.4 TSI 150Hk R-line Pluspaket", modelYear: 2018 }).performanceVariant, null);
  assert.equal(run("Volvo", "V60", { variant: "D4 R-Design Momentum" }).performanceVariant, null);
  assert.equal(run("Mercedes-Benz", "CLA220 d", { variant: "220 d Shooting Brake | AMG Line | Panorama" }).performanceVariant, null);
});

test("Mercedes CLA/CLS 'Shooting Brake' is an estate", () => {
  assert.equal(run("Mercedes-Benz", "CLA220 d", { variant: "220 d Shooting Brake AMG Line" }).bodyStyle, "estate");
});

test("a real performance badge in a pipe-delimited variant is still caught", () => {
  assert.equal(run("Volkswagen", "Passat", { variant: "Sportscombi|GTE|Cockpit|Drag" }).performanceVariant, "GTE");
});

test("normalizationVersion is stamped", () => {
  assert.equal(run("Kia", "Ceed").normalizationVersion, 1);
});

test("an unknown make is left alone (not force-normalized)", () => {
  assert.equal(run("Koenigsegg", "Jesko").make, "Koenigsegg");
});
