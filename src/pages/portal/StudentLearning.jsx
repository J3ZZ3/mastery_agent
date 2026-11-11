import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext.jsx";
import { useApp } from "../../context/AppContext.jsx";
import { api } from "../../lib/api.js";
import { useAgentStream } from "../../lib/useAgentStream.js";
import LearningCycle from "../../components/LearningCycle.jsx";

const IN_PROGRESS = ["diagnostic", "analyzing", "learning", "retry", "mastery"];

export default function StudentLearning() {
  const { user, refresh } = useAuth();
  const { notify } = useApp();
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const data = await api.studentProgress();
        setProgress(data);
        setError(null);
      } catch (loadError) {
        if (loadError.status === 401) {
          refresh();
          return;
        }
        setError(loadError.message || "Could not load your learning cycle.");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [refresh],
  );

  useEffect(() => {
    load();
  }, [load]);

  const session = progress?.currentSession || null;
  const learner = progress?.learner || null;
  const liveEvents = useAgentStream(session?.id, session?.events || [], {
    eventsUrl: session ? `/api/student/sessions/${session.id}/events` : undefined,
    fetchSession: api.studentSession,
  });

  useEffect(() => {
    if (session?.status !== "analyzing" || busy) return undefined;
    const timer = setInterval(() => load(true), 3000);
    return () => clearInterval(timer);
  }, [session?.id, session?.status, busy, load]);

  const applySession = useCallback((nextSession) => {
    setProgress((current) =>
      current
        ? {
            ...current,
            currentSession: nextSession,
            activeSession: IN_PROGRESS.includes(nextSession.status) ? nextSession : null,
          }
        : current,
    );
  }, []);

  const startSession = async (restart = false) => {
    setBusy(true);
    setError(null);
    try {
      const data = await api.startStudentSession({ restart });
      setProgress((current) => ({
        ...(current || {}),
        learner: data.learner,
        currentSession: data.session,
        activeSession: IN_PROGRESS.includes(data.session.status) ? data.session : null,
      }));
      notify(
        data.resumed
          ? "Resumed your saved learning cycle."
          : "Diagnostic ready. Answer all five questions, then submit.",
        "success",
      );
    } catch (startError) {
      setError(startError.message || "Could not start your learning cycle.");
      notify(startError.message || "Could not start your learning cycle.", "error");
    } finally {
      setBusy(false);
    }
  };

  const submitDiagnostic = async (answers) => {
    setBusy(true);
    try {
      const data = await api.submitStudentDiagnostic(session.id, answers);
      applySession(data.session);
      notify("Diagnosis ready and a personalised lesson has been designed.", "success");
      load(true).catch(() => {});
    } catch (submitError) {
      notify(submitError.message || "Could not analyse the diagnostic.", "error");
    } finally {
      setBusy(false);
    }
  };

  const checkPractice = async (questionId, answer) => {
    try {
      const data = await api.checkStudentPractice(session.id, questionId, answer);
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
      const data = await api.submitStudentPractice(session.id, answers);
      applySession(data.session);
      notify("Practice reviewed. Your mastery check is ready — new questions, same skill.", "success");
      load(true).catch(() => {});
    } catch (submitError) {
      notify(submitError.message || "Could not complete the practice set.", "error");
    } finally {
      setBusy(false);
    }
  };

  const submitMastery = async (answers) => {
    setBusy(true);
    try {
      const data = await api.submitStudentMastery(session.id, answers);
      applySession(data.session);
      if (data.session.status === "complete") {
        notify("Recovery cycle complete. Your teacher can now see the evidence.", "success");
      } else if (data.session.status === "retry") {
        notify("The mastery threshold was not met, so the intervention has been adapted.", "info");
      }
      load(true).catch(() => {});
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
      loading={loading && !progress}
      busy={busy}
      error={error}
      liveEvents={liveEvents}
      onRefresh={() => load(true)}
      onStart={startSession}
      onSubmitDiagnostic={submitDiagnostic}
      onCheckPractice={checkPractice}
      onFinishPractice={finishPractice}
      onSubmitMastery={submitMastery}
      startMeta={`signed in as ${user?.student?.displayName || "you"}`}
      activityLink={false}
    />
  );
}
