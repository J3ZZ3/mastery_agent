import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import AuthLayout from "../../components/AuthLayout.jsx";
import { Alert, Spinner } from "../../components/ui.jsx";
import { api } from "../../lib/api.js";
import { useAuth } from "../../context/AuthContext.jsx";

export default function TeacherVerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const { refresh } = useAuth();
  const started = useRef(false);

  const [state, setState] = useState(token ? "verifying" : "missing");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;

    api
      .teacherVerifyEmail({ token })
      .then(async () => {
        setState("verified");
        // Refresh the session even when the link was opened signed out: it is
        // harmless, and it clears the dashboard banner when signed in.
        await refresh();
      })
      .catch((error) => {
        setState("error");
        setMessage(error.message || "This verification link is invalid or has expired.");
      });
  }, [token, refresh]);

  return (
    <AuthLayout
      eyebrow="Teacher access"
      title="Verify your email"
      description="Verifying your address lets the pilot contact you about your account and recover it safely."
      footer={
        <p className="text-slate-600">
          <Link to="/portal/teacher/login" className="font-semibold text-mint-700 hover:text-mint-800">
            Back to sign in
          </Link>
        </p>
      }
    >
      {state === "verifying" ? (
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          <Spinner />
          Verifying your email address…
        </div>
      ) : null}

      {state === "missing" ? (
        <div className="space-y-4">
          <Alert tone="error" title="This link is incomplete">
            The verification link is missing its token. Open the link from the email, or request a new one
            from your dashboard.
          </Alert>
          <Link
            to="/portal/teacher/login"
            className="inline-flex w-full items-center justify-center rounded-xl bg-ink-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ink-800"
          >
            Go to sign in
          </Link>
        </div>
      ) : null}

      {state === "verified" ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-mint-200 bg-mint-50 p-4">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-mint-700" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-mint-900">Email verified</p>
              <p className="mt-1 text-sm leading-6 text-mint-800">
                Your teacher account is confirmed. You can continue to your classes.
              </p>
            </div>
          </div>
          <Link
            to="/portal/teacher"
            className="inline-flex w-full items-center justify-center rounded-xl bg-ink-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ink-800"
          >
            Continue to my classes
          </Link>
        </div>
      ) : null}

      {state === "error" ? (
        <div className="space-y-4">
          <Alert tone="error" title="Could not verify this link">
            {message}
          </Alert>
          <p className="text-xs leading-5 text-slate-500">
            Links can only be used once and expire after a while. Sign in and use “Resend verification
            email” on your dashboard to get a fresh link.
          </p>
          <Link
            to="/portal/teacher/login"
            className="inline-flex w-full items-center justify-center rounded-xl bg-ink-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ink-800"
          >
            Go to sign in
          </Link>
        </div>
      ) : null}
    </AuthLayout>
  );
}
