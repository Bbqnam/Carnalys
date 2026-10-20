"use client";

import { useActionState } from "react";
import {
  addReliabilityIssueAction,
  addReliabilitySourceAction,
  createReliabilityProfileAction,
  type ReliabilityFormState,
} from "./actions";

const initialState: ReliabilityFormState = {};
const inputClass = "h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink outline-none focus:border-accent";
const textareaClass = "min-h-24 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent";
const buttonClass = "h-10 rounded-lg bg-ink px-4 text-sm font-semibold text-surface disabled:opacity-50";

function Result({ state }: { state: ReliabilityFormState }) {
  if (state.error) return <p className="text-xs text-negative" role="alert">{state.error}</p>;
  if (state.success) return <p className="text-xs text-positive">Saved.</p>;
  return null;
}

export function CreateReliabilityProfileForm() {
  const [state, action, pending] = useActionState(createReliabilityProfileAction, initialState);
  return (
    <form action={action} className="grid gap-3 rounded-2xl border border-border bg-surface p-5">
      <div>
        <h2 className="text-base font-semibold text-ink">New reliability profile</h2>
        <p className="mt-1 text-xs leading-5 text-ink-muted">Profiles remain drafts until at least one evidence source is attached.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <input aria-label="Make" className={inputClass} name="make" placeholder="Make" required />
        <input aria-label="Model" className={inputClass} name="model" placeholder="Model" required />
        <input aria-label="Generation" className={inputClass} name="generation" placeholder="Generation (optional)" />
        <input aria-label="Engine matching text" className={inputClass} name="enginePattern" placeholder="Engine text (optional)" />
        <input aria-label="First model year" className={inputClass} max="2100" min="1950" name="modelYearFrom" placeholder="Year from" required type="number" />
        <input aria-label="Last model year" className={inputClass} max="2100" min="1950" name="modelYearTo" placeholder="Year to" required type="number" />
        <select aria-label="Fuel type" className={inputClass} defaultValue="" name="fuelType">
          <option value="">Any fuel type</option>
          <option value="diesel">Diesel</option>
          <option value="electric">Electric</option>
          <option value="ethanol">Ethanol</option>
          <option value="hydrogen">Hydrogen</option>
          <option value="petrol">Petrol</option>
          <option value="plug_in_hybrid">Plug-in hybrid</option>
          <option value="self_charging_hybrid">Self-charging hybrid</option>
          <option value="other">Other</option>
        </select>
        <select aria-label="Transmission" className={inputClass} defaultValue="" name="transmission">
          <option value="">Any transmission</option>
          <option value="automatic">Automatic</option>
          <option value="manual">Manual</option>
          <option value="other">Other</option>
        </select>
        <select aria-label="Risk level" className={inputClass} defaultValue="moderate" name="riskLevel">
          <option value="low">Lower known risk</option>
          <option value="moderate">Some known risks</option>
          <option value="high">Important known risks</option>
        </select>
        <select aria-label="Evidence confidence" className={inputClass} defaultValue="medium" name="confidence">
          <option value="low">Limited evidence</option>
          <option value="medium">Moderate evidence</option>
          <option value="high">Strong evidence</option>
        </select>
      </div>
      <textarea aria-label="Evidence summary" className={textareaClass} name="summary" placeholder="Short, neutral summary of the evidence and affected cohort" required />
      <div className="flex items-center gap-3">
        <button className={buttonClass} disabled={pending} type="submit">{pending ? "Saving…" : "Create profile"}</button>
        <Result state={state} />
      </div>
    </form>
  );
}

export function AddReliabilityIssueForm({ profileId }: { profileId: string }) {
  const [state, action, pending] = useActionState(addReliabilityIssueAction, initialState);
  return (
    <form action={action} className="grid gap-2 rounded-xl bg-surface-subtle p-3">
      <input name="profileId" type="hidden" value={profileId} />
      <p className="text-xs font-semibold text-ink">Add known issue</p>
      <div className="grid gap-2 sm:grid-cols-[1fr_10rem]">
        <input aria-label="Issue title" className={inputClass} name="title" placeholder="Issue title" required />
        <select aria-label="Severity" className={inputClass} defaultValue="watch" name="severity">
          <option value="watch">Watch</option>
          <option value="important">Important</option>
          <option value="critical">Critical</option>
        </select>
      </div>
      <textarea aria-label="Issue description" className={textareaClass} name="description" placeholder="What fails, under which conditions, and how certain the evidence is" required />
      <input aria-label="Symptoms" className={inputClass} name="symptoms" placeholder="Symptoms (optional)" />
      <input aria-label="Inspection advice" className={inputClass} name="inspectionAdvice" placeholder="What a buyer should inspect (optional)" />
      <div className="grid gap-2 sm:grid-cols-2">
        <input aria-label="Minimum repair cost" className={inputClass} min="0" name="typicalRepairCostMinimum" placeholder="Repair cost min SEK" type="number" />
        <input aria-label="Maximum repair cost" className={inputClass} min="0" name="typicalRepairCostMaximum" placeholder="Repair cost max SEK" type="number" />
      </div>
      <div className="flex items-center gap-3">
        <button className={buttonClass} disabled={pending} type="submit">{pending ? "Saving…" : "Add issue"}</button>
        <Result state={state} />
      </div>
    </form>
  );
}

export function AddReliabilitySourceForm({ profileId }: { profileId: string }) {
  const [state, action, pending] = useActionState(addReliabilitySourceAction, initialState);
  return (
    <form action={action} className="grid gap-2 rounded-xl bg-surface-subtle p-3">
      <input name="profileId" type="hidden" value={profileId} />
      <p className="text-xs font-semibold text-ink">Add evidence source</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <input aria-label="Source label" className={inputClass} name="label" placeholder="e.g. Manufacturer recall 23V-123" required />
        <input aria-label="Source URL" className={inputClass} name="url" placeholder="https://…" required type="url" />
      </div>
      <input aria-label="Published date" className={inputClass} name="publishedAt" type="date" />
      <div className="flex items-center gap-3">
        <button className={buttonClass} disabled={pending} type="submit">{pending ? "Saving…" : "Add source"}</button>
        <Result state={state} />
      </div>
    </form>
  );
}
