import {
  CheckCircle2,
  GraduationCap,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";
import { Badge, Card, ConfidenceMeter } from "./ui.jsx";

/**
 * Teacher Insight Agent output. Shared by the demo teacher dashboard and the
 * classroom student progress page so both surface the same decision support.
 */
export default function TeacherInsightPanel({ insight, pendingCopy }) {
  if (!insight) {
    return (
      <Card className="p-5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-slate-400" aria-hidden="true" />
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">Teacher insight</h2>
        </div>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {pendingCopy ||
            "The Teacher Insight Agent runs after the final mastery check. This cycle is still in progress, so no summary has been generated yet."}
        </p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-mint-200">
      <div className="border-b border-mint-100 bg-gradient-to-br from-mint-50 to-white p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-ink-950 p-2 text-mint-300">
              <GraduationCap className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-mint-800">AI teacher insight</p>
              <h2 className="text-sm font-bold text-ink-950">Decision support, not a decision</h2>
            </div>
          </div>
          <Badge tone="mint">Final step</Badge>
        </div>
        <p className="mt-3 text-base font-bold leading-6 text-ink-950">{insight.headline}</p>
        <p className="mt-1.5 text-xs leading-5 text-slate-600">{insight.summary}</p>
        <div className="mt-3">
          <ConfidenceMeter value={insight.confidence} label="Confidence in the summary" />
        </div>
      </div>

      <div className="space-y-4 p-5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Evidence cited</p>
          <ul className="mt-2 space-y-2">
            {insight.evidence.map((item, index) => (
              <li key={index} className="flex gap-2 text-xs leading-5 text-slate-600">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-mint-600" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Recommended approach</p>
          <p className="mt-1 text-xs leading-5 text-slate-700">{insight.recommendation}</p>
        </div>

        <div className="rounded-xl border border-mint-200 bg-mint-50 p-3.5">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-mint-800">
            <Target className="h-3 w-3" aria-hidden="true" />
            Next step
          </p>
          <p className="mt-1 text-xs font-medium leading-5 text-mint-900">{insight.nextStep}</p>
        </div>

        <p className="flex items-start gap-1.5 text-[10px] leading-4 text-slate-500">
          <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          Generated from this cycle&apos;s recorded evidence. The teacher remains responsible for grouping, reteaching
          and any formal decision.
        </p>
      </div>
    </Card>
  );
}
