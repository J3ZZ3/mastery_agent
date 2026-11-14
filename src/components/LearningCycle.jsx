import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Lightbulb,
  Play,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Target,
} from "lucide-react";
import { AGENTS, STATUS_META } from "../lib/constants.js";
import { lastAttempt, percent } from "../lib/format.js";

import DiagnosisCard from "./DiagnosisCard.jsx";
import LessonPanel from "./LessonPanel.jsx";
import PracticePanel from "./PracticePanel.jsx";
import Questionnaire from "./Questionnaire.jsx";
import ResultSummary from "./ResultSummary.jsx";
import { Alert, Badge, Button, Card, Spinner } from "./ui.jsx";
import { cx } from "../lib/cx.js";

const CYCLE_AGENTS = ["assessment", "diagnostic", "designer"];

const AGENT_ACTIVITY_META = {
  started: { label: "Working now", tone: "sky" },
  progress: { label: "Working now", tone: "sky" },
  completed: { label: "Done", tone: "mint" },
  failed: { label: "Stopped", tone: "rose" },
};

function agentActivity(events, key) {
  const latest = [...events].reverse().find((event) => event.agent === key);
  if (!latest) {
    return { label: "Waiting", tone: "slate", detail: "Queued until the agent before it finishes." };
  }

  const meta = AGENT_ACTIVITY_META[latest.status] || { label: "Working now", tone: "sky" };
  const detail =
    latest.status === "completed" || latest.status === "failed"
      ? latest.summary || latest.message
      : latest.message || latest.summary;

  return { ...meta, detail };
}

function AnalysisCard({ session, onRefresh, busy, liveEvents = [] }) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-slate-100 bg-gradient-to-br from-sky-50 to-white p-6">
        <div className="flex items-start gap-4">
          <span className="rounded-2xl bg-sky-100 p-3 text-sky-700">
            <Spinner className="h-6 w-6" />
          </span>
          <div>
            <p className="eyebrow">Agents at work</p>
            <h2 className="mt-1 text-xl font-bold sm:text-2xl">Your agents are analysing the evidence</h2>
            <p className="mt-1.5 max-w-xl text-sm leading-6 text-slate-600">
              Each agent shows exactly what it is doing right now. Its result is checked before the next agent starts.
            </p>
          </div>
        </div>
      </div>
      <div className="p-6">
        <ol className="space-y-3">
          {AGENTS.filter((agent) => CYCLE_AGENTS.includes(agent.key)).map((agent, index) => {
            const activity = agentActivity(liveEvents, agent.key);
            return (
              <li key={agent.key} className="flex items-start gap-3 rounded-xl border border-slate-200 px-4 py-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-600">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink-950">{agent.name}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-slate-600">{activity.detail}</p>
                </div>
                <Badge tone={activity.tone} className="mt-0.5 shrink-0">
                  {activity.label}
                </Badge>
              </li>
            );
          })}
        </ol>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            Keep this page open. You can also refresh if the connection drops.
          </p>
          <Button variant="secondary" size="sm" icon={RefreshCw} onClick={onRefresh} loading={busy}>
            Refresh status
          </Button>
        </div>
        {session?.status === "error" ? (
          <Alert tone="error" title="A step could not finish" className="mt-4">
            {session.error || "Refresh the session or start the cycle again."}
          </Alert>
        ) : null}
      </div>
    </Card>
  );
}

function StartCard({ learner, onStart, busy, startMeta }) {
  const firstName = (learner?.name || "there").split(" ")[0];

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-slate-100 bg-gradient-to-br from-mint-50 via-white to-sky-50 p-6 sm:p-8">
        <Badge tone="mint" icon={Sparkles}>
          Ready when you are
        </Badge>
        <h2 className="mt-3 max-w-xl text-2xl font-bold sm:text-3xl">
          Hi {firstName}. Let&apos;s find the gap behind the mistakes.
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          Five short questions on integers and a simple equation. There is no timer and no penalty for a wrong answer —
          the diagnostic is only there to help the agents choose what to teach next.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button variant="mint" size="lg" icon={Play} onClick={onStart} loading={busy}>
            Start the diagnostic
          </Button>
          <span className="text-xs text-slate-500">About 2 minutes · {startMeta}</span>
        </div>
      </div>
      <div className="grid gap-4 p-6 sm:grid-cols-3">
        {[
          {
            icon: ClipboardList,
            title: "1. Show what you know",
            body: "Answer five diagnostic questions. Every response is evidence, not a grade.",
          },
          {
            icon: BookOpen,
            title: "2. Learn the exact gap",
            body: "A personalised lesson and guided practice target the prerequisite skill behind the errors.",
          },
          {
            icon: Target,
            title: "3. Prove the recovery",
            body: "Fresh mastery questions check whether the understanding transferred, with a second attempt if needed.",
          },
        ].map((step) => (
          <div key={step.title} className="rounded-xl border border-slate-200 bg-white p-4">
            <span className="inline-flex rounded-lg bg-slate-100 p-2 text-slate-600">
              <step.icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <p className="mt-2.5 text-sm font-semibold text-ink-950">{step.title}</p>
            <p className="mt-1 text-xs leading-5 text-slate-600">{step.body}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function LearningCycle({
  learner,
  session,
  hasData = false,
  loading = false,
  busy = false,
  error = null,
  liveEvents = [],
  onRefresh,
  onStart,
  onSubmitDiagnostic,
  onCheckPractice,
  onFinishPractice,
  onSubmitMastery,
  headerExtra = null,
  startMeta = "no sign-in required",
}) {
  const [diagnosticAnswers, setDiagnosticAnswers] = useState({});
  const [practiceAnswers, setPracticeAnswers] = useState({});
  const [masteryAnswers, setMasteryAnswers] = useState({});
  const [view, setView] = useState("lesson");

  useEffect(() => {
    if (!session) return;

    setView("lesson");

    if (session.status === "diagnostic") {
      setDiagnosticAnswers({ ...(session.diagnostic.answers || {}) });
      setMasteryAnswers({});
      setPracticeAnswers({});
      return;
    }

    if (session.status === "learning" || session.status === "retry") {
      const attempt = lastAttempt(session);
      setPracticeAnswers({ ...(attempt?.practice?.answers || {}) });
      setMasteryAnswers({});
      return;
    }

    if (session.status === "mastery") {
      const attempt = lastAttempt(session);
      setMasteryAnswers({ ...(attempt?.mastery?.answers || {}) });
    }
  }, [session?.id, session?.status, session?.attempt]);

  if (loading && !hasData) {
    return (
      <div className="flex min-h-[55vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-sm text-slate-500">
          <Spinner className="h-6 w-6" />
          Loading the learning workspace…
        </div>
      </div>
    );
  }

  if (error && !hasData) {
    return (
      <Card className="mx-auto max-w-xl p-6 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-rose-500" aria-hidden="true" />
        <h1 className="mt-3 text-xl font-bold">This learning workspace could not be loaded</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">{error}</p>
        <Button className="mt-5" icon={RefreshCw} onClick={onRefresh}>
          Try again
        </Button>
      </Card>
    );
  }

  const statusKey =
    (session?.status === "complete"
      ? lastAttempt(session)?.mastery?.result?.thresholdMet
        ? "complete_pass"
        : "complete_support"
      : session?.status) ||
    learner?.status ||
    "not_started";
  const status = STATUS_META[statusKey] || STATUS_META.not_started;
  const attempt = lastAttempt(session);
  const firstName = (learner?.name || "Learner").split(" ")[0];

  const renderStage = () => {
    if (!session) {
      return (
        <StartCard
          learner={learner}
          onStart={() => onStart(false)}
          busy={busy}
          startMeta={startMeta}
        />
      );
    }

    if (busy && session.status === "diagnostic") {
      return <AnalysisCard session={session} onRefresh={onRefresh} busy={busy} liveEvents={liveEvents} />;
    }

    if (session.status === "analyzing") {
      return <AnalysisCard session={session} onRefresh={onRefresh} busy={loading} liveEvents={liveEvents} />;
    }

    if (session.status === "diagnostic") {
      return (
        <Questionnaire
          key={`${session.id}-diagnostic`}
          eyebrow="Diagnostic · Assessment Agent"
          title="Let's find the pattern"
          description="No timer and no grade. A wrong answer is useful evidence, and a single slip will be treated as a hypothesis rather than a verdict."
          icon={ClipboardList}
          questions={session.diagnostic.questions}
          answers={diagnosticAnswers}
          onAnswersChange={setDiagnosticAnswers}
          onSubmit={onSubmitDiagnostic}
          submitLabel="Analyse my answers"
          busy={busy}
          meta={<Badge tone="slate">{session.diagnostic.questions.length} questions</Badge>}
        />
      );
    }

    if (session.status === "learning" || session.status === "retry") {
      if (!attempt?.intervention) {
        return (
          <Alert tone="warning" title="The intervention is not available">
            The lesson content could not be loaded. Refresh the session or start again.
          </Alert>
        );
      }

      const practiceResult = attempt.practice?.result;

      return (
        <div className="space-y-4">
          {session.status === "retry" ? (
            <Alert tone="warning" title="The mastery threshold was not met yet">
              The first check reached {percent(session.attempts[0]?.mastery?.result?.scorePercent)}. This is an adapted
              attempt: the explanation is slower, the sign decision is separated from the calculation, and the practice
              questions are fresh.
            </Alert>
          ) : null}

          <DiagnosisCard diagnosis={session.diagnosis} />

          {practiceResult ? (
            <Alert tone={practiceResult.needsReteach ? "warning" : "success"} title="Tutor feedback">
              {practiceResult.feedbackSummary}
            </Alert>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-2 shadow-soft">
            <div className="flex gap-1" role="tablist" aria-label="Lesson and practice">
              {[
                { key: "lesson", label: "Lesson", icon: BookOpen },
                { key: "practice", label: "Guided practice", icon: Lightbulb },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={view === tab.key}
                  onClick={() => setView(tab.key)}
                  className={cx(
                    "inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition",
                    view === tab.key
                      ? "bg-ink-950 text-white shadow-sm"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                  )}
                >
                  <tab.icon className="h-4 w-4" aria-hidden="true" />
                  {tab.label}
                </button>
              ))}
            </div>
            <Badge tone={session.status === "retry" ? "amber" : "mint"}>
              Attempt {attempt.attempt} of 2
            </Badge>
          </div>

          {view === "lesson" ? (
            <div className="space-y-4">
              <LessonPanel intervention={attempt.intervention} />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="max-w-xl text-xs leading-5 text-slate-500">
                  The Tutor Agent checks each practice answer and offers a hint before revealing the answer.
                </p>
                <Button variant="mint" icon={ArrowRight} onClick={() => setView("practice")}>
                  Go to guided practice
                </Button>
              </div>
            </div>
          ) : (
            <PracticePanel
              key={`${session.id}-${attempt.attempt}`}
              intervention={attempt.intervention}
              sessionId={session.id}
              attemptNumber={attempt.attempt}
              savedAnswers={practiceAnswers}
              onCheck={onCheckPractice}
              onFinish={onFinishPractice}
              busy={busy}
            />
          )}
        </div>
      );
    }

    if (session.status === "mastery") {
      const mastery = attempt?.mastery;
      if (!mastery) {
        return (
          <Alert tone="warning" title="The mastery check is not ready">
            Refresh the session to load the follow-up questions.
          </Alert>
        );
      }

      return (
        <div className="space-y-4">
          <Alert tone="success" title="Practice complete — the mastery check is ready">
            {attempt.practice?.result?.feedbackSummary} This check uses new questions on the same skill. You need{" "}
            {session.threshold}% to complete the cycle.
          </Alert>
          <Questionnaire
            key={`${session.id}-mastery-${attempt.attempt}`}
            eyebrow={`Mastery check · attempt ${attempt.attempt} of 2`}
            title="Show what changed"
            description="These questions are different from the diagnostic and the practice set. They test whether the rule transfers, not whether you remember the earlier answers."
            icon={Target}
            questions={mastery.questions}
            answers={masteryAnswers}
            onAnswersChange={setMasteryAnswers}
            onSubmit={onSubmitMastery}
            submitLabel="Submit mastery check"
            busy={busy}
            meta={<Badge tone={session.status === "retry" ? "amber" : "sky"}>{session.threshold}% to pass</Badge>}
            footerNote="The Mastery Agent evaluates the answers, then either writes the teacher insight or adapts the intervention once more."
          />
        </div>
      );
    }

    if (session.status === "complete") {
      return (
        <ResultSummary
          session={session}
          onRestart={() => onStart(false)}
          restarting={busy}
          restartLabel="Start another recovery cycle"
        />
      );
    }

    if (session.status === "error") {
      return (
        <div className="space-y-4">
          <Alert tone="error" title="This cycle stopped before it finished">
            {session.error || "An agent step failed. You can restart the cycle."}
          </Alert>
          <Button variant="danger" icon={RotateCcw} onClick={() => onStart(true)} loading={busy}>
            Restart the diagnostic
          </Button>
        </div>
      );
    }

    return (
      <StartCard
        learner={learner}
        onStart={() => onStart(false)}
        busy={busy}
        startMeta={startMeta}
      />
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Learning workspace</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
            {learner ? `${firstName}'s recovery cycle` : "Learning workspace"}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {learner ? `Grade ${learner.grade} · ${learner.subject} · ${learner.topic}` : "Grade 9 Mathematics"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {headerExtra}
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
      </div>

      <div className="min-w-0">{renderStage()}</div>
    </div>
  );
}
