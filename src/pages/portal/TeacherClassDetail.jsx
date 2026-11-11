import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  KeyRound,
  Link2,
  Plus,
  RefreshCw,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { api } from "../../lib/api.js";
import { useApp } from "../../context/AppContext.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { formatDate, relativeTime } from "../../lib/format.js";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Modal,
  SectionHeading,
  Spinner,
} from "../../components/ui.jsx";
import { Field, inputClasses } from "../../components/forms.jsx";
import CopyButton from "../../components/CopyButton.jsx";

export default function TeacherClassDetail() {
  const { classId } = useParams();
  const { notify } = useApp();
  const { refresh } = useAuth();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");

  const [pinInfo, setPinInfo] = useState(null);
  const [resettingId, setResettingId] = useState(null);

  const [removeTarget, setRemoveTarget] = useState(null);
  const [removing, setRemoving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.classDetail(classId));
      setError(null);
    } catch (err) {
      if (err.status === 401) {
        await refresh();
        return;
      }
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [classId, refresh]);

  useEffect(() => {
    load();
  }, [load]);

  const submitAdd = async (event) => {
    event?.preventDefault();
    setAddError("");
    if (!newName.trim()) {
      setAddError("Enter the student's name.");
      return;
    }

    setAdding(true);
    try {
      const result = await api.addStudent(classId, { displayName: newName.trim() });
      setAddOpen(false);
      setNewName("");
      setPinInfo({ ...result, kind: "created" });
      notify(`${result.student.displayName} added to the roster.`, "success");
      await load();
    } catch (err) {
      setAddError(err.message || "Could not add the student.");
    } finally {
      setAdding(false);
    }
  };

  const resetPin = async (student) => {
    setResettingId(student.id);
    try {
      const result = await api.resetStudentPin(classId, student.id);
      setPinInfo({ ...result, kind: "reset" });
      await load();
    } catch (err) {
      notify(err.message || "Could not reset the PIN.", "error");
    } finally {
      setResettingId(null);
    }
  };

  const confirmRemove = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      await api.removeStudent(classId, removeTarget.id);
      notify(`${removeTarget.displayName} removed from the class.`, "success");
      setRemoveTarget(null);
      await load();
    } catch (err) {
      notify(err.message || "Could not remove the student.", "error");
    } finally {
      setRemoving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-3 text-sm text-slate-600">
        <Spinner />
        Loading the roster…
      </div>
    );
  }

  if (error?.status === 404) {
    return (
      <Card className="mx-auto max-w-lg p-8 text-center">
        <h1 className="text-xl font-bold">Class not found</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          This class does not exist, or it belongs to another teacher.
        </p>
        <Link
          to="/portal/teacher"
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-ink-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ink-800"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to classes
        </Link>
      </Card>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Alert tone="error" title="Could not load this class">
          {error.message}
        </Alert>
        <Button variant="secondary" icon={RefreshCw} onClick={load}>
          Try again
        </Button>
      </div>
    );
  }

  const classroom = data.class;
  const students = data.students;
  const joinLink = `${window.location.origin}/portal/student`;

  return (
    <div className="space-y-7">
      <Link
        to="/portal/teacher"
        className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-ink-950"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        All classes
      </Link>

      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Class roster</p>
            <h1 className="mt-1 text-2xl font-bold sm:text-3xl">{classroom.name}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {classroom.subject}
              {classroom.grade ? ` · Grade ${classroom.grade}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <CopyButton value={classroom.joinCode} label="Copy class code" />
            <Button variant="mint" icon={UserPlus} onClick={() => setAddOpen(true)}>
              Add student
            </Button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Class code</p>
            <p className="mt-1 font-mono text-2xl font-bold tracking-[0.24em] text-ink-950">
              {classroom.joinCode}
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Students enter this code with their name and PIN.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Join link</p>
            <p className="mt-1 truncate font-mono text-sm text-ink-950">{joinLink}</p>
            <div className="mt-2">
              <CopyButton value={joinLink} label="Copy join link" />
            </div>
          </div>
        </div>
      </Card>

      <SectionHeading
        title={`Roster · ${students.length}`}
        description="Each student gets a one-time PIN. If they lose it, reset the PIN and give them the new one."
        action={
          <Button variant="secondary" icon={Plus} onClick={() => setAddOpen(true)}>
            Add student
          </Button>
        }
      />

      {students.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No students yet"
          description="Add each student by name. The server returns a 4-digit PIN once — share it with that student."
          action={
            <Button variant="mint" icon={UserPlus} onClick={() => setAddOpen(true)}>
              Add the first student
            </Button>
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-slate-200">
            {students.map((student) => (
              <li
                key={student.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={student.displayName} accent="sky" size="sm" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink-950">{student.displayName}</p>
                    <p className="text-[11px] text-slate-500">
                      Added {formatDate(student.createdAt)} ·{" "}
                      {student.lastSeenAt ? `Last seen ${relativeTime(student.lastSeenAt)}` : "Never signed in"}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={student.lastSeenAt ? "mint" : "slate"}>
                    {student.lastSeenAt ? "Active" : "Not joined"}
                  </Badge>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={KeyRound}
                    loading={resettingId === student.id}
                    onClick={() => resetPin(student)}
                  >
                    Reset PIN
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    icon={Trash2}
                    onClick={() => setRemoveTarget(student)}
                  >
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Modal
        open={addOpen}
        onClose={() => (adding ? null : setAddOpen(false))}
        title="Add a student"
        description="Use the name the student will recognise. It must be unique in this class."
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddOpen(false)} disabled={adding}>
              Cancel
            </Button>
            <Button variant="mint" icon={UserPlus} onClick={submitAdd} loading={adding}>
              Add student
            </Button>
          </>
        }
      >
        <form onSubmit={submitAdd} className="space-y-4" noValidate>
          {addError ? <Alert tone="error">{addError}</Alert> : null}
          <Field id="studentName" label="Student name">
            <input
              id="studentName"
              type="text"
              required
              maxLength={80}
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              className={inputClasses}
              placeholder="Thabo Mokoena"
            />
          </Field>
          <p className="text-xs leading-5 text-slate-500">
            The PIN is generated by the server and shown once after the student is created.
          </p>
        </form>
      </Modal>

      <Modal
        open={Boolean(pinInfo)}
        onClose={() => setPinInfo(null)}
        title={pinInfo?.kind === "created" ? "Student added" : "New PIN"}
        description="This PIN is shown once. Give it to the student now; it cannot be read again."
        footer={
          <Button variant="mint" onClick={() => setPinInfo(null)}>
            Done
          </Button>
        }
      >
        {pinInfo ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              {pinInfo.kind === "created" ? "PIN for" : "New PIN for"}{" "}
              <span className="font-semibold text-ink-950">{pinInfo.student.displayName}</span>
            </p>
            <div className="rounded-xl border border-mint-200 bg-mint-50 p-5 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-mint-800">
                4-digit PIN
              </p>
              <p className="mt-1 font-mono text-4xl font-bold tracking-[0.35em] text-ink-950">
                {pinInfo.pin}
              </p>
            </div>
            <div className="flex justify-center">
              <CopyButton value={pinInfo.pin} label="Copy PIN" />
            </div>
            <p className="text-xs leading-5 text-slate-500">
              The student signs in at <span className="font-mono">{joinLink}</span> with the class code{" "}
              <span className="font-mono font-semibold">{classroom.joinCode}</span>, their name and this PIN.
            </p>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(removeTarget)}
        onClose={() => (removing ? null : setRemoveTarget(null))}
        title="Remove student"
        description="This removes the student from the roster and deletes their PIN. Their learning history is not affected in this milestone."
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoveTarget(null)} disabled={removing}>
              Cancel
            </Button>
            <Button variant="danger" icon={Trash2} onClick={confirmRemove} loading={removing}>
              Remove student
            </Button>
          </>
        }
      >
        <p className="text-sm leading-6 text-slate-600">
          Remove <span className="font-semibold text-ink-950">{removeTarget?.displayName}</span> from{" "}
          <span className="font-semibold text-ink-950">{classroom.name}</span>?
        </p>
      </Modal>

      <p className="flex items-start gap-2 text-xs leading-5 text-slate-500">
        <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
        Share only the class code and each student's own PIN. A student should never use another student's PIN.
      </p>
    </div>
  );
}
