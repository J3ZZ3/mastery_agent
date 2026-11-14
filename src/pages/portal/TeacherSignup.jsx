import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { UserPlus } from "lucide-react";
import AuthLayout from "../../components/AuthLayout.jsx";
import { Alert, Button } from "../../components/ui.jsx";
import { Field, inputClasses } from "../../components/forms.jsx";
import { useAuth } from "../../context/AuthContext.jsx";

const MIN_PASSWORD = 8;

export default function TeacherSignup() {
  const { user, loading, teacherSignup } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirm: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  if (!loading && user?.role === "teacher") {
    return <Navigate to="/portal/teacher" replace />;
  }

  const validate = () => {
    const next = {};
    if (!form.name.trim()) next.name = "Enter your name.";
    if (!form.email.trim()) next.email = "Enter your email.";
    if (form.password.length < MIN_PASSWORD) next.password = `Use at least ${MIN_PASSWORD} characters.`;
    if (form.confirm !== form.password) next.confirm = "The passwords do not match.";
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    if (!validate()) return;

    setBusy(true);
    try {
      await teacherSignup({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
      });
      navigate("/portal/teacher", { replace: true });
    } catch (err) {
      setError(err.message || "Could not create your account. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      eyebrow="Teacher access"
      title="Create your account"
      description="One account manages all of your classes and rosters. Student accounts are created from inside a class."
      footer={
        <p className="text-slate-600">
          Already have an account?{" "}
          <Link to="/portal/teacher/login" className="font-semibold text-mint-700 hover:text-mint-800">
            Sign in
          </Link>
        </p>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error ? <Alert tone="error">{error}</Alert> : null}

        <Field id="name" label="Full name" error={fieldErrors.name}>
          <input
            id="name"
            type="text"
            autoComplete="name"
            required
            value={form.name}
            onChange={update("name")}
            className={inputClasses}
            placeholder="Ms Dlamini"
          />
        </Field>

        <Field id="email" label="Email" error={fieldErrors.email}>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={update("email")}
            className={inputClasses}
            placeholder="you@school.example"
          />
        </Field>

        <Field
          id="password"
          label="Password"
          hint={`At least ${MIN_PASSWORD} characters.`}
          error={fieldErrors.password}
        >
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

        <Field id="confirm" label="Confirm password" error={fieldErrors.confirm}>
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

        <Button type="submit" variant="mint" size="lg" icon={UserPlus} loading={busy} className="w-full">
          Create account
        </Button>

        <p className="text-center text-xs leading-5 text-slate-500">
          By creating an account you agree to the{" "}
          <Link to="/privacy" className="font-semibold text-mint-700 underline hover:text-mint-800">
            privacy notice
          </Link>
          . You will confirm guardian or school permission before creating a class.
        </p>
      </form>
    </AuthLayout>
  );
}
