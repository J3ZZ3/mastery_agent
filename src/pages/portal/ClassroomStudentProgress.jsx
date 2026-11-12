import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  ClipboardList,
  Lightbulb,
  RefreshCw,
  Target,
  Trash2,
} from "lucide-react";
import { api } from "../../lib/api.js";
import { useApp } from "../../context/AppContext.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { GAP_COPY, STATUS_META } from "../../lib/constants.js";
import { formatDateTime, lastAttempt, percent, relativeTime, signedPoints } from "../../lib/format.js";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Modal,
  ProgressBar,
  Spinner,
} from "../../components/ui.jsx";
import AttemptCard from "../../components/AttemptCard.jsx";
import DiagnosisCard from "../../components/DiagnosisCard.jsx";
import TeacherInsightPanel from "../../components/TeacherInsightPanel.jsx";
import { cx } from "../../lib/cx.js";

function Metric({ label, value, hint, tone = "slate" }) {
  const tones = {
    mint: "text-mint-700",
    amber: "text-amber-700",
    sky: "text-sky-700",
    slate: "text-slate-800",
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={cx("mt-1 text-xl font-bold tabular-nums", tones[tone] || tones.slate)}>{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] leading-4 text-slate-500">{hint}</p> : null}
    </div>
  );
}

function statusKeyFor(session) {
  if (!session) return "not_started";
  if (session.status === "complete") {
    return lastAttempt(session)?.mastery?.result?.thresholdMet
      ? "complete_pass"
      : "complete_support";
  }
  return session.status;
}

export default function ClassroomStudentProgress() {
  const { classId, studentId } = useParams();
  const { notify } = useApp();
  const { refresh } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(
    async (silent = false) => {
      if (silent) setRefreshing(true);
      try {
        setData(await api.classStudentProgress(classId, studentId));
        setError(null);
      } catch (loadError) {
        if (loadError.status === 401) {
          await refresh();
          return;
        }
        setError(loadError);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [classId, studentId, refresh],
  );

  useEffect(() => {
    setLoading(true);
    setData(null);
    load();
  }, [load]);

  const confirmDeleteHistory = async () => {
    setDeleting(true);
    try {
      const result = await api.deleteStudentHistory(classId, studentId);
      setDeleteOpen(false);
      notify(
        `Deleted ${result.deletedSessions} learning session${result.deletedSessions === 1 ? "" : "s"}.`,
        "success",
      );
      await load();
    } catch (err) {
      notify(err.message || "Could not delete the learning history.", "error");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[55vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-sm text-slate-500">
          <Spinner className="h-6 w-6" />
          Loading the student evidence…
        </div>
      </div>
    );
  }

  if (error?.status === 404) {
    return (
      <Card className="mx-auto max-w-lg p-8 text-center">
        <h1 className="text-xl font-bold">Student not found</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          This student does not exist in this class, or the class belongs to another teacher.
        </p>
        <Link
          to="/portal/teacher"
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-ink-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ink-800"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to classes
        </Link>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <Alert tone="error" title="Could not load this student">
          {error?.message || "Student not found."}
        </Alert>
        <Button variant="secondary" icon={RefreshCw} onClick={() => load()}>
          Try again
        </Button>
      </div>
    );
  }

  const { class: classroom, student, learner, currentSession: session, sessions } = data;
  const statusKey = statusKeyFor(session) || learner.status;
  const status = STATUS_META[statusKey] || STATUS_META.not_started;
  const attempt = lastAttempt(session);
  const mastery = attempt?.mastery?.result;
  const practice = attempt?.practice?.result;
  const report = session?.diagnostic?.report;
  const passed = Boolean(mastery?.thresholdMet);

  return (
    <div className="space-y-6">
      <Link
        to={`/portal/teacher/classes/${classId}`}
        className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-ink-950"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to {classroom.name}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Avatar name={student.displayName} accent="sky" size="lg" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{student.displayName}</h1>
              <Badge tone={status.tone}>{status.label}</Badge>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {classroom.name}
              {classroom.grade ? ` · Grade ${classroom.grade}` : ""} · {classroom.subject}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {learner.lastActivityAt
                ? `Last activity ${relativeTime(learner.lastActivityAt)}`
                : student.lastSeenAt
                  ? `Last seen ${relativeTime(student.lastSeenAt)}`
                  : "Never signed in"}{" "}
              · {learner.completedCycles} completed cycle{learner.completedCycles === 1 ? "" : "s"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => load(true)} loading={refreshing}>
            Refresh
          </Button>
          <Button variant="danger" size="sm" icon={Trash2} onClick={() => setDeleteOpen(true)}>
            Delete history
          </Button>
        </div>
      </div>

      {!session ? (
        <EmptyState
          icon={ClipboardList}
          title={`${student.displayName} has not started a learning cycle yet`}
          description="Once the student starts the diagnostic, this page will show the diagnosis, the intervention path, the mastery result and the Teacher Insight summary."
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              label="Initial diagnostic"
              value={
                report ? `${report.correctAnswers}/${report.totalQuestions} · ${percent(report.scorePercent)}` : "—"
              }
              hint={
                report
                  ? `${report.identifiedPatterns.length} pattern${report.identifiedPatterns.length === 1 ? "" : "s"} identified`
                  : "Not submitted"
              }
              tone="sky"
            />
            <Metric
              label="Tutor practice"
              value={practice ? `${practice.correct}/${practice.total} · ${percent(practice.scorePercent)}` : "—"}
              hint={practice ? "Final practice set" : "Not completed"}
              tone="mint"
            />
            <Metric
              label="Latest mastery"
              value={mastery ? `${mastery.correct}/${mastery.total} · ${percent(mastery.scorePercent)}` : "—"}
              hint={
                mastery
                  ? `${passed ? "Threshold met" : "Below threshold"} · ${session.threshold}% required`
                  : "Not submitted"
              }
              tone={passed ? "mint" : mastery ? "amber" : "slate"}
            />
            <Metric
              label="Attempts used"
              value={`${session.attempts.length} of 2`}
              hint={mastery?.comparison ? `${signedPoints(mastery.comparison.delta)} from diagnostic` : "Awaiting mastery"}
              tone="slate"
            />
          </div>

          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-slate-400" aria-hidden="true" />
                <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">Cycle progress</h2>
              </div>
              <Badge tone={status.tone}>{status.label}</Badge>
            </div>
            <div className="mt-3">
              <ProgressBar value={learner.progressPercent} label="Recovery progress" showValue />
            </div>

            {sessions.length > 1 ? (
              <div className="mt-4">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Previous cycles
                </p>
                <ul className="mt-2 space-y-2">
                  {sessions
                    .filter((entry) => entry.id !== session.id)
                    .map((entry) => {
                      const entryStatus =
                        STATUS_META[
                          entry.status === "complete"
                            ? entry.masteryMet
                              ? "complete_pass"
                              : "complete_support"
                            : entry.status
                        ] || STATUS_META.not_started;
                      return (
                        <li
                          key={entry.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs"
                        >
                          <span className="text-slate-600">{formatDateTime(entry.createdAt)}</span>
                          <span className="flex items-center gap-2">
                            <Badge tone={entryStatus.tone}>{entryStatus.label}</Badge>
                            <span className="font-semibold tabular-nums text-slate-700">
                              {entry.latestScore === null || entry.latestScore === undefined
                                ? "—"
                                : percent(entry.latestScore)}
                            </span>
                          </span>
                        </li>
                      );
                    })}
                </ul>
              </div>
            ) : null}
          </Card>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-5">
              {session.diagnosis ? <DiagnosisCard diagnosis={session.diagnosis} /> : null}

              <Card className="p-5">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">
                    Intervention and mastery path
                  </h2>
                </div>
                {session.attempts.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-600">
                    The Learning Designer has not produced an intervention yet.
                  </p>
                ) : (
                  <ol className="mt-4 space-y-3">
                    {session.attempts.map((entry, index) => (
                      <AttemptCard
                        key={entry.attempt}
                        attempt={entry}
                        isLatest={index === session.attempts.length - 1}
                      />
                    ))}
                  </ol>
                )}
              </Card>

              {mastery ? (
                <Card className="p-5">
                  <div className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-slate-400" aria-hidden="true" />
                    <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">
                      Mastery comparison
                    </h2>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Diagnostic</p>
                      <p className="mt-1 text-xl font-bold tabular-nums text-slate-800">
                        {percent(mastery.comparison.initialScore)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Follow-up</p>
                      <p className="mt-1 text-xl font-bold tabular-nums text-slate-800">
                        {percent(mastery.comparison.latestScore)}
                      </p>
                    </div>
                    <div className={cx("rounded-xl p-3", passed ? "bg-mint-50" : "bg-amber-50")}>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Change</p>
                      <p
                        className={cx(
                          "mt-1 text-xl font-bold tabular-nums",
                          passed ? "text-mint-700" : "text-amber-700",
                        )}
                      >
                        {signedPoints(mastery.comparison.delta)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 space-y-2">
                    <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
                      <span className="font-semibold text-slate-700">What remains difficult: </span>
                      {mastery.remainingDifficulty}
                    </p>
                    <p
                      className={cx(
                        "rounded-lg px-3 py-2 text-xs leading-5",
                        passed ? "bg-mint-50 text-mint-900" : "bg-amber-50 text-amber-900",
                      )}
                    >
                      <span className="font-semibold">Mastery Agent recommendation: </span>
                      {mastery.recommendation}
                    </p>
                  </div>
                </Card>
              ) : null}
            </div>

            <div className="space-y-5 xl:sticky xl:top-24 xl:self-start">
              <TeacherInsightPanel
                insight={session.teacherInsight}
                pendingCopy="The Teacher Insight Agent runs after the final mastery check. This cycle is still in progress, so no summary has been generated yet."
              />

              <Card className="p-5">
                <div className="flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">Session facts</h2>
                </div>
                <dl className="mt-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-slate-500">Focus gap</dt>
                    <dd className="text-right font-semibold text-slate-800">
                      {session.diagnosis ? GAP_COPY[session.diagnosis.gapKey] || session.diagnosis.gapKey : "—"}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-slate-500">Started</dt>
                    <dd className="text-right font-semibold text-slate-800">{formatDateTime(session.createdAt)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-slate-500">Completed</dt>
                    <dd className="text-right font-semibold text-slate-800">{formatDateTime(session.completedAt)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-slate-500">Mastery threshold</dt>
                    <dd className="text-right font-semibold text-slate-800">{session.threshold}%</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-slate-500">Agent events</dt>
                    <dd className="text-right font-semibold text-slate-800">{session.events.length}</dd>
                  </div>
                </dl>
              </Card>

              {!passed && session.status === "complete" ? (
                <Alert tone="warning" title="Teacher action recommended">
                  The cycle is complete without meeting the mastery threshold. Use the evidence above to decide whether
                  to reteach the related concept, regroup learners, or schedule a short paper check.
                </Alert>
              ) : null}

              {passed ? (
                <Alert tone="success" title="Recovery demonstrated">
                  The learner met the mastery threshold on fresh questions. Keep a spaced review of signed arithmetic
                  in an upcoming lesson.
                </Alert>
              ) : null}
            </div>
          </div>
        </>
      )}

      {!session ? (
        <p className="flex items-start gap-2 text-xs leading-5 text-slate-500">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
          If the student says they started but this page is empty, ask them to open the learning workspace again — their
          cycle resumes where they left off.
        </p>
      ) : null}

      <Modal
        open={deleteOpen}
        onClose={() => (deleting ? null : setDeleteOpen(false))}
        title="Delete learning history"
        description="This permanently erases every learning session for this student, including diagnoses, mastery results and Teacher Insight."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="danger" icon={Trash2} onClick={confirmDeleteHistory} loading={deleting}>
              Delete history
            </Button>
          </>
        }
      >
        <p className="text-sm leading-6 text-slate-600">
          Erase the learning history for{" "}
          <span className="font-semibold text-ink-950">{student.displayName}</span>? They stay on the
          roster and can start a fresh cycle. This cannot be undone.
        </p>
      </Modal>
    </div>
  );
}
