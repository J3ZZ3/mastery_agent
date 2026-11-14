import { useState } from "react";
import { ChevronDown, ShieldCheck } from "lucide-react";
import { Badge, Card, ConfidenceMeter } from "./ui.jsx";
import { cx } from "../lib/cx.js";

export default function DiagnosisCard({ diagnosis, compact = false, className = "" }) {
  const [expanded, setExpanded] = useState(false);
  if (!diagnosis) return null;

  const severityTone = diagnosis.severity === "high" ? "amber" : diagnosis.severity === "moderate" ? "sky" : "slate";
  const evidence = diagnosis.evidence || [];
  const showAll = expanded && !compact;
  const visibleEvidence = showAll ? evidence : evidence.slice(0, 2);

  return (
    <Card className={cx(compact ? "p-4" : "p-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">Diagnostic hypothesis</p>
          <h3
            className={cx(
              "mt-1 font-bold leading-snug",
              compact ? "text-base" : "text-lg",
              !showAll && "line-clamp-2",
            )}
          >
            {diagnosis.suspectedGap}
          </h3>
        </div>
        <Badge tone={diagnosis.isSurfaceLevel ? "sky" : severityTone}>
          {diagnosis.isSurfaceLevel ? "Possible isolated slip" : `${diagnosis.severity} evidence`}
        </Badge>
      </div>

      <div className="mt-3">
        <ConfidenceMeter value={diagnosis.confidence} />
      </div>

      {visibleEvidence.length > 0 ? (
        <div className="mt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Evidence</p>
          <ul className="mt-1.5 space-y-1.5">
            {visibleEvidence.map((item, index) => (
              <li key={index} className="flex gap-2 text-xs leading-5 text-slate-600">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-slate-400" aria-hidden="true" />
                <span className={cx(!showAll && "line-clamp-2")}>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!compact ? (
        <>
          {showAll ? (
            <div className="mt-3 space-y-2">
              {diagnosis.relatedConcept ? (
                <p className="rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                  <span className="font-semibold text-slate-700">Focus: </span>
                  {diagnosis.relatedConcept}
                </p>
              ) : null}
              {diagnosis.reasoning ? (
                <p className="rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                  <span className="font-semibold text-slate-700">Why: </span>
                  {diagnosis.reasoning}
                </p>
              ) : null}
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-sky-700 transition hover:text-sky-900"
          >
            {expanded ? "Show less" : "Show full evidence and reasoning"}
            <ChevronDown className={cx("h-3.5 w-3.5 transition", expanded && "rotate-180")} aria-hidden="true" />
          </button>
        </>
      ) : null}

      <p className="mt-3 flex items-start gap-1.5 text-[10px] leading-4 text-slate-500">
        <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
        This is a hypothesis supported by evidence, not a permanent learner label. The teacher makes the final decision.
      </p>
    </Card>
  );
}
