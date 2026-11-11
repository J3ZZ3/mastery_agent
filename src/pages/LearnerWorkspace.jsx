import { useCallback, useEffect, useState } from "react";
import { useApp } from "../context/AppContext.jsx";
import { api } from "../lib/api.js";
import { useAgentStream } from "../lib/useAgentStream.js";
import LearningCycle from "../components/LearningCycle.jsx";

const IN_PROGRESS = ["diagnostic", "analyzing", "learning", "retry", "mastery"];

export default function LearnerWorkspace() {
  const {
    learners,
    selectedLearner,
    selectedLearnerId,
    setSelectedLearnerId,
    refreshLearners,
    notify,
    loading: appLoading,
  } = useApp();

  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const data = await api.learnerProgress(selectedLearnerId);
        setProgress(data);
        setError(null);
      } catch (loadError) {
        setError(loadError.message || "Could not load this learner.");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [selectedLearnerId],
  );

  useEffect(() => {
    setLoading(true);
    setProgress(null);
    load();
  }, [load]);

  const session = progress?.currentSession || null;
  const learner = selectedLearner || progress?.learner;
  const liveEvents = useAgentStream(session?.id, session?.events || []);

  useEffect(() => {
    if (session?.status !== "analyzing" || busy) return undefined;
    const timer = setInterval(() => load(true), 3000);
    return () => clearInterval(timer);
  }, [session?.id, session?.status, busy, load]);

  const applySession = useCallback(
    (nextSession) => {
      setProgress((current) =>
        current
          ? {
              ...current,
              currentSession: nextSession,
              activeSession: IN_PROGRESS.includes(nextSession.status) ? nextSession : null,
            }
          : current,
      );
      refreshLearners().catch(() => {});
    },
    [refreshLearners],
  );

  const startSession = async (restart = false) => {
    setBusy(true);
    setError(null);
    try {
      const data = await api.createSession({ learnerId: selectedLearnerId, restart });
      applySession(data.session);
      if (data.learner) {
        setProgress((current) => (current ? { ...current, learner: data.learner } : current));
      }
      notify(
        data.resumed
          ? "Resumed the saved learning cycle."
          : "Diagnostic ready. Answer all five questions, then submit.",
        "success",
      );
    } catch (startError) {
      setError(startError.message || "Could not start the cycle.");
      notify(startError.message || "Could not start the cycle.", "error");
    } finally {
      setBusy(false);
    }
  };

  const submitDiagnostic = async (answers) => {
    setBusy(true);
    try {
      const data = await api.submitDiagnostic(session.id, answers);
      applySession(data.session);
      notify("Diagnosis ready and a personalised lesson has been designed.", "success");
    } catch (submitError) {
      notify(submitError.message || "Could not analyse the diagnostic.", "error");
    } finally {
      setBusy(false);
    }
  };

  const checkPractice = async (questionId, answer) => {
    try {
      const data = await api.checkPractice(session.id, questionId, answer);
      return data.check;
    } catch (checkError) {
      notify(checkError.message || "Could not check that answer.", "error");
      return {
        correct: false,
        feedback: "The tutor could not check that answer.",
        hint: checkError.message || "Try again in a moment.",
      };
    }
  };

  const finishPractice = async (answers) => {
    setBusy(true);
    try {
      const data = await api.submitPractice(session.id, answers);
      applySession(data.session);
      notify("Practice reviewed. Your mastery check is ready — new questions, same skill.", "success");
    } catch (submitError) {
      notify(submitError.message || "Could not complete the practice set.", "error");
    } finally {
      setBusy(false);
    }
  };

  const submitMastery = async (answers) => {
    setBusy(true);
    try {
      const data = await api.submitMastery(session.id, answers);
      applySession(data.session);
      if (data.session.status === "complete") {
        notify("Recovery cycle complete. Your teacher insight is ready.", "success");
      } else if (data.session.status === "retry") {
        notify("The mastery threshold was not met, so the intervention has been adapted.", "info");
      }
    } catch (submitError) {
      notify(submitError.message || "Could not evaluate the mastery check.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <LearningCycle
      learner={learner}
      session={session}
      hasData={Boolean(progress)}
      loading={appLoading || (loading && !progress)}
      busy={busy}
      error={error}
      liveEvents={liveEvents}
      onRefresh={() => load(true)}
      onStart={startSession}
      onSubmitDiagnostic={submitDiagnostic}
      onCheckPractice={checkPractice}
      onFinishPractice={finishPractice}
      onSubmitMastery={submitMastery}
      headerExtra={
        <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 shadow-sm">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Demo learner</span>
          <select
            value={selectedLearnerId}
            onChange={(event) => setSelectedLearnerId(event.target.value)}
            className="max-w-[10rem] bg-transparent text-sm font-semibold text-ink-950 focus:outline-none"
            aria-label="Choose a demo learner"
          >
            {learners.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      }
      startMeta={learner?.isDemo ? "demo answers pre-filled" : "no sign-in required"}
      activityLink
    />
  );
}
