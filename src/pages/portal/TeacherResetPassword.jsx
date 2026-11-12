import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { KeyRound } from "lucide-react";
import AuthLayout from "../../components/AuthLayout.jsx";
import { Alert, Button } from "../../components/ui.jsx";
import { Field, inputClasses } from "../../components/forms.jsx";
import { api } from "../../lib/api.js";
import { useAuth } from "../../context/AuthContext.jsx";

const MIN_PASSWORD = 8;

export default function TeacherResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const { refresh } = useAuth();

  const [form, setForm] = useState({ password: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setError("");

    if (form.password.length < MIN_PASSWORD) {
      setError(`Use at least ${MIN_PASSWORD} characters.`);
      return;
    }
    if (form.password !== form.confirm) {
      setError("The passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      await api.teacherResetPassword({ token, password: form.password });
      await refresh();
      setDone(true);
    } catch (err) {
      setError(err.message || "Could not reset your password. Please request a new link.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      eyebrow="Teacher access"
      title="Choose a new password"
      description="Resetting your password signs you out of every device. Use the new password from now on."
      footer={
        <p className="text-slate-600">
          Need a new link?{" "}
          <Link
            to="/portal/teacher/forgot-password"
            className="font-semibold text-mint-700 hover:text-mint-800"
          >
            Request another reset email
          </Link>
        </p>
      }
    >
      {!token ? (
        <div className="space-y-4">
          <Alert tone="error" title="This link is incomplete">
            The reset link is missing its token. Request a new email and open the link from there.
          </Alert>
          <Link
            to="/portal/teacher/forgot-password"
            className="inline-flex w-full items-center justify-center rounded-xl bg-ink-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ink-800"
          >
            Request a reset link
          </Link>
        </div>
      ) : done ? (
        <div className="space-y-4">
          <Alert tone="success" title="Password updated">
            Your password has been changed and every existing teacher session was signed out. Sign in with
            the new password.
          </Alert>
          <Link
            to="/portal/teacher/login"
            className="inline-flex w-full items-center justify-center rounded-xl bg-ink-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ink-800"
          >
            Sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {error ? <Alert tone="error">{error}</Alert> : null}

          <Field id="password" label="New password" hint={`At least ${MIN_PASSWORD} characters.`}>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              value={form.password}
              onChange={update("password")}
              className={inputClasses}
              placeholder="Choose a password"
            />
          </Field>

          <Field id="confirm" label="Confirm new password">
            <input
              id="confirm"
              type="password"
              autoComplete="new-password"
              required
              value={form.confirm}
              onChange={update("confirm")}
              className={inputClasses}
              placeholder="Repeat your password"
            />
          </Field>

          <Button type="submit" variant="mint" size="lg" icon={KeyRound} loading={busy} className="w-full">
            Update password
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
