import { Link } from "react-router-dom";
import { ArrowRight, GraduationCap, ShieldCheck, Sparkles, Users } from "lucide-react";
import { Card } from "../../components/ui.jsx";

export default function PortalLanding() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link to="/portal" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-mint-500 text-sm font-black text-ink-950">
              M
            </span>
            <span>
              <span className="block text-sm font-black tracking-[0.14em] text-ink-950">MASTERY</span>
              <span className="block text-[10px] font-medium text-slate-500">Classroom pilot</span>
            </span>
          </Link>
          <Link to="/" className="text-xs font-semibold text-slate-500 transition hover:text-ink-950">
            Demo workspace
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
        <p className="eyebrow">Per-class tenancy</p>
        <h1 className="mt-2 max-w-2xl text-3xl font-bold leading-tight sm:text-4xl">
          One teacher. One class. Every student accounted for.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
          MASTERY now supports real classroom rosters. Teachers create a class, add students and issue a
          one-time PIN. Students join with a class code and their name. No student email addresses required.
        </p>

        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          <Link to="/portal/teacher/login" className="group block">
            <Card className="h-full p-6 transition group-hover:-translate-y-0.5 group-hover:shadow-lift">
              <span className="inline-flex rounded-xl bg-mint-50 p-3 text-mint-700 ring-1 ring-inset ring-mint-200">
                <Users className="h-6 w-6" aria-hidden="true" />
              </span>
              <h2 className="mt-4 text-xl font-bold">I'm a teacher</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Sign in to manage classes, add students, reset PINs and share a class code.
              </p>
              <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-mint-700">
                Teacher sign in
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden="true" />
              </span>
            </Card>
          </Link>

          <Link to="/portal/student" className="group block">
            <Card className="h-full p-6 transition group-hover:-translate-y-0.5 group-hover:shadow-lift">
              <span className="inline-flex rounded-xl bg-sky-50 p-3 text-sky-700 ring-1 ring-inset ring-sky-200">
                <GraduationCap className="h-6 w-6" aria-hidden="true" />
              </span>
              <h2 className="mt-4 text-xl font-bold">I'm a student</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Join your class with the code and PIN your teacher gave you. No email or password needed.
              </p>
              <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-sky-700">
                Join a class
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden="true" />
              </span>
            </Card>
          </Link>
        </div>

        <Card className="mt-8 p-6">
          <div className="flex items-start gap-3">
            <span className="rounded-xl bg-ink-950 p-2.5 text-mint-300">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-base font-bold">How the pilot works</h2>
              <ol className="mt-3 grid gap-3 text-sm leading-6 text-slate-600 sm:grid-cols-3">
                <li>
                  <span className="font-semibold text-ink-950">1. Create a class.</span> The server issues a
                  short class code.
                </li>
                <li>
                  <span className="font-semibold text-ink-950">2. Add your roster.</span> Each student gets a
                  4-digit PIN shown once.
                </li>
                <li>
                  <span className="font-semibold text-ink-950">3. Students join.</span> Class code + name + PIN
                  opens their own session.
                </li>
              </ol>
            </div>
          </div>
        </Card>

        <p className="mt-8 flex items-start gap-2 text-xs leading-5 text-slate-500">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-mint-600" aria-hidden="true" />
          Student accounts hold a display name and a hashed PIN only. This is a pilot: review the privacy
          notice and guardian consent requirements before using real learner data.
        </p>
      </main>
    </div>
  );
}
