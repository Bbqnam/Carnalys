"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { createQuoteAction, lookupVehicleByPlateAction, type FormState } from "./actions";
import {
  bodyStyleOptions,
  coverageLevelOptions,
  drivetrainOptions,
  fuelTypeOptions,
  transmissionOptions,
} from "./vehicle-options";

const initialState: FormState = {};
const fieldClass =
  "mt-1 block h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-sm text-ink outline-none transition focus:border-accent focus:ring-3 focus:ring-accent-soft";
const labelClass = "text-xs font-semibold text-ink-muted";

interface Profile {
  id: string;
  label: string;
}

// Snapshot fields are uncontrolled (set imperatively via refs) rather than
// React state, so a successful submit can reset the whole native <form> —
// including these — without calling setState inside an effect.
export function CreateQuoteForm({ profiles, insurers }: { profiles: Profile[]; insurers: string[] }) {
  const [state, formAction, pending] = useActionState(createQuoteAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const vehicleIdRef = useRef<HTMLInputElement>(null);
  const makeRef = useRef<HTMLInputElement>(null);
  const modelRef = useRef<HTMLInputElement>(null);
  const variantRef = useRef<HTMLInputElement>(null);
  const modelYearRef = useRef<HTMLInputElement>(null);
  const horsepowerRef = useRef<HTMLInputElement>(null);
  const valueRef = useRef<HTMLInputElement>(null);
  const bodyStyleRef = useRef<HTMLSelectElement>(null);
  const fuelTypeRef = useRef<HTMLSelectElement>(null);
  const transmissionRef = useRef<HTMLSelectElement>(null);
  const drivetrainRef = useRef<HTMLSelectElement>(null);

  const [plate, setPlate] = useState("");
  const [lookupNote, setLookupNote] = useState<string | null>(null);
  const [isLookingUp, startLookup] = useTransition();

  async function action(formData: FormData) {
    const result = await formAction(formData);
    formRef.current?.reset();
    setPlate("");
    setLookupNote(null);
    return result;
  }

  function handleLookup() {
    if (!plate.trim()) return;
    startLookup(async () => {
      const result = await lookupVehicleByPlateAction(plate);
      if (!result) {
        setLookupNote("No vehicle in the catalog with that registration number — fill in the fields manually.");
        return;
      }
      if (vehicleIdRef.current) vehicleIdRef.current.value = result.vehicleId;
      if (makeRef.current) makeRef.current.value = result.make;
      if (modelRef.current) modelRef.current.value = result.model;
      if (variantRef.current) variantRef.current.value = result.variant ?? "";
      if (modelYearRef.current) modelYearRef.current.value = String(result.modelYear);
      if (horsepowerRef.current) horsepowerRef.current.value = result.horsepower !== null ? String(result.horsepower) : "";
      if (bodyStyleRef.current) bodyStyleRef.current.value = result.bodyStyle;
      if (fuelTypeRef.current) fuelTypeRef.current.value = result.fuelType;
      if (transmissionRef.current) transmissionRef.current.value = result.transmission;
      if (drivetrainRef.current) drivetrainRef.current.value = result.drivetrain ?? "";
      if (valueRef.current) {
        valueRef.current.value = result.suggestedValueAmount !== null ? String(result.suggestedValueAmount) : "";
      }
      setLookupNote(
        result.suggestedValueAmount === null
          ? "Vehicle found — no active asking price to suggest, enter the value used for this quote."
          : "Vehicle found and fields filled in — asking price suggested as the value, adjust if needed.",
      );
    });
  }

  return (
    <form action={action} className="flex flex-col gap-3" ref={formRef}>
      <input name="vehicleId" ref={vehicleIdRef} type="hidden" />

      <div className="flex flex-wrap items-end gap-2">
        <label className={labelClass}>
          Registration number
          <input
            className={fieldClass}
            name="registrationNumber"
            onChange={(e) => setPlate(e.target.value)}
            placeholder="ABC123"
            value={plate}
          />
        </label>
        <button
          className="h-9 rounded-lg border border-border px-3 text-xs font-semibold text-ink transition hover:bg-surface-muted disabled:opacity-60"
          disabled={isLookingUp || !plate.trim()}
          onClick={handleLookup}
          type="button"
        >
          {isLookingUp ? "Looking up…" : "Fill from catalog"}
        </button>
        {lookupNote ? <span className="text-xs text-ink-muted">{lookupNote}</span> : null}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <label className={labelClass}>
          Brand
          <input className={fieldClass} defaultValue="" name="make" ref={makeRef} required />
        </label>
        <label className={labelClass}>
          Model
          <input className={fieldClass} defaultValue="" name="model" ref={modelRef} required />
        </label>
        <label className={labelClass}>
          Variant
          <input className={fieldClass} defaultValue="" name="variant" ref={variantRef} />
        </label>
        <label className={labelClass}>
          Model year
          <input
            className={fieldClass}
            defaultValue=""
            min={1980}
            name="modelYear"
            ref={modelYearRef}
            required
            type="number"
          />
        </label>
        <label className={labelClass}>
          Horsepower
          <input className={fieldClass} defaultValue="" min={0} name="horsepower" ref={horsepowerRef} type="number" />
        </label>
        <label className={labelClass}>
          Body style
          <select className={fieldClass} defaultValue="" name="bodyStyle" ref={bodyStyleRef} required>
            <option value="">Select…</option>
            {bodyStyleOptions.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Fuel type
          <select className={fieldClass} defaultValue="" name="fuelType" ref={fuelTypeRef} required>
            <option value="">Select…</option>
            {fuelTypeOptions.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Transmission
          <select className={fieldClass} defaultValue="" name="transmission" ref={transmissionRef} required>
            <option value="">Select…</option>
            {transmissionOptions.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Drivetrain
          <select className={fieldClass} defaultValue="" name="drivetrain" ref={drivetrainRef}>
            <option value="">Unknown</option>
            {drivetrainOptions.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Vehicle value (SEK)
          <input
            className={fieldClass}
            defaultValue=""
            min={0}
            name="vehicleValueAmount"
            ref={valueRef}
            required
            type="number"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <label className={labelClass}>
          Profile
          <select className={fieldClass} defaultValue="" name="profileId" required>
            <option disabled value="">
              Select…
            </option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Insurer
          <input className={fieldClass} list="insurer-options" name="insurer" required />
          <datalist id="insurer-options">
            {insurers.map((i) => (
              <option key={i} value={i} />
            ))}
          </datalist>
        </label>
        <label className={labelClass}>
          Coverage
          <select className={fieldClass} defaultValue="hel" name="coverageLevel" required>
            {coverageLevelOptions.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Monthly premium (SEK)
          <input className={fieldClass} min={0} name="monthlyPremiumAmount" required type="number" />
        </label>
        <label className={labelClass}>
          Observed date
          <input
            className={fieldClass}
            defaultValue={new Date().toISOString().slice(0, 10)}
            name="observedAt"
            required
            type="date"
          />
        </label>
      </div>

      <label className={labelClass}>
        Notes
        <input className={fieldClass} name="notes" placeholder="Optional" />
      </label>

      <div className="flex items-center gap-3">
        <button
          className="h-9 rounded-lg bg-ink px-4 text-sm font-semibold text-surface transition hover:opacity-90 disabled:opacity-60"
          disabled={pending}
          type="submit"
        >
          {pending ? "Saving…" : "Add quote"}
        </button>
        {state.error ? <span className="text-xs text-negative">{state.error}</span> : null}
        {state.success ? <span className="text-xs font-medium text-positive">Quote saved</span> : null}
      </div>
    </form>
  );
}
