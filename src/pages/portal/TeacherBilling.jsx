import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  Mail,
  RefreshCw,
  School,
  Users,
} from "lucide-react";
import { api } from "../../lib/api.js";
import { useApp } from "../../context/AppContext.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import {
  Alert,
  Badge,
  Button,
  Card,
  ProgressBar,
  SectionHeading,
  Spinner,
  StatCard,
} from "../../components/ui.jsx";
import { Field, inputClasses } from "../../components/forms.jsx";
import { formatDate, formatDateTime } from "../../lib/format.js";

export default function TeacherBilling() {
  const { notify } = useApp();
  const { refresh } = useAuth();
  const navigate = useNavigate();

  const [billing, setBilling] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.billing();
      setBilling(data.billing);
      setError(null);
    } catch (err) {
      if (err.status === 401) {
        await refresh();
        navigate("/portal/teacher/login", { replace: true });
        return;
      }
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [navigate, refresh]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (event) => {
    event.preventDefault();
    setSending(true);
    try {
      const data = await api.requestUpgrade({ note: note.trim() });
      setBilling(data.billing);
      notify("Upgrade request sent. The pilot coordinator will be in touch.", "success");
    } catch (err) {
      notify(err.message || "Could not send the upgrade request.", "error");
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-3 text-sm text-slate-500">
        <Spinner />
        Loading your plan…
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Alert tone="error" title="Could not load your plan">
          {error.message}
        </Alert>
        <Button variant="secondary" icon={RefreshCw} onClick={load}>
          Try again
        </Button>
      </div>
    );
  }

  if (!billing) return null;

  const isPaid = billing.plan === "paid";
  const daysRemaining = billing.trialDaysRemaining;
  const pilotLimits = billing.limitsByPlan?.pilot || billing.limits;
  const paidLimits = billing.limitsByPlan?.paid || billing.limits;
  const classPercent =
    billing.limits.maxClasses > 0
      ? Math.round((billing.usage.classes / billing.limits.maxClasses) * 100)
      : 0;
  const endingSoon =
    billing.trialActive && !isPaid && daysRemaining !== null && daysRemaining <= 7;

  return (
    <div className="space-y-7">
      <Link
        to="/portal/teacher"
        className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-ink-950"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        All classes
      </Link>

      <SectionHeading
        eyebrow="Plan"
        title="Pilot access and billing"
        description="The pilot is free while we work with your school. When it ends, existing classes keep working; upgrading unlocks new classes, more students and continued support."
        action={
          <Badge tone={isPaid ? "mint" : "sky"} icon={isPaid ? BadgeCheck : CreditCard}>
            {isPaid ? "Paid plan" : "Free pilot"}
          </Badge>
        }
      />

      {!billing.trialActive ? (
        <Alert tone="warning" title="Your free pilot has ended">
          <div className="space-y-2">
            <p>
              Your classes, rosters and learning history are safe and students can keep using their
              current classes. Creating new classes and adding students is paused until the account is
              upgraded.
            </p>
            <p className="text-xs">
              Send the request below and the pilot coordinator will confirm pricing and activate the
              paid plan.
            </p>
          </div>
        </Alert>
      ) : null}

      {endingSoon ? (
        <Alert tone="info" title={`${daysRemaining} ${daysRemaining === 1 ? "day" : "days"} left in your pilot`}>
          Nothing changes automatically. Request an upgrade before the pilot ends to keep adding
          classes and students without interruption.
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Plan"
          value={isPaid ? "Paid" : "Pilot"}
          hint={isPaid ? "Active subscription" : "No card required during the pilot"}
          icon={CreditCard}
          tone={isPaid ? "mint" : "sky"}
        />
        <StatCard
          label="Trial"
          value={isPaid ? "No expiry" : daysRemaining === null ? "Open" : `${daysRemaining}d`}
          hint={
            isPaid
              ? "Your plan stays active while billing is current."
              : billing.trialEndsAt
                ? `Ends ${formatDate(billing.trialEndsAt)}`
                : "No trial end date is set."
          }
          icon={CalendarClock}
          tone={endingSoon || !billing.trialActive ? "amber" : "slate"}
        />
        <StatCard
          label="Active classes"
          value={`${billing.usage.classes} / ${billing.limits.maxClasses}`}
          hint="Archived classes do not count."
          icon={School}
          tone="mint"
        />
        <StatCard
          label="Students"
          value={billing.usage.students}
          hint={`Up to ${billing.limits.maxStudentsPerClass} per class`}
          icon={Users}
          tone="sky"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <Card className="space-y-5 p-5">
          <div>
            <h2 className="text-lg font-bold">Usage on this plan</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Limits keep the pilot predictable while still giving every class room to work.
            </p>
          </div>

          <ProgressBar
            label={`Active classes · ${billing.usage.classes} of ${billing.limits.maxClasses}`}
            value={classPercent}
            tone={classPercent >= 100 ? "amber" : "mint"}
            showValue
          />

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-ink-950">What the pilot includes</p>
            <ul className="mt-2 space-y-1.5 text-sm leading-6 text-slate-600">
              <li className="flex gap-2">
                <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-mint-700" aria-hidden="true" />
                Up to {pilotLimits.maxClasses} active classes and {pilotLimits.maxStudentsPerClass}{" "}
                students per class.
              </li>
              <li className="flex gap-2">
                <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-mint-700" aria-hidden="true" />
                Full learning cycles, teacher insight, CSV import and printable PIN slips.
              </li>
              <li className="flex gap-2">
                <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-mint-700" aria-hidden="true" />
                Your data stays available if the trial ends; nothing is deleted.
              </li>
            </ul>
          </div>

          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-sm font-semibold text-ink-950">Paid plan</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Up to {paidLimits.maxClasses} active classes and {paidLimits.maxStudentsPerClass}{" "}
              students per class, with priority support and continued access for the school year.
            </p>
          </div>
        </Card>

        <Card className="space-y-4 p-5">
          <div>
            <h2 className="text-lg font-bold">Request an upgrade</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Tell us a little about your school so we can confirm pricing and activate the plan. No
              card is charged from this page.
            </p>
          </div>

          {billing.upgradeRequestedAt ? (
            <Alert tone="success" title="Request received">
              We recorded your request on {formatDateTime(billing.upgradeRequestedAt)}. The pilot
              coordinator will contact you. You can send another note below if something changed.
            </Alert>
          ) : null}

          <form onSubmit={submit} className="space-y-4">
            <Field
              id="billingNote"
              label="Anything we should know?"
              hint="Optional: school name, number of classes, preferred start date."
            >
              <textarea
                id="billingNote"
                rows={4}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className={inputClasses}
                placeholder="We would like to continue with four Grade 9 classes next term."
              />
            </Field>

            <Button
              type="submit"
              variant="mint"
              size="lg"
              icon={Mail}
              loading={sending}
              className="w-full"
            >
              {billing.upgradeRequestedAt ? "Send another request" : "Request an upgrade"}
            </Button>
          </form>

          {billing.contactEmail ? (
            <p className="text-xs leading-5 text-slate-500">
              Prefer email? Write to{" "}
              <a
                href={`mailto:${billing.contactEmail}`}
                className="font-semibold text-mint-700 underline hover:text-mint-800"
              >
                {billing.contactEmail}
              </a>
              .
            </p>
          ) : null}

          <p className="text-xs leading-5 text-slate-500">
            The plan is activated by the pilot coordinator, so nothing is charged automatically and
            your current classes are never interrupted.
          </p>
        </Card>
      </div>
    </div>
  );
}
