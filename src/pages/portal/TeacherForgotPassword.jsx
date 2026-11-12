import { useState } from "react";
import { Link } from "react-router-dom";
import { Mail } from "lucide-react";
import AuthLayout from "../../components/AuthLayout.jsx";
import { Alert, Button } from "../../components/ui.jsx";
import { Field, inputClasses } from "../../components/forms.jsx";
import { api } from "../../lib/api.js";

export default function TeacherForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api.teacherForgotPassword({ email: email.trim() });
      setSent(true);
    } catch (err) {
      setError(err.message || "Could not start the password reset. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      eyebrow="Teacher access"
      title="Reset your password"
      description="Enter the email address on your teacher account. We will send a single-use link that expires shortly."
      footer={
        <p className="text-slate-600">
          Remembered it?{" "}
          <Link to="/portal/teacher/login" className="font-semibold text-mint-700 hover:text-mint-800">
            Back to sign in
          </Link>
        </p>
      }
    >
      {sent ? (
        <div className="space-y-4">
          <Alert tone="success" title="Check your inbox">
            If an account exists for <span className="font-semibold">{email.trim()}</span>, a password
            reset link is on its way. It can be used once and expires soon.
          </Alert>
          <p className="text-xs leading-5 text-slate-500">
            During the pilot the server may print the link in its log instead of sending email. Ask the
            pilot administrator if it does not arrive.
          </p>
          <Link
            to="/portal/teacher/login"
            className="inline-flex w-full items-center justify-center rounded-xl bg-ink-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ink-800"
          >
            Back to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {error ? <Alert tone="error">{error}</Alert> : null}

          <Field id="email" label="Email">
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={inputClasses}
              placeholder="you@school.example"
            />
          </Field>

          <Button type="submit" variant="mint" size="lg" icon={Mail} loading={busy} className="w-full">
            Send reset link
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
