import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArchiveRestore, ArrowRight, BookOpen, MailCheck, Plus, RefreshCw, Users } from "lucide-react";
import { api } from "../../lib/api.js";
import { useApp } from "../../context/AppContext.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Modal,
  SectionHeading,
  Spinner,
  StatCard,
} from "../../components/ui.jsx";
import { Field, inputClasses } from "../../components/forms.jsx";
import CopyButton from "../../components/CopyButton.jsx";
import { formatDate } from "../../lib/format.js";

const EMPTY_FORM = { name: "", subject: "Mathematics", grade: "9", consent: false };

export default function TeacherClasses() {
  const { user, refresh } = useAuth();
  const { notify } = useApp();

  const [classes, setClasses] = useState([]);
  const [archived, setArchived] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");
  const [sendingVerification, setSendingVerification] = useState(false);
  const [restoringId, setRestoringId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [active, archivedClasses] = await Promise.all([
        api.classes(),
        api.archivedClasses(),
      ]);
      setClasses(active.classes);
      setArchived(archivedClasses.classes);
      setError(null);
    } catch (err) {
      if (err.status === 401) {
        await refresh();
        return;
      }
      if (err.status === 403) {
        // Email verification can be enforced server-side. The dashboard banner
        // explains how to resend the link, so keep the page usable.
        setClasses([]);
        setArchived([]);
        setError(null);
        return;
      }
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  useEffect(() => {
    load();
  }, [load]);

  const update = (key) => (event) => {
    const value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setFormError("");

    if (form.name.trim().length < 2) {
      setFormError("Give the class a name of at least 2 characters.");
      return;
    }

    if (!form.consent) {
      setFormError("Confirm that you have permission to create student accounts.");
      return;
    }

    setCreating(true);
    try {
      await api.createClass({
        name: form.name.trim(),
        subject: form.subject.trim() || "Mathematics",
        grade: form.grade === "" ? null : Number(form.grade),
        consentAttested: true,
      });
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      notify("Class created. Share the class code with your students.", "success");
      await load();
    } catch (err) {
      setFormError(err.message || "Could not create the class.");
    } finally {
      setCreating(false);
    }
  };

  const resendVerification = async () => {
    setSendingVerification(true);
    try {
      const result = await api.resendTeacherVerification();
      notify(
        result.alreadyVerified
          ? "Your email is already verified."
          : "Verification email sent. Check your inbox.",
        "success",
      );
      await refresh();
    } catch (err) {
      notify(err.message || "Could not send the verification email.", "error");
    } finally {
      setSendingVerification(false);
    }
  };

  const restore = async (classroom) => {
    setRestoringId(classroom.id);
    try {
      await api.restoreClass(classroom.id);
      notify(`${classroom.name} restored.`, "success");
      await load();
    } catch (err) {
      notify(err.message || "Could not restore the class.", "error");
    } finally {
      setRestoringId(null);
    }
  };

  const totalStudents = classes.reduce((sum, item) => sum + (item.studentCount || 0), 0);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-3 text-sm text-slate-600">
        <Spinner />
        Loading your classes…
      </div>
    );
  }

  if (error?.status === 503) {
    return (
      <Alert tone="warning" title="The classroom database is not configured">
        Set <code className="rounded bg-white/60 px-1 py-0.5 font-mono text-xs">DATABASE_URL</code> on the
        server, run <code className="rounded bg-white/60 px-1 py-0.5 font-mono text-xs">npm run db:migrate</code>,
        then reload. The demo workspace still works without a database.
      </Alert>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Alert tone="error" title="Could not load your classes">
          {error.message}
        </Alert>
        <Button variant="secondary" icon={RefreshCw} onClick={load}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <SectionHeading
        eyebrow={`Welcome, ${user?.teacher?.name || "teacher"}`}
        title="Your classes"
        description="Create a class, add your roster and share the class code. Students join with their name and a one-time PIN."
        action={
          <Button variant="mint" icon={Plus} onClick={() => setCreateOpen(true)}>
            New class
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Classes" value={classes.length} icon={BookOpen} />
        <StatCard label="Students" value={totalStudents} icon={Users} tone="sky" />
        <StatCard
          label="Class codes"
          value={classes.length}
          hint="Each code is unique to one class."
          icon={ArrowRight}
          tone="slate"
        />
      </div>

      {user?.teacher && !user.teacher.emailVerified ? (
        <Alert tone="warning" title="Verify your email address">
          <div className="space-y-3">
            <p>
              We sent a verification link to{" "}
              <span className="font-semibold text-amber-900">{user.teacher.email}</span>. Verifying makes
              account recovery safer and lets the pilot contact you about your classes.
            </p>
            <Button
              variant="secondary"
              size="sm"
              icon={MailCheck}
              loading={sendingVerification}
              onClick={resendVerification}
            >
              Resend verification email
            </Button>
          </div>
        </Alert>
      ) : null}

      {classes.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Create your first class"
          description="A class holds one roster. Add students after creating it, then give each student their class code and PIN."
          action={
            <Button variant="mint" icon={Plus} onClick={() => setCreateOpen(true)}>
              New class
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-5 md:grid-cols-2">
          {classes.map((classroom) => (
            <li key={classroom.id}>
              <Card className="flex h-full flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-bold">{classroom.name}</h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {classroom.subject}
                      {classroom.grade ? ` · Grade ${classroom.grade}` : ""}
                    </p>
                  </div>
                  <Badge tone="mint" icon={Users}>
                    {classroom.studentCount} {classroom.studentCount === 1 ? "student" : "students"}
                  </Badge>
                </div>

                <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Class code
                  </p>
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                    <p className="font-mono text-xl font-bold tracking-[0.22em] text-ink-950">
                      {classroom.joinCode}
                    </p>
                    <CopyButton value={classroom.joinCode} label="Copy code" />
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                  <Link
                    to={`/portal/teacher/classes/${classroom.id}`}
                    className="inline-flex items-center gap-2 rounded-xl bg-ink-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ink-800"
                  >
                    Open roster
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                  <span className="text-[11px] text-slate-400">
                    {classroom.studentCount === 0 ? "No students yet" : "Roster ready"}
                  </span>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {archived.length > 0 ? (
        <section className="space-y-4">
          <SectionHeading
            title={`Archived classes · ${archived.length}`}
            description="Archived classes keep their roster and history but students cannot sign in to them. Restore one to use it again."
          />
          <ul className="grid gap-4 md:grid-cols-2">
            {archived.map((classroom) => (
              <li key={classroom.id}>
                <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink-950">{classroom.name}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {classroom.subject}
                      {classroom.grade ? ` · Grade ${classroom.grade}` : ""} · {classroom.studentCount}{" "}
                      {classroom.studentCount === 1 ? "student" : "students"}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Archived {formatDate(classroom.archivedAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      to={`/portal/teacher/classes/${classroom.id}`}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      View
                    </Link>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={ArchiveRestore}
                      loading={restoringId === classroom.id}
                      onClick={() => restore(classroom)}
                    >
                      Restore
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Modal
        open={createOpen}
        onClose={() => (creating ? null : setCreateOpen(false))}
        title="Create a class"
        description="The server generates a unique class code. You can add students as soon as the class exists."
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancel
            </Button>
            <Button variant="mint" icon={Plus} onClick={submit} loading={creating}>
              Create class
            </Button>
          </>
        }
      >
        <form onSubmit={submit} className="space-y-4" noValidate>
          {formError ? <Alert tone="error">{formError}</Alert> : null}

          <Field id="className" label="Class name">
            <input
              id="className"
              type="text"
              required
              maxLength={80}
              value={form.name}
              onChange={update("name")}
              className={inputClasses}
              placeholder="Grade 9 Maths A"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="classSubject" label="Subject">
              <input
                id="classSubject"
                type="text"
                maxLength={80}
                value={form.subject}
                onChange={update("subject")}
                className={inputClasses}
                placeholder="Mathematics"
              />
            </Field>

            <Field id="classGrade" label="Grade" hint="Optional.">
              <select id="classGrade" value={form.grade} onChange={update("grade")} className={inputClasses}>
                <option value="">Not set</option>
                {[8, 9, 10, 11, 12].map((grade) => (
                  <option key={grade} value={grade}>
                    Grade {grade}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
            <span className="inline-flex items-center gap-1.5 font-semibold">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              Pilot data
            </span>
            <p className="mt-1">
              Student accounts hold a display name and a hashed PIN. Learning answers, scores and timestamps
              are stored so you can see progress. Only enrol learners you are authorised to teach.
            </p>
          </div>

          <label
            htmlFor="classConsent"
            className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-700"
          >
            <input
              id="classConsent"
              type="checkbox"
              checked={form.consent}
              onChange={update("consent")}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-mint-600 focus:ring-2 focus:ring-mint-500"
            />
            <span>
              I confirm that I have the school or guardian permission needed to create accounts for the
              students in this class, and that I have shared the{" "}
              <Link to="/privacy" className="font-semibold text-mint-700 underline hover:text-mint-800">
                privacy notice
              </Link>{" "}
              with them or their guardians.
            </span>
          </label>
        </form>
      </Modal>
    </div>
  );
}
