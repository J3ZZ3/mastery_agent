import { Link } from "react-router-dom";
import { ArrowLeft, Sparkles } from "lucide-react";
import { Card } from "./ui.jsx";

export default function AuthLayout({ eyebrow, title, description, children, footer }) {
  return (
    <div className="min-h-screen bg-ink-950">
      <div className="mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
        <div className="text-white">
          <Link to="/portal" className="inline-flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-mint-500 text-sm font-black text-ink-950">
              M
            </span>
            <span>
              <span className="block text-sm font-black tracking-[0.16em]">MASTERY</span>
              <span className="block text-[10px] font-medium text-slate-400">Classroom</span>
            </span>
          </Link>

          <p className="mt-10 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-mint-200 ring-1 ring-inset ring-white/10">
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            One teacher · one class · one roster
          </p>

          <h1 className="mt-5 max-w-xl text-3xl font-bold leading-tight text-white sm:text-4xl">
            Find the gap behind the mistake, then close it.
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-7 text-slate-300">
            Six specialist agents assess, diagnose, design a lesson, coach practice and verify recovery.
            Teachers get the roster, the evidence and the next step. Students join with a class code and a PIN.
          </p>

          <ul className="mt-7 space-y-3 text-sm text-slate-300">
            <li className="flex items-start gap-3">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-mint-400" aria-hidden="true" />
              No student email addresses. A display name and a teacher-issued PIN are enough.
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-mint-400" aria-hidden="true" />
              Every class, student and result is isolated from other teachers.
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-mint-400" aria-hidden="true" />
              Scores and answer keys stay deterministic; the teacher keeps the final decision.
            </li>
          </ul>

          <Link
            to="/"
            className="mt-9 inline-flex items-center gap-2 text-xs font-semibold text-slate-400 transition hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Back to the demo workspace
          </Link>
        </div>

        <Card className="p-6 shadow-lift sm:p-8">
          <p className="eyebrow">{eyebrow}</p>
          <h2 className="mt-1.5 text-2xl font-bold">{title}</h2>
          {description ? <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p> : null}
          <div className="mt-6">{children}</div>
          {footer ? <div className="mt-6 border-t border-slate-200 pt-5 text-sm">{footer}</div> : null}
        </Card>
      </div>
    </div>
  );
}
