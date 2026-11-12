import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { LogIn } from "lucide-react";
import AuthLayout from "../../components/AuthLayout.jsx";
import { Alert, Button } from "../../components/ui.jsx";
import { Field, inputClasses } from "../../components/forms.jsx";
import { useAuth } from "../../context/AuthContext.jsx";

export default function TeacherLogin() {
  const { user, loading, teacherLogin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState({ email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  if (!loading && user?.role === "teacher") {
    return <Navigate to="/portal/teacher" replace />;
  }

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await teacherLogin({ email: form.email.trim(), password: form.password });
      const from = location.state?.from;
      navigate(from?.startsWith("/portal/teacher") ? from : "/portal/teacher", { replace: true });
    } catch (err) {
      setError(err.message || "Could not sign in. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      eyebrow="Teacher access"
      title="Sign in"
      description="Use the email and password you used to create your teacher account."
      footer={
        <div className="space-y-2 text-slate-600">
          <p>
            New to the pilot?{" "}
            <Link to="/portal/teacher/signup" className="font-semibold text-mint-700 hover:text-mint-800">
              Create a teacher account
            </Link>
          </p>
          <p>
            Student?{" "}
            <Link to="/portal/student" className="font-semibold text-mint-700 hover:text-mint-800">
              Join with a class code
            </Link>
          </p>
        </div>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error ? <Alert tone="error">{error}</Alert> : null}

        <Field id="email" label="Email">
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

        <Field id="password" label="Password">
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={form.password}
            onChange={update("password")}
            className={inputClasses}
            placeholder="Your password"
          />
        </Field>

        <div className="flex justify-end">
          <Link
            to="/portal/teacher/forgot-password"
            className="text-xs font-semibold text-mint-700 hover:text-mint-800"
          >
            Forgot password?
          </Link>
        </div>

        <Button type="submit" variant="mint" size="lg" icon={LogIn} loading={busy} className="w-full">
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}
