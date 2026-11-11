import { Badge, ProgressBar } from "./ui.jsx";
import { percent } from "../lib/format.js";

/**
 * One intervention attempt with the Tutor practice and Mastery check results.
 * Shared by the demo learner evidence page and the classroom progress page.
 */
export default function AttemptCard({ attempt, isLatest = false }) {
  const practice = attempt.practice?.result;
  const mastery = attempt.mastery?.result;
  const passed = Boolean(mastery?.thresholdMet);

  return (
    <li className="rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-600">
            {attempt.attempt}
          </span>
          <div>
            <p className="text-sm font-semibold text-ink-950">
              {attempt.intervention?.title || `Attempt ${attempt.attempt}`}
            </p>
            <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
              {attempt.intervention?.objective}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {attempt.intervention?.adapted ? <Badge tone="amber">Adapted</Badge> : null}
          {isLatest ? <Badge tone="sky">Latest</Badge> : null}
          <Badge tone={passed ? "mint" : mastery ? "amber" : "slate"}>
            {mastery ? `${percent(mastery.scorePercent)} mastery` : "Pending"}
          </Badge>
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <div className="mb-1 flex items-center justify-between text-[11px]">
            <span className="font-medium text-slate-600">Tutor practice</span>
            <span className="font-semibold tabular-nums text-slate-800">
              {practice ? `${practice.correct}/${practice.total} · ${percent(practice.scorePercent)}` : "Pending"}
            </span>
          </div>
          <ProgressBar value={practice?.scorePercent ?? 0} tone="mint" />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between text-[11px]">
            <span className="font-medium text-slate-600">Mastery check</span>
            <span className="font-semibold tabular-nums text-slate-800">
              {mastery ? `${mastery.correct}/${mastery.total} · ${percent(mastery.scorePercent)}` : "Pending"}
            </span>
          </div>
          <ProgressBar value={mastery?.scorePercent ?? 0} tone={passed ? "mint" : "amber"} />
        </div>
      </div>

      {practice?.feedbackSummary ? (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
          <span className="font-semibold text-slate-700">Tutor feedback: </span>
          {practice.feedbackSummary}
        </p>
      ) : null}
    </li>
  );
}
