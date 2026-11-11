import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, GraduationCap, KeyRound, Sparkles, Users } from "lucide-react";
import { api } from "../../lib/api.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { Alert, Badge, Card, SectionHeading } from "../../components/ui.jsx";
import CopyButton from "../../components/CopyButton.jsx";

export default function StudentHome() {
  const { user, refresh } = useAuth();
  const [data, setData] = useState(
    user ? { student: user.student, class: user.class } : null,
  );

  useEffect(() => {
    let active = true;
    api
      .studentClass()
      .then((result) => {
        if (active) setData(result);
      })
      .catch((err) => {
        if (active && err.status === 401) refresh();
      });
    return () => {
      active = false;
    };
  }, [refresh]);

  const classroom = data?.class;
  const student = data?.student;
  const joinLink = `${window.location.origin}/portal/student`;

  return (
    <div className="space-y-7">
      <SectionHeading
        eyebrow="Student workspace"
        title={`Hi, ${student?.displayName || "there"}`}
        description="This is your class. Keep your PIN private — it belongs to you, not to the class."
      />

      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="eyebrow">Your class</p>
              <h2 className="mt-1 text-2xl font-bold">{classroom?.name || "Class"}</h2>
              <p className="mt-1 text-sm text-slate-500">
                {classroom?.subject}
                {classroom?.grade ? ` · Grade ${classroom.grade}` : ""}
              </p>
            </div>
            <Badge tone="sky" icon={Users}>
              Student
            </Badge>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                Class code
              </p>
              <p className="mt-1 font-mono text-xl font-bold tracking-[0.22em] text-ink-950">
                {classroom?.joinCode || "—"}
              </p>
              {classroom?.joinCode ? (
                <div className="mt-2">
                  <CopyButton value={classroom.joinCode} label="Copy code" />
                </div>
              ) : null}
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                Your PIN
              </p>
              <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-ink-950">
                <KeyRound className="h-4 w-4 text-slate-400" aria-hidden="true" />
                Managed by your teacher
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                If you lose it, ask your teacher to reset it. Never share your PIN.
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-slate-200 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Join link
            </p>
            <p className="mt-1 truncate font-mono text-sm text-ink-950">{joinLink}</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Use this link on another device, then enter the class code, your name and your PIN.
            </p>
          </div>
        </Card>

        <Card className="flex flex-col p-6">
          <span className="inline-flex w-fit rounded-xl bg-mint-50 p-3 text-mint-700 ring-1 ring-inset ring-mint-200">
            <Sparkles className="h-6 w-6" aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-xl font-bold">Your learning cycle</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Your teacher will assign the diagnostic and intervention. The six agents then find the gap behind
            your mistakes, build a targeted lesson, coach your practice and check mastery with fresh questions.
          </p>

          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
            <p className="font-semibold">Pilot note</p>
            <p className="mt-1">
              Learning sessions are not yet linked to classroom accounts. You can preview the full six-agent
              flow in the demo workspace; session linking is the next milestone.
            </p>
          </div>

          <div className="mt-auto pt-5">
            <Link
              to="/learner"
              className="inline-flex items-center gap-2 rounded-xl bg-ink-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ink-800"
            >
              <BookOpen className="h-4 w-4" aria-hidden="true" />
              Preview the learning workspace
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-sky-50 p-2.5 text-sky-700 ring-1 ring-inset ring-sky-200">
            <GraduationCap className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-base font-bold">How to get help</h2>
            <ol className="mt-3 grid gap-3 text-sm leading-6 text-slate-600 sm:grid-cols-3">
              <li>
                <span className="font-semibold text-ink-950">1. Check your class code.</span> It is six letters
                and numbers, shown above.
              </li>
              <li>
                <span className="font-semibold text-ink-950">2. Use your roster name.</span> Type the same name
                your teacher added to the class.
              </li>
              <li>
                <span className="font-semibold text-ink-950">3. Ask for a PIN reset.</span> Your teacher can
                issue a new PIN at any time.
              </li>
            </ol>
          </div>
        </div>
      </Card>

      <Alert tone="info" title="Privacy">
        Your account holds your display name and a hashed PIN only. Do not enter personal information into
        answers or free-text fields.
      </Alert>
    </div>
  );
}
