import { Link } from "react-router-dom";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Card } from "../../components/ui.jsx";

const sections = [
  {
    title: "Who is responsible for the data",
    body: (
      <>
        Your teacher or school decides why learner information is collected and how it is used. In POPIA
        terms they are the responsible party. MASTERY is the pilot operator that provides the software and
        processes the data on the school&apos;s instruction.
      </>
    ),
  },
  {
    title: "What we collect",
    body: (
      <>
        For a teacher: name, email address and a hashed password. For a student: display name, a hashed
        4-digit PIN, class membership, learning answers, scores, agent events and timestamps. We do not ask
        students for an email address, phone number, ID number or home address.
      </>
    ),
  },
  {
    title: "Why we collect it",
    body: (
      <>
        To sign a student into the correct class, run the six-agent learning cycle, show the student their
        own progress, and give the teacher evidence and a recommended next step. We do not use learner data
        for advertising or sell it.
      </>
    ),
  },
  {
    title: "Consent and minors",
    body: (
      <>
        Learners are minors. Before creating a class, the teacher must confirm that they have the school or
        guardian permission required to create student accounts and that this notice has been shared with
        learners or their guardians. A guardian may ask the teacher to correct or erase a learner&apos;s
        information at any time.
      </>
    ),
  },
  {
    title: "Who can see it",
    body: (
      <>
        A student sees only their own class, profile and learning sessions. A teacher sees only the classes
        they own. Other teachers and other students cannot read the data. Server operators can access the
        database for support and maintenance.
      </>
    ),
  },
  {
    title: "AI provider",
    body: (
      <>
        When an AI provider is enabled, workflow content (including the student&apos;s answers and the generated
        feedback) is sent to that provider so it can produce the lesson and insight. Scores, answer keys and
        the mastery threshold remain computed by the server.
      </>
    ),
  },
  {
    title: "How long we keep it",
    body: (
      <>
        The pilot keeps class and learning data until the teacher deletes the class, deletes a student, or
        erases a student&apos;s learning history. A teacher can rotate a class code if it was shared too
        widely. Session cookies expire: student sessions after 12 hours by default and teacher sessions
        after 30 days.
      </>
    ),
  },
  {
    title: "Your rights",
    body: (
      <>
        You may ask for access to the information held about you or your child, ask for a correction, or ask
        for the information to be erased. Teachers can erase a single student&apos;s learning history or
        delete a whole class permanently from the class page. You may also complain to the Information
        Regulator of South Africa.
      </>
    ),
  },
  {
    title: "Security",
    body: (
      <>
        Passwords and PINs are stored only as scrypt hashes. Session tokens are stored as SHA-256 hashes in
        an HttpOnly, SameSite cookie. State-changing API requests are checked against trusted browser
        origins. Use only the learner information the pilot actually needs.
      </>
    ),
  },
];

export default function PrivacyNotice() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link to="/portal" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-mint-500 text-sm font-black text-ink-950">
              M
            </span>
            <span>
              <span className="block text-sm font-black tracking-[0.14em] text-ink-950">MASTERY</span>
              <span className="block text-[10px] font-medium text-slate-500">Classroom pilot</span>
            </span>
          </Link>
          <Link
            to="/portal"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 transition hover:text-ink-950"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Back to portal
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
        <p className="eyebrow">Privacy notice</p>
        <h1 className="mt-2 text-3xl font-bold leading-tight sm:text-4xl">
          How the classroom pilot handles learner information
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
          This notice explains what MASTERY stores for the classroom pilot, why it is stored, who can see
          it, and how it can be erased. It is written for teachers, learners and guardians in South Africa
          under the Protection of Personal Information Act (POPIA).
        </p>

        <div className="mt-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <p>
            This is a pilot notice, not legal advice. Before using real learner data, the school or pilot
            operator should review it, add its contact details and information officer, and confirm its
            guardian-consent process.
          </p>
        </div>

        <div className="mt-8 space-y-4">
          {sections.map((section) => (
            <Card key={section.title} className="p-5 sm:p-6">
              <h2 className="text-base font-bold text-ink-950">{section.title}</h2>
              <p className="mt-2 text-sm leading-7 text-slate-600">{section.body}</p>
            </Card>
          ))}
        </div>

        <Card className="mt-4 p-5 sm:p-6">
          <h2 className="text-base font-bold text-ink-950">Contact</h2>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            Contact your teacher or the school&apos;s information officer first, because the school controls
            the data. The pilot operator must publish a working privacy contact before real learner data is
            added.
          </p>
        </Card>

        <p className="mt-8 text-xs leading-5 text-slate-500">
          Last updated for the classroom pilot. If this notice changes, the operator should tell teachers and
          guardians before the change applies.
        </p>
      </main>
    </div>
  );
}
