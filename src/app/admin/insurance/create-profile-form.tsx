"use client";

import { useActionState, useEffect, useRef } from "react";
import { createProfileAction, type FormState } from "./actions";

const initialState: FormState = {};
const fieldClass =
  "mt-1 block h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-sm text-ink outline-none transition focus:border-accent focus:ring-3 focus:ring-accent-soft";
const labelClass = "text-xs font-semibold text-ink-muted";

export function CreateProfileForm() {
  const [state, action, pending] = useActionState(createProfileAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <div className="flex flex-col gap-2">
      <form action={action} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" ref={formRef}>
        <label className={labelClass}>
          Label
          <input className={fieldClass} name="label" placeholder="Profile A" required type="text" />
        </label>
        <label className={labelClass}>
          Age band
          <input className={fieldClass} name="ageBand" placeholder="30–34" required type="text" />
        </label>
        <label className={labelClass}>
          Licence years
          <input className={fieldClass} min={0} name="licenceYears" required type="number" />
        </label>
        <label className={labelClass}>
          Region
          <input className={fieldClass} name="region" placeholder="Sundsvall" required type="text" />
        </label>
        <label className={labelClass}>
          Annual mileage (km)
          <input className={fieldClass} min={0} name="annualMileageKm" placeholder="10000" required type="number" />
        </label>
        <label className={labelClass}>
          Notes
          <input className={fieldClass} name="notes" placeholder="Optional" type="text" />
        </label>
        <button
          className="col-span-2 h-9 rounded-lg bg-ink px-4 text-sm font-semibold text-surface transition hover:opacity-90 disabled:opacity-60 sm:col-span-1"
          disabled={pending}
          type="submit"
        >
          {pending ? "Adding…" : "Add profile"}
        </button>
      </form>
      {state.error ? <span className="text-xs text-negative">{state.error}</span> : null}
      {state.success ? <span className="text-xs font-medium text-positive">Profile added</span> : null}
    </div>
  );
}
