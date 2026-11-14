import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, Sparkles, Target } from "lucide-react";
import { api } from "../../lib/api.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { STATUS_META } from "../../lib/constants.js";
import { Alert, Badge, Card, ProgressBar } from "../../components/ui.jsx";

const STATUS_COPY = {
  not_started: "Start with five short diagnostic questions. The agents use your answers to find the gap behind the mistakes.",
  diagnostic: "Your diagnostic is ready. Answer all five questions to start the six-agent recovery cycle.",
  analyzing: "The Assessment, Diagnostic and Learning Designer agents are working through your evidence.",
  learning: "Your personalised lesson and guided practice are ready. Continue where you left off.",
  retry: "Your adapted lesson is ready. The explanation is slower and the practice questions are fresh.",
  mastery: "Your mastery check is ready. New questions on the same skill — you need 80% to complete the cycle.",
  complete_pass: "You met the mastery threshold. Your teacher can now see the evidence and the recommended next step.",
  complete_support: "The cycle is complete. Your teacher will review the evidence and decide the next step with you.",
  error: "A step needs attention. Open your learning workspace and restart the cycle.",
};

export default function StudentHome() {
  const { user, refresh } = useAuth();
  const [progress, setProgress] = useState(null);
  const [progressError, setProgressError] = useState(null);

  useEffect(() => {
    let active = true;
    api
      .studentProgress()
      .then((progressData) => {
        if (!active) return;
        setProgress(progressData);
        setProgressError(null);
      })
      .catch((err) => {
        if (!active) return;
        if (err.status === 401) {
          refresh();
          return;
        }
        setProgressError(err.message || "Could not load your learning progress.");
      });
    return () => {
      active = false;
    };
  }, [refresh]);

  const studentName = progress?.learner?.name || user?.student?.displayName || "there";
  const statusKey = progress?.learner?.status || "not_started";
  const status = STATUS_META[statusKey] || STATUS_META.not_started;
  const isActive = Boolean(progress?.learner?.activeSessionId);
  const completed = ["complete_pass", "complete_support"].includes(statusKey);
  const ctaLabel = isActive ? "Continue learning" : completed ? "Start another cycle" : "Start learning";

  return (
    <div className="mx-auto max-w-3xl">
      <Card className="flex flex-col p-6 sm:p-8">
        <div className="flex items-start justify-between gap-3">
          <span className="inline-flex w-fit rounded-xl bg-mint-50 p-3 text-mint-700 ring-1 ring-inset ring-mint-200">
            <Sparkles className="h-6 w-6" aria-hidden="true" />
          </span>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>

        <p className="mt-4 text-xs font-bold uppercase tracking-wide text-slate-500">Hi, {studentName}</p>
        <h1 className="mt-1 text-2xl font-bold text-ink-950 sm:text-3xl">Your learning cycle</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          {STATUS_COPY[statusKey] ||
            "The six agents find the gap behind your mistakes, build a targeted lesson, coach your practice and check mastery with fresh questions."}
        </p>

        {progress ? (
          <div className="mt-6">
            <ProgressBar
              value={progress.learner?.progressPercent ?? 0}
              showValue
              label="Progress"
            />
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2">
                <p className="font-semibold text-ink-950">
                  {progress.learner?.initialScore ?? "—"}
                  {progress.learner?.initialScore !== null && progress.learner?.initialScore !== undefined ? "%" : ""}
                </p>
                <p className="text-[10px] uppercase tracking-wide text-slate-500">Diagnostic</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2">
                <p className="font-semibold text-ink-950">
                  {progress.learner?.latestScore ?? "—"}
                  {progress.learner?.latestScore !== null && progress.learner?.latestScore !== undefined ? "%" : ""}
                </p>
                <p className="text-[10px] uppercase tracking-wide text-slate-500">Mastery</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2">
                <p className="font-semibold text-ink-950">{progress.learner?.completedCycles ?? 0}</p>
                <p className="text-[10px] uppercase tracking-wide text-slate-500">Cycles</p>
              </div>
            </div>
          </div>
        ) : null}

        {progressError ? (
          <Alert tone="warning" title="Progress could not load" className="mt-4">
            {progressError}
          </Alert>
        ) : null}

        <div className="mt-6">
          <Link
            to="/portal/student/learn"
            className="inline-flex items-center gap-2 rounded-xl bg-ink-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ink-800"
          >
            {isActive || completed ? (
              <Target className="h-4 w-4" aria-hidden="true" />
            ) : (
              <BookOpen className="h-4 w-4" aria-hidden="true" />
            )}
            {ctaLabel}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </Card>
    </div>
  );
}
