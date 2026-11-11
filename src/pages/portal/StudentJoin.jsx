import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { LogIn } from "lucide-react";
import AuthLayout from "../../components/AuthLayout.jsx";
import { Alert, Button } from "../../components/ui.jsx";
import { Field, inputClasses } from "../../components/forms.jsx";
import { useAuth } from "../../context/AuthContext.jsx";

export default function StudentJoin() {
  const { user, loading, studentLogin } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ joinCode: "", displayName: "", pin: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const update = (key, transform = (value) => value) => (event) =>
    setForm((current) => ({ ...current, [key]: transform(event.target.value) }));

  if (!loading && user) {
    return (
      <Navigate
        to={user.role === "teacher" ? "/portal/teacher" : "/portal/student/home"}
        replace
      />
    );
  }

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await studentLogin({
        joinCode: form.joinCode.trim().toUpperCase(),
        displayName: form.displayName.trim(),
        pin: form.pin.trim(),
      });
      navigate("/portal/student/home", { replace: true });
    } catch (err) {
      setError(
        err.status === 401
          ? "That class code, name or PIN did not match. Check with your teacher and try again."
          : err.message || "Could not join the class. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      eyebrow="Student access"
      title="Join your class"
      description="Your teacher will give you a class code and a 4-digit PIN. Use the same name your teacher added to the roster."
      footer={
        <p className="text-slate-600">
          Teacher?{" "}
          <Link to="/portal/teacher/login" className="font-semibold text-mint-700 hover:text-mint-800">
            Sign in to your account
          </Link>
        </p>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error ? <Alert tone="error">{error}</Alert> : null}

        <Field id="joinCode" label="Class code" hint="Six letters and numbers, e.g. K7M2QP.">
          <input
            id="joinCode"
            type="text"
            inputMode="text"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            required
            maxLength={12}
            value={form.joinCode}
            onChange={update("joinCode", (value) => value.toUpperCase())}
            className={`${inputClasses} font-mono text-lg tracking-[0.2em] uppercase`}
            placeholder="ABC123"
          />
        </Field>

        <Field id="displayName" label="Your name" hint="Use the name your teacher added to the class.">
          <input
            id="displayName"
            type="text"
            autoComplete="name"
            required
            maxLength={80}
            value={form.displayName}
            onChange={update("displayName")}
            className={inputClasses}
            placeholder="Thabo Mokoena"
          />
        </Field>

        <Field id="pin" label="4-digit PIN" hint="Your teacher gives you this once. Ask for a reset if you lose it.">
          <input
            id="pin"
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            maxLength={4}
            pattern="[0-9]{4}"
            value={form.pin}
            onChange={update("pin", (value) => value.replace(/\D/g, "").slice(0, 4))}
            className={`${inputClasses} font-mono text-lg tracking-[0.4em]`}
            placeholder="••••"
          />
        </Field>

        <Button type="submit" variant="mint" size="lg" icon={LogIn} loading={busy} className="w-full">
          Join class
        </Button>
      </form>
    </AuthLayout>
  );
}
