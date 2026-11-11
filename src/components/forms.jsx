import { cx } from "../lib/cx.js";

export const inputClasses =
  "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-ink-950 shadow-sm transition placeholder:text-slate-400 focus:border-mint-500 focus:outline-none focus:ring-2 focus:ring-mint-500/30 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500";

export function Field({ id, label, hint, error, children, className = "" }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-semibold text-ink-950">
        {label}
      </label>
      {hint ? (
        <p id={`${id}-hint`} className="mt-1 text-xs leading-5 text-slate-500">
          {hint}
        </p>
      ) : null}
      <div className="mt-2">{children}</div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-xs font-medium text-rose-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Fieldset({ legend, children, className = "" }) {
  return (
    <fieldset className={cx("space-y-4", className)}>
      {legend ? (
        <legend className="text-sm font-semibold text-ink-950">{legend}</legend>
      ) : null}
      {children}
    </fieldset>
  );
}
